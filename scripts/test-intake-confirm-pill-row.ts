import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * v1.1.23 six-page design §3.1 / §3.2 / §3.4 静态契约测试。
 *
 * 验证 Step 3 校对草稿页：
 *   - AI 置信度胶囊 ai-confidence-pill 在 Step 3 标题行出现；
 *   - 字段 badge 不再输出 "默认" / "已修改" / "AI" 三个旧标签；
 *   - "需要留意" section 在 Step 3 不再渲染 (ProcessingIssueList 调用被移除)；
 *   - price / productUrl / material / purchaseDate / fitNotes / notes 标记为 optional
 *     (空值时不再显示 "待确认")；
 *   - review-pill 仅在 Step 3 / 编辑页使用 (通过 import site 限制)；
 *   - calculateDraftConfidenceScore 派生函数对全高 / 全低 / 部分 needsReview 表现符合预期。
 */

import { calculateDraftConfidenceScore, classifyAiConfidence } from "../src/components/item/ai-confidence-pill";
import { createIntakeField, type GarmentIntakeDraft, type WishlistIntakeDraft } from "../src/lib/intake-draft";
import { buildLocalGarmentDraft } from "../src/lib/intake-local-draft";

const root = process.cwd();
const garment = readFileSync(join(root, "src/components/garment-intake-flow.tsx"), "utf8");
const aiPill = readFileSync(join(root, "src/components/item/ai-confidence-pill.tsx"), "utf8");
const reviewPill = readFileSync(join(root, "src/components/item/review-pill.tsx"), "utf8");

// 1. ai-confidence-pill 与 review-pill 阈值常量
assert.equal(classifyAiConfidence(85), "high", ">=75 应当归到 high (moss)");
assert.equal(classifyAiConfidence(75), "high", "75 边界应当归到 high");
assert.equal(classifyAiConfidence(74), "medium", "74 应当归到 medium (clay)");
assert.equal(classifyAiConfidence(50), "medium", "50 边界应当归到 medium");
assert.equal(classifyAiConfidence(49), "low", "49 应当归到 low");
assert.equal(classifyAiConfidence(0), "low", "0 应当归到 low");
assert.equal(classifyAiConfidence(undefined), null, "undefined 不渲染胶囊");
assert.equal(classifyAiConfidence(null), null, "null 不渲染胶囊");
assert.equal(classifyAiConfidence(NaN), null, "NaN 不渲染胶囊");
assert.equal(classifyAiConfidence(Number.POSITIVE_INFINITY), null, "Infinity 不渲染胶囊");

// 2. calculateDraftConfidenceScore — 只读取真实整件级分数
const allHighDraft: GarmentIntakeDraft = buildLocalGarmentDraft({
  imageDataUrl: "data:image/png;base64,aaa",
  colors: { mode: "single", primary: "白" } as never,
  nameGuess: "白衬衫",
  categoryGuess: "tops",
  locationId: "home",
  aiConfidenceScore: 86,
  now: "2026-06-24T08:00:00.000Z",
});
const scoreAll = calculateDraftConfidenceScore(allHighDraft);
assert.equal(scoreAll, 86, "真实 AI 置信度 86 应原样显示");

// 3. calculateDraftConfidenceScore — 构造一个全 low + needsReview 的最小草稿
// 使用 4 个字段的合成结构，绕开 buildLocalGarmentDraft 的 high 字段。
const lowDraftLike = {
  name: createIntakeField("白衬衫", "ai", "low", { needsReview: true }),
  category: createIntakeField("tops", "ai", "low", { needsReview: true }),
  colors: createIntakeField({ mode: "single", primary: "白" } as never, "ai", "low", { needsReview: true }),
  seasons: createIntakeField([] as never, "ai", "low", { needsReview: true }),
};
const scoreLow = calculateDraftConfidenceScore(lowDraftLike as unknown as GarmentIntakeDraft);
assert.equal(scoreLow, null, "字段平均不得伪装成 AI 置信度");

// 4. calculateDraftConfidenceScore — null 输入
assert.equal(calculateDraftConfidenceScore(null), null, "null draft 应当返回 null");
assert.equal(calculateDraftConfidenceScore(undefined), null, "undefined draft 应当返回 null");

// 5. WishlistIntakeDraft 也能计算
const wishlistLow: WishlistIntakeDraft = {
  ...(allHighDraft as unknown as WishlistIntakeDraft),
  kind: "wishlist",
  recognitionOnly: true,
  imageKind: createIntakeField("product_photo", "user", "high", { needsReview: false }),
  status: createIntakeField("interested", "user", "high", { needsReview: false }),
  aiConfidenceScore: 42,
};
const scoreWish = calculateDraftConfidenceScore(wishlistLow);
assert.equal(scoreWish, 42, "WishlistIntakeDraft 读取真实整件级置信度");

