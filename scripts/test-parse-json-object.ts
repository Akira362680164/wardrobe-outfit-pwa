// scripts/test-parse-json-object.ts
// v0.9.19: 验证 parseJsonObject 健壮解析 + 错误脱敏

// 注: parseJsonObject + extractFirstBalancedJson 是 device-minimax.ts 中私有函数的**独立副本**。
// 原因: device-minimax.ts 依赖 @/lib/* 别名, 直接 import 会触发 tsconfig path 解析 + 拉入整个调用链
// (normalizeWardrobeDiagnosis / nativePost 等), 单测目标只是想跑纯函数, 不想拖依赖。
// 维护义务: 修改 device-minimax.ts 的 parseJsonObject / extractFirstBalancedJson 时,
// 必须同步修改本文件的副本, 否则单测会过老逻辑失去回归保护。
// 备选: 把 parseJsonObject + extractFirstBalancedJson 抽到 src/lib/parse-json-object.ts,
// 让 device-minimax.ts 和本测试都 import 它 (subagent M-1 建议)。当前未做, 注释先行。

function extractFirstBalancedJson(cleaned: string): string | null {
  for (let start = 0; start < cleaned.length; start += 1) {
    const ch = cleaned[start];
    if (ch !== "{" && ch !== "[") continue;
    const open = ch;
    const close = ch === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < cleaned.length; i += 1) {
      const c = cleaned[i];
      if (inString) {
        if (escape) {
          escape = false;
        } else if (c === "\\") {
          escape = true;
        } else if (c === '"') {
          inString = false;
        }
        continue;
      }
      if (c === '"') {
        inString = true;
        continue;
      }
      if (c === open) {
        depth += 1;
      } else if (c === close) {
        depth -= 1;
        if (depth === 0) {
          return cleaned.slice(start, i + 1);
        }
      }
    }
  }
  return null;
}

function parseJsonObject<T>(raw: string): T {
  const cleaned = raw
    .trim()
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const candidate = extractFirstBalancedJson(cleaned) ?? cleaned;

  try {
    return JSON.parse(candidate) as T;
  } catch (error) {
    const length = raw.trim().length;
    if (typeof console !== "undefined") {
      console.error("[parseJsonObject] 解析失败", {
        length,
        jsonError: error instanceof Error ? error.message : String(error),
        preview: raw.slice(0, 200),
        truncated: raw.slice(0, 1000),
      });
    }
    throw new Error("AI 没能正确整理这次结果，请稍后重试");
  }
}

interface Diagnosis {
  summary: string;
  duplicates: unknown[];
  gaps: unknown[];
  idleItems: unknown[];
  reusableOutfits: unknown[];
  purchaseSuggestions: string[];
}

const cases: Array<{ name: string; input: string; expectValid: boolean; expectSummary?: string }> = [
  {
    name: "纯 JSON（无包装）",
    input: JSON.stringify({ summary: "正常返回", duplicates: [], gaps: [], idleItems: [], reusableOutfits: [], purchaseSuggestions: [] }),
    expectValid: true,
    expectSummary: "正常返回",
  },
  {
    name: "Markdown ```json ... ``` 包裹",
    input: "```json\n" + JSON.stringify({ summary: "Markdown包裹", duplicates: [], gaps: [], idleItems: [], reusableOutfits: [], purchaseSuggestions: [] }) + "\n```",
    expectValid: true,
    expectSummary: "Markdown包裹",
  },
  {
    name: "``` 包裹（无 json 标签）",
    input: "```\n" + JSON.stringify({ summary: "裸代码块", duplicates: [], gaps: [], idleItems: [], reusableOutfits: [], purchaseSuggestions: [] }) + "\n```",
    expectValid: true,
    expectSummary: "裸代码块",
  },
  {
    name: "<think>...</think> 标签 + 合法 JSON",
    input: "<think>我需要分析衣橱</think>\n" + JSON.stringify({ summary: "think后JSON", duplicates: [], gaps: [], idleItems: [], reusableOutfits: [], purchaseSuggestions: [] }),
    expectValid: true,
    expectSummary: "think后JSON",
  },
  {
    name: "JSON 前后夹杂解释文字（用户截图典型）",
    input: "好的，以下是诊断结果：\n" + JSON.stringify({ summary: "夹杂解释", duplicates: [], gaps: [], idleItems: [], reusableOutfits: [], purchaseSuggestions: [] }) + "\n希望对你有帮助。",
    expectValid: true,
    expectSummary: "夹杂解释",
  },
  {
    name: "think + Markdown + 解释 + JSON（混合脏数据）",
    input: "<think>让我先分析</think>\n" +
      "好的，这是诊断：\n" +
      "```json\n" +
      JSON.stringify({ summary: "全脏", duplicates: [], gaps: [], idleItems: [], reusableOutfits: [], purchaseSuggestions: [] }) +
      "\n```\n" +
      "完结撒花。",
    expectValid: true,
    expectSummary: "全脏",
  },
  {
    name: "字符串内含 { } 不影响解析",
    input: JSON.stringify({ summary: 'note: 测试 {里面有大括号} 不影响', duplicates: [], gaps: [], idleItems: [], reusableOutfits: [], purchaseSuggestions: [] }),
    expectValid: true,
    expectSummary: 'note: 测试 {里面有大括号} 不影响',
  },
  {
    name: "纯乱码（解析失败）→ 抛用户友好 message",
    input: "这不是 JSON {{{",
    expectValid: false,
  },
  {
    name: "嵌套不平衡的括号（首段闭合但内部不匹配）",
    input: "abc{def{ghi}jkl}mno",  // {def{ghi}jkl} 算法上平衡, 但 JSON.parse 失败
    expectValid: false,
  },
  {
    // v0.9.20 (subagent M-2 补): 模型先吐一个伪 JSON, 再吐真 JSON;
    // 当前 extractFirstBalancedJson 取首段, 失败就 throw, 不回退第二段。
    // 未来 v0.9.20+ 考虑多候选段回退 (M-4)。
    name: "首个平衡段不是合法 JSON, 真 JSON 在后（当前实现不取第二段, 期望失败）",
    input: '好的：{x: not_json} 然后真正的结果 { "summary": "ok" }',
    expectValid: false,
  },
];

let pass = 0;
let fail = 0;
for (const tc of cases) {
  let parsed: Diagnosis | null = null;
  let errorMsg: string | null = null;
  try {
    parsed = parseJsonObject<Diagnosis>(tc.input);
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }
  if (tc.expectValid) {
    if (parsed && (!tc.expectSummary || parsed.summary === tc.expectSummary)) {
      console.log(`✅ ${tc.name} → summary=${parsed?.summary}`);
      pass += 1;
    } else {
      console.log(`❌ ${tc.name} → expected valid, got error=${errorMsg} or summary mismatch`);
      fail += 1;
    }
  } else {
    if (errorMsg) {
      // 验证 error message 是用户友好版（不含"AI 返回内容无法解析"等旧 message）
      const isFriendly = errorMsg === "AI 没能正确整理这次结果，请稍后重试";
      console.log(`${isFriendly ? "✅" : "⚠️"} ${tc.name} → error=${errorMsg}${isFriendly ? "" : " (但 message 仍可接受)"}`);
      if (isFriendly) pass += 1; else fail += 1;
    } else {
      console.log(`❌ ${tc.name} → expected throw, got parsed=${JSON.stringify(parsed)}`);
      fail += 1;
    }
  }
}

console.log(`\n=== 结果: ${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail > 0 ? 1 : 0);
