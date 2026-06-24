import type { AnyIntakeDraft, IntakeDraftKind, IntakeFieldConfidence } from "@/lib/intake-draft";

export interface IntakeAiPromptInput {
  draft: AnyIntakeDraft;
  visibleTextHint?: string;
  userNote?: string;
  maxNameCandidates?: number;
}

export interface IntakeAiRecognitionField {
  value: unknown;
  confidence: IntakeFieldConfidence;
  needsReview: boolean;
  reason?: string;
}

export interface IntakeAiRecognitionResult {
  mode: "intake_recognition";
  kind: IntakeDraftKind;
  fields: Record<string, IntakeAiRecognitionField>;
  warnings: string[];
  shouldRunBuyBeforeAssessment: false;
}

export function buildIntakeRecognitionSystemPrompt(): string {
  return [
    "你是衣橱 App 的录入识别助手，只负责把用户主动选择的图片整理成可校对草稿。",
    "这是录入识别，不是买前评估；不要判断是否值得买，不要输出购买建议。",
    "不要自动保存，不要自动创建未知衣物，不要触发 AI 试穿或图片生成。",
    "只能根据图片可见内容、用户提供文字和本地草稿补全字段。",
    "商品名称、价格只在图片或用户文字中清楚可见时提取；看不清就留空并标记 needsReview。",
    "不能编造价格、链接、材质、用户身份、职业、身材或消费水平。",
    "颜色、品类、季节、风格可以保守判断；低置信度必须标记 needsReview。",
    "如果本地主色低可信，可以补颜色，但必须写明“AI判断，请确认”。",
    "透明底失败不阻塞录入；不要要求用普通视觉模型修图或抠图。",
    "输出必须是严格 JSON，不要 Markdown，不要代码块，不要 JSON 外解释。",
  ].join("\n");
}

export function buildIntakeRecognitionPrompt(input: IntakeAiPromptInput): string {
  const kindLabel = input.draft.kind === "wishlist"
    ? "种草录入"
    : input.draft.kind === "outfit"
      ? "套装录入"
      : "单品录入";
  const rules = getKindRules(input.draft.kind);
  return [
    `请把这次「${kindLabel}」整理成用户可校对的草稿字段。`,
    "",
    "【边界】",
    "1. 只做录入识别，不做买前评估。",
    "2. 不保存数据，不创建未知单品，不调用试穿。",
    "3. 所有不确定字段都 needsReview=true。",
    "",
    "【本地草稿】",
    JSON.stringify(simplifyDraft(input.draft), null, 2),
    input.visibleTextHint ? "\n【图片可见文字】" : "",
    input.visibleTextHint ?? "",
    input.userNote ? "\n【用户补充】" : "",
    input.userNote ?? "",
    "",
    "【识别规则】",
    ...rules.map((rule, index) => `${index + 1}. ${rule}`),
    `${rules.length + 1}. 最多给出 ${input.maxNameCandidates ?? 3} 个名称候选，不能为了凑数编造。`,
    `${rules.length + 2}. 看不清、被遮挡、没有文字依据时留空或用本地默认值，并说明 reason。`,
    "",
    "【JSON 输出】",
    "{",
    '  "mode": "intake_recognition",',
    `  "kind": "${input.draft.kind}",`,
    '  "fields": {',
    '    "fieldName": {',
    '      "value": "字段值；数组字段输出数组；看不清的商品字段输出空字符串或 null",',
    '      "confidence": "high" | "medium" | "low" | "unknown",',
    '      "needsReview": true,',
    '      "reason": "不超过40个中文字符"',
    "    }",
    "  },",
    '  "warnings": ["最多5条识别限制"],',
    '  "shouldRunBuyBeforeAssessment": false',
    "}",
  ].filter(Boolean).join("\n");
}

export function parseIntakeRecognitionJson(text: string): IntakeAiRecognitionResult {
  const raw = JSON.parse(extractFirstJsonObject(text) ?? text) as IntakeAiRecognitionResult;
  if (raw.mode !== "intake_recognition") throw new Error("AI 返回模式不正确");
  if (raw.shouldRunBuyBeforeAssessment !== false) throw new Error("录入识别不能触发买前评估");
  if (!raw.fields || typeof raw.fields !== "object") throw new Error("AI 返回字段为空");
  return raw;
}

function getKindRules(kind: IntakeDraftKind): string[] {
  if (kind === "wishlist") {
    return [
      "种草图片可能是商品图或商品截图；商品截图要保留价格和文案语境，不默认透明底。",
      "商品名称、价格只在图片可见时提取，不能猜。",
      "保存种草时不要自动跑买前评估；买前评估只能由用户在详情页手动触发。",
      "补全分类、颜色、季节、风格、场景、材质时必须保守。",
    ];
  }
  if (kind === "outfit") {
    return [
      "套装图默认保留语境，不透明底。",
      "可以描述图中未知单品，但不能静默创建正式衣物。",
      "只能引用本地草稿里已有的真实 itemIds。",
      "补全套装名称、适合场景、不适合场景、缺失单品和替换建议时必须可校对。",
    ];
  }
  return [
    "单品录入只补全衣物字段：名称、品类、颜色、季节、风格、场景、材质、温度、正式度、保暖度和版型。",
    "不要创建套装，不要引用不存在的衣物 ID。",
    "本地主色高可信时保留本地主色，AI 只补颜色名称、辅助色和语义说明。",
  ];
}

function simplifyDraft(draft: AnyIntakeDraft): Record<string, unknown> {
  const entries = Object.entries(draft)
    .filter(([key]) => !["imageDataUrl", "sourceImageDataUrl", "croppedImageDataUrl", "thumbnailDataUrl", "transparentImageDataUrl"].includes(key))
    .map(([key, value]) => [key, simplifyValue(value)]);
  return Object.fromEntries(entries);
}

function simplifyValue(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if ("source" in value && "confidence" in value && "value" in value) {
    const field = value as { value: unknown; source: unknown; confidence: unknown; needsReview?: unknown; reason?: unknown };
    return {
      value: field.value,
      source: field.source,
      confidence: field.confidence,
      needsReview: field.needsReview,
      reason: field.reason,
    };
  }
  if (Array.isArray(value)) return value.map(simplifyValue);
  return value;
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return text.slice(start, end + 1);
}