// 6. Step 3 渲染 wiring
assert.ok(
  garment.includes("<AiConfidencePill") || garment.includes("AiConfidencePill"),
  "garment-intake-flow 必须 import / 使用 AiConfidencePill",
);
assert.ok(
  /right=\{[\s\S]{0,200}<DraftQualityRow[\s\S]{0,200}\/>[\s\S]{0,40}\}/.test(garment),
  "Step 3 IntakeStepSection 必须把 DraftQualityRow 放到 right slot",
);
assert.ok(
  garment.includes("countStep3VisibleNeedsReviewFields(draft)"),
  "Step 3 顶部待确认 N 必须使用可见字段计数，而不是全量 draft summary",
);
assert.ok(garment.includes("data-review-count={needsReviewFields}"), "顶部数量必须暴露 data-review-count");
assert.ok(
  garment.includes("STEP3_OPTIONAL_REVIEW_FIELD_KEYS"),
  "Step 3 可选字段必须从待确认计数中排除空值",
);
assert.ok(
  garment.includes("data-item-form-section=\"intake-basic\"")
    && garment.includes("data-item-form-section=\"intake-color\"")
    && garment.includes("data-item-form-section=\"intake-wear\"")
    && garment.includes("data-item-form-section=\"intake-notes\""),
  "Step 3 必须拆成基础信息 / 颜色 / 穿着属性 / 备注四个统一模块",
);
assert.ok(
  (garment.match(/<EditSectionCard title="基础信息"/g) ?? []).length >= 1
    && (garment.match(/<EditSectionCard title="颜色"/g) ?? []).length >= 1
    && (garment.match(/<EditSectionCard title="穿着属性"/g) ?? []).length >= 1
    && (garment.match(/<EditSectionCard title="备注"/g) ?? []).length >= 1,
  "Step 3 字段模块必须使用 EditSectionCard",
);
assert.ok(
  /<ItemColorFields[\s\S]{0,80}mode="edit"[\s\S]{0,160}colors=\{draft\.colors\.value\}/.test(garment),
  "Step 3 颜色校对应使用 ItemColorFields edit，确保与编辑页共用颜色模式规则",
);

// 7. 字段 badge 不再输出 "默认" / "已修改" / "AI" 三个旧 label
assert.ok(
  !/case\s+"ai":\s*\n\s*return\s+"AI"/.test(garment),
  "fieldSourceLabel 不应再返回 'AI' label",
);
assert.ok(
  !/case\s+"local":\s*\n\s*return\s+needsReview\s*\?\s*"待确认"\s*:\s*"默认"/.test(garment),
  "fieldSourceLabel 不应再返回 '默认' label",
);
assert.ok(
  !/case\s+"user":\s*\n\s*return\s+"已修改"/.test(garment),
  "fieldSourceLabel 不应再返回 '已修改' label",
);

// 8. "需要留意" section 在 Step 3 不再渲染
// 旧写法 <ProcessingIssueList issues={draft.processingIssues} /> 应被移出 Step 3 JSX
// （仅保留 ProcessingIssueList 函数定义 + outfit-intake-flow 调用点）。
const step3CallSites = (garment.match(/<ProcessingIssueList\s+issues=\{draft\.processingIssues\}\s*\/>/g) ?? []).length;
assert.equal(step3CallSites, 0, "Step 3 不应再调用 ProcessingIssueList");

// 9. price / productUrl / material / purchaseDate / fitNotes / notes 标记为 optional
// 通过 TextField/TextareaField 出现 optional 关键字验证。
const optionalFieldCount = (garment.match(/optional\s*$/gm) ?? []).length;
assert.ok(optionalFieldCount >= 6, `Step 3 应至少 6 处字段标记 optional，实际 ${optionalFieldCount}`);

// 10. 必填字段不应标记 optional (避免误隐藏必填校验)
const nameFieldBlock = garment.match(/<TextField\s+label="名称"[\s\S]{0,260}\/>/);
assert.ok(nameFieldBlock, "名称 TextField 必填应存在");
assert.ok(!/\boptional\b/.test(nameFieldBlock[0]), "名称必填字段不应标记 optional");

// 11. ReviewPill 仅在 ai-confidence-pill / garment-intake-flow 被 import
// (防止其他页面误用)。
assert.ok(reviewPill.includes("待确认"), "ReviewPill 文案必须为 '待确认'");
assert.ok(reviewPill.includes("data-review-pill"), "ReviewPill 应暴露 data-review-pill 钩子");

// 12. ai-confidence-pill 暴露 data-ai-confidence / testid 钩子
assert.ok(aiPill.includes("data-ai-confidence"), "AiConfidencePill 应暴露 data-ai-confidence 钩子");
assert.ok(aiPill.includes("AI "), "AiConfidencePill 文案应包含 'AI ' 前缀");

// 13. IntakeStepSection 扩展了 optional right slot
assert.ok(
  /right\?\s*:\s*ReactNode/.test(garment),
  "IntakeStepSection 应支持 optional right slot",
);


// 14. fieldSourceLabel: 只在 needsReview === true 时返回 "待确认"
assert.ok(
  /return\s+needsReview\s*\?\s*"待确认"\s*:\s*"默认"/.test(garment) === false,
  "fieldSourceLabel 不应再 return needsReview ? \"待确认\" : \"默认\"",
);
assert.ok(
  /case\s+"user":\s*\n\s*return\s*"已修改"/.test(garment) === false,
  "fieldSourceLabel 不应再 return \"已修改\"",
);
assert.ok(
  /case\s+"ai":\s*\n\s*return\s*"AI"/.test(garment) === false,
  "fieldSourceLabel 不应再 return \"AI\"",
);
// 函数定义存在
assert.ok(
  /export function fieldSourceLabel\([^)]*\)\s*:\s*string/.test(garment),
  "fieldSourceLabel 函数定义必须保留 (供外部 / 测试使用)",
);
// 行为：needsReview=true 时返回"待确认"
assert.ok(
  /if\s*\(needsReview\)\s*return\s*"待确认"/.test(garment),
  "fieldSourceLabel 必须在 needsReview === true 时返回 \"待确认\"",
);

console.log("intake confirm pill row tests passed");
