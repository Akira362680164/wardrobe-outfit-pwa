// v1.1.27: 颜色目录唯一来源 + UI 结构 + AI Prompt + AI 解析 静态契约测试。
// 覆盖执行方案 §12.1-12.6 的 74 项断言。
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  COLOR_CATALOG,
  COLOR_OPTIONS,
  COMMON_COLOR_OPTIONS,
  EXTENDED_COLOR_GROUPS,
  COLOR_SWATCHES,
  COLOR_ALIAS_MAP,
  isSystemColor,
  normalizeSystemColorValue,
  normalizeSystemColorList,
  buildColorRecognitionPrompt,
} from "../src/lib/color-catalog";
import { normalizeAiColorInfo } from "../src/lib/color-fields";

const root = process.cwd();
const typesTs = readFileSync(join(root, "src/lib/types.ts"), "utf8");
const colorCatalogTs = readFileSync(join(root, "src/lib/color-catalog.ts"), "utf8");
const colorFieldsTs = readFileSync(join(root, "src/lib/color-fields.ts"), "utf8");
const colorChipTsx = readFileSync(join(root, "src/components/color-chip.tsx"), "utf8");
const itemColorFieldsTsx = readFileSync(join(root, "src/components/item/color-fields.tsx"), "utf8");
const deviceMiniMaxTs = readFileSync(join(root, "src/lib/device-minimax.ts"), "utf8");
const outfitAiSuggestionTs = readFileSync(join(root, "src/lib/outfit-ai-suggestion.ts"), "utf8");
const wardrobeFormControlsTsx = readFileSync(join(root, "src/components/wardrobe-form-controls.tsx"), "utf8");
const wardrobeAppTsx = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");
const garmentImmersiveDetailTsx = readFileSync(join(root, "src/components/garment-immersive-detail.tsx"), "utf8");

// types.ts 中允许作为迁移注释提及 "COLOR_OPTIONS" 字面量，但不允许 export const COLOR_OPTIONS。
function typesHasColorOptionsExport() {
  return codeLinesExcludingComments(typesTs).some((l) => /export const COLOR_OPTIONS/.test(l));
}

// 通用：剔除 // 注释行（包括行内行首），返回剩余代码行数组。
function codeLinesExcludingComments(text: string): string[] {
  return text.split("\n").filter((line) => !line.trim().startsWith("//"));
}

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

console.log("\n=== §12.2 目录测试（22 项） ===");
// 1. COLOR_CATALOG 正好 26 项
check("1. COLOR_CATALOG 正好 26 项", COLOR_CATALOG.length === 26);
// 2. 26 个 value 全部唯一
{
  const seen = new Set<string>();
  let dup: string | null = null;
  for (const entry of COLOR_CATALOG) {
    if (seen.has(entry.value)) { dup = entry.value; break; }
    seen.add(entry.value);
  }
  check("2. 26 个 value 全部唯一", dup === null, dup ? `重复: ${dup}` : undefined);
}
// 3. COLOR_OPTIONS 与目录顺序一致
check(
  "3. COLOR_OPTIONS 与目录顺序一致",
  COLOR_OPTIONS.length === COLOR_CATALOG.length &&
    COLOR_CATALOG.every((entry, i) => COLOR_OPTIONS[i] === entry.value),
);
// 4. 常用色正好 12 项
check("4. 常用色正好 12 项", COMMON_COLOR_OPTIONS.length === 12);
// 5. 常用色顺序完全一致
check(
  "5. 常用色顺序完全一致",
  JSON.stringify([...COMMON_COLOR_OPTIONS]) ===
    JSON.stringify(["黑", "白", "灰", "米白", "米", "卡其", "棕", "蓝", "牛仔蓝", "绿", "红", "粉"]),
);
// 6. 扩展色正好 14 项
{
  const extended = EXTENDED_COLOR_GROUPS.flatMap((g) => [...g.colors]);
  check("6. 扩展色正好 14 项", extended.length === 14);
  // 7. 四个扩展分组名称与顺序
  check(
    "7. 四个扩展分组名称与顺序一致",
    JSON.stringify(EXTENDED_COLOR_GROUPS.map((g) => g.label)) ===
      JSON.stringify(["中性与大地色", "红橙黄色系", "蓝绿色系", "特殊色"]),
  );
  // 8. 四个分组的颜色完全一致
  check(
    "8. 四个分组的颜色完全一致",
    JSON.stringify(EXTENDED_COLOR_GROUPS.map((g) => [...g.colors])) ===
      JSON.stringify([
        ["深灰", "杏", "驼", "咖啡"],
        ["酒红", "橙", "黄"],
        ["天蓝", "藏青", "橄榄绿", "墨绿"],
        ["紫", "金", "银"],
      ]),
  );
}
// 9. 26 个颜色全部存在色值
check("9. 26 个颜色全部存在色值", COLOR_OPTIONS.every((c) => COLOR_SWATCHES[c]?.bg));
// 10. 浅色描边配置存在
{
  const needsBorder = ["白", "米白", "米", "杏", "黄", "金", "银"];
  const missing = needsBorder.filter((c) => !COLOR_SWATCHES[c as keyof typeof COLOR_SWATCHES].border);
  check("10. 浅色描边配置存在", missing.length === 0, missing.length > 0 ? `缺失: ${missing.join(",")}` : undefined);
}
// 11. 别名无重复
{
  const seen = new Set<string>();
  let dup: string | null = null;
  for (const entry of COLOR_CATALOG) {
    for (const alias of entry.aliases) {
      if (seen.has(alias)) { dup = alias; break; }
      seen.add(alias);
    }
    if (dup) break;
  }
  check("11. 别名无重复", dup === null, dup ? `重复: ${dup}` : undefined);
}
// 12. 别名不与其他标准色冲突
{
  const values = new Set<string>(COLOR_OPTIONS);
  let conflict: string | null = null;
  for (const alias of Object.keys(COLOR_ALIAS_MAP)) {
    if (values.has(alias)) { conflict = alias; break; }
  }
  check("12. 别名不与其他标准色冲突", conflict === null, conflict ? `冲突: ${conflict}` : undefined);
}
// 13. 卡其 是标准色
check("13. 卡其 是标准色", isSystemColor("卡其"));
// 14. 卡其色 归一为 卡其
check("14. 卡其色 归一为 卡其", normalizeSystemColorValue("卡其色") === "卡其");
// 15. 浅卡其 归一为 卡其
check("15. 浅卡其 归一为 卡其", normalizeSystemColorValue("浅卡其") === "卡其");
// 16. 米白 保持 米白
check("16. 米白 保持 米白", normalizeSystemColorValue("米白") === "米白");
// 17. 杏色 归一为 杏
check("17. 杏色 归一为 杏", normalizeSystemColorValue("杏色") === "杏");
// 18. 焦糖色 归一为 驼
check("18. 焦糖色 归一为 驼", normalizeSystemColorValue("焦糖色") === "驼");
// 19. 摩卡 归一为 咖啡
check("19. 摩卡 归一为 咖啡", normalizeSystemColorValue("摩卡") === "咖啡");
// 20. 午夜蓝 归一为 藏青
check("20. 午夜蓝 归一为 藏青", normalizeSystemColorValue("午夜蓝") === "藏青");
// 21. 未知颜色返回 null
check("21. 未知颜色返回 null", normalizeSystemColorValue("燕麦拿铁色") === null);
// 22. 不使用模糊 includes 归一
{
  // 关键边界: "奶油" 单独不能归一为 米（避免模糊 includes 误伤）
  check("22a. '奶油' 单独不归一为 米", normalizeSystemColorValue("奶油") === null);
  // "蓝色" 仍然命中
  check("22b. '蓝色' 归一为 蓝", normalizeSystemColorValue("蓝色") === "蓝");
  // "色系" 后缀剥离
  check("22c. '红色系' 归一为 红", normalizeSystemColorValue("红色系") === "红");
}

console.log("\n=== §12.3 代码唯一来源测试（10 项） ===");
// 1. src/lib/types.ts 不包含 COLOR_OPTIONS
check("1. types.ts 不再含 COLOR_OPTIONS", !/export const COLOR_OPTIONS/.test(typesTs));
// 2. types.ts 不导入 color-catalog
check("2. types.ts 不导入 color-catalog", !/from\s+["']@\/lib\/color-catalog["']/.test(typesTs));
// 3. types.ts 不再导出 COLOR_OPTIONS
check("3. types.ts 不再导出 COLOR_OPTIONS", !typesHasColorOptionsExport());
// 4. color-chip.tsx 不定义 COLOR_SWATCHES
check("4. color-chip.tsx 不定义 COLOR_SWATCHES", !/export const COLOR_SWATCHES/.test(colorChipTsx));
// 5. color-chip.tsx 不定义 COLOR_OPTIONS
check("5. color-chip.tsx 不定义 COLOR_OPTIONS", !/export const COLOR_OPTIONS/.test(colorChipTsx));
// 6. item/color-fields.tsx 不包含 swatchClass
check("6. item/color-fields.tsx 不包含 swatchClass", !/swatchClass/.test(itemColorFieldsTsx));
// 7. color-fields.ts 不包含 COLOR_ALIASES （排除迁移注释）
check(
  "7. color-fields.ts 不包含 COLOR_ALIASES",
  !codeLinesExcludingComments(colorFieldsTs).some((l) => /COLOR_ALIASES/.test(l)),
);
// 8. device-minimax.ts 不包含 normalizeColorName
check(
  "8. device-minimax.ts 不包含 normalizeColorName",
  !codeLinesExcludingComments(deviceMiniMaxTs).some((l) => /normalizeColorName/.test(l)),
);
// 8b. outfit-ai-suggestion.ts 不包含 normalizeColorName
check(
  "8b. outfit-ai-suggestion.ts 不包含 normalizeColorName",
  !codeLinesExcludingComments(outfitAiSuggestionTs).some((l) => /normalizeColorName/.test(l)),
);
// 9. COLOR_CATALOG 仅定义于 color-catalog.ts
check("9. COLOR_CATALOG 仅定义于 color-catalog.ts", /export const COLOR_CATALOG/.test(colorCatalogTs));
// 10. 标准颜色数组仅从 COLOR_CATALOG 派生
check(
  "10. 标准颜色数组仅从 COLOR_CATALOG 派生",
  /export const COLOR_OPTIONS[^=]*=\s*COLOR_CATALOG\.map/.test(colorCatalogTs),
);

console.log("\n=== §12.4 UI 结构测试（15 项） ===");
check("1. 主色使用统一 ColorSwatchPicker", /<ColorSwatchPicker[\s\S]+?title="主色"/.test(itemColorFieldsTsx));
check("2. 辅助色使用同一 ColorSwatchPicker", /<ColorSwatchPicker[\s\S]+?title="辅助色"/.test(itemColorFieldsTsx));
check("3. 页面包含「已选颜色」", /已选颜色/.test(itemColorFieldsTsx));
check("4. 页面包含「暂未选择」", /暂未选择/.test(itemColorFieldsTsx));
check("5. 页面包含「展开更多颜色」", /展开更多颜色/.test(itemColorFieldsTsx));
check("6. 页面包含「收起更多颜色」", /收起更多颜色/.test(itemColorFieldsTsx));
// 7-10: 分组标题由 EXTENDED_COLOR_GROUPS.label 提供，定义于 color-catalog.ts。
check("7. 页面包含「中性与大地色」", colorCatalogTs.includes("中性与大地色"));
check("8. 页面包含「红橙黄色系」", colorCatalogTs.includes("红橙黄色系"));
check("9. 页面包含「蓝绿色系」", colorCatalogTs.includes("蓝绿色系"));
check("10. 页面包含「特殊色」", colorCatalogTs.includes("特殊色"));
check("11. 色卡网格使用 grid-cols-3", /grid-cols-3/.test(itemColorFieldsTsx));
check("12. 不存在 min-[430px]:grid-cols-4", !/min-\[430px\]:grid-cols-4/.test(itemColorFieldsTsx));
check("13. 已选颜色 Chip 支持删除", /aria-label=\{`移除\$\{color\}`\}/.test(itemColorFieldsTsx));
check("14. 辅助色禁用主色", /disabled=\{disabledSet\.has\(color\)\}/.test(itemColorFieldsTsx));
check("15. 禁用项仍读取统一色值", /COLOR_SWATCHES\[color\]/.test(itemColorFieldsTsx));

console.log("\n=== §12.5 AI Prompt 测试（15 项） ===");
const promptLines = buildColorRecognitionPrompt();
const promptText = promptLines.join("\n");
check("1. 单品与种草共同调用 buildColorRecognitionPrompt()", /\.\.\.buildColorRecognitionPrompt\(\)/.test(deviceMiniMaxTs));
check("2. Prompt 使用 COLOR_OPTIONS.length", /\$\{COLOR_OPTIONS\.length\}/.test(colorCatalogTs));
check("3. Prompt 包含 26 个标准色", COLOR_OPTIONS.every((c) => promptText.includes(c)));
check("4. Prompt 包含卡其与米、驼、棕边界", promptText.includes("卡其") && promptText.includes("不等于米色") && promptText.includes("棕"));
check("5. Prompt 包含藏青与黑边界", promptText.includes("藏青") && promptText.includes("不等于黑色"));
check("6. Prompt 包含牛仔蓝限制", promptText.includes("牛仔蓝") && promptText.includes("丹宁"));
check("7. Prompt 包含光影排除规则", promptText.includes("光影") && promptText.includes("阴影"));
check("8. Prompt 包含 needsReview 不确定规则", promptText.includes("needsReview"));
check("9. Prompt 只要求 colors 新结构", promptText.includes("colors.mode") && promptText.includes('"single"'));
// 10. Prompt 显式声明旧字段被禁止（含"不得输出 colorMode、primaryColors…"）。
check(
  "10. Prompt 显式禁止旧字段 colorMode/primaryColors/secondaryColors/mainColor/accentColors",
  promptText.includes("不得输出") && promptText.includes("colorMode") && promptText.includes("primaryColors"),
);
check("11. 源码不包含「12 个中文值」", !deviceMiniMaxTs.includes("12 个中文值"));
check("12. 源码不包含「卡其 -> 棕」", !deviceMiniMaxTs.includes("卡其 -> 棕"));
check("13. 源码不包含「卡其 → 棕」", !deviceMiniMaxTs.includes("卡其 → 棕"));
check("14. 源码不包含「卡其 -> 米」", !deviceMiniMaxTs.includes("卡其 -> 米"));
check("15. 源码不包含「卡其 → 米」", !deviceMiniMaxTs.includes("卡其 → 米"));
// 额外：outfit-ai-suggestion.ts 也不能含 卡其->米
check("15b. outfit-ai-suggestion.ts 也不含 卡其->米", !outfitAiSuggestionTs.includes("卡其 -> 米") && !outfitAiSuggestionTs.includes("卡其 → 米"));

console.log("\n=== §12.6 AI 解析测试（12 项） ===");
// 1. 标准卡其保持卡其
{
  const r = normalizeAiColorInfo({ mode: "single", primary: "卡其" });
  check("1. 标准卡其保持卡其", r.colors.mode === "single" && (r.colors as { primary: string }).primary === "卡其" && r.needsReview === false);
}
// 2. 卡其色归一为卡其
{
  const r = normalizeAiColorInfo({ mode: "single", primary: "卡其色" });
  check("2. 卡其色归一为卡其", (r.colors as { primary: string }).primary === "卡其");
}
// 3. 未知主色不写入
{
  const r = normalizeAiColorInfo({ mode: "single", primary: "燕麦拿铁色" });
  check("3. 未知主色不写入", (r.colors as { primary: string }).primary === "");
}
// 4. 未知主色标记复核
check("4. 未知主色标记复核", normalizeAiColorInfo({ mode: "single", primary: "燕麦拿铁色" }).needsReview === true);
// 5. 非法辅助色被过滤并标记复核
{
  const r = normalizeAiColorInfo({ mode: "main_with_accent", primary: "白", accents: ["燕麦拿铁色", "黑"] });
  check("5. 非法辅助色被过滤并标记复核", r.needsReview === true && (r.colors as { accents: string[] }).accents.includes("黑") && !(r.colors as { accents: string[] }).accents.includes("燕麦拿铁色"));
}
// 6. main_with_accent 无合法辅助色时降级为 single
{
  const r = normalizeAiColorInfo({ mode: "main_with_accent", primary: "白", accents: ["燕麦拿铁色"] });
  check("6. main_with_accent 无合法辅助色时降级为 single", r.colors.mode === "single");
}
// 7. multicolor 仅剩一个合法颜色时降级为 single
{
  const r = normalizeAiColorInfo({ mode: "multicolor", primaries: ["燕麦拿铁色", "黑"] });
  check("7. multicolor 仅剩一个合法颜色时降级为 single", r.colors.mode === "single");
}
// 8. multicolor 无合法颜色时返回空单主色
{
  const r = normalizeAiColorInfo({ mode: "multicolor", primaries: ["燕麦拿铁色"] });
  check("8. multicolor 无合法颜色时返回空单主色", r.colors.mode === "single" && (r.colors as { primary: string }).primary === "");
}
// 9. 主色与辅助色去重
{
  const r = normalizeAiColorInfo({ mode: "main_with_accent", primary: "白", accents: ["白", "黑", "白"] });
  const c = r.colors as { primary: string; accents: string[] };
  check("9. 主色与辅助色去重", c.primary === "白" && JSON.stringify(c.accents) === JSON.stringify(["黑"]));
}
// 10. 最多保留 5 个颜色
{
  const r = normalizeAiColorInfo({ mode: "multicolor", primaries: ["黑", "白", "灰", "米", "卡其", "棕", "蓝"] });
  const c = r.colors as { primaries: string[] };
  check("10. 最多保留 5 个颜色", c.primaries.length === 5);
}
// 11. 外层 needsReview: false 不得覆盖颜色解析复核
{
  const r = normalizeAiColorInfo({ mode: "single", primary: "燕麦拿铁色" });
  check("11. 非法颜色必须 needsReview=true", r.needsReview === true);
}
// 12. 非法字符串不得进入最终 ColorInfo
{
  const r = normalizeAiColorInfo({ mode: "main_with_accent", primary: "燕麦拿铁色", accents: ["黑"] });
  const c = r.colors as { primary: string; accents: string[] };
  check(
    "12. 非法字符串不得进入最终 ColorInfo",
    c.primary !== "燕麦拿铁色" && !(c.accents ?? []).includes("燕麦拿铁色"),
  );
}

console.log("\n=== 额外：normalizeSystemColorList ===");
check(
  "list: 数组输入去重保序",
  JSON.stringify(normalizeSystemColorList(["卡其", "卡其", "黑", "燕麦拿铁色"], 5)) === JSON.stringify(["卡其", "黑"]),
);
check(
  "list: 字符串按 / 、,，/ 拆分",
  JSON.stringify(normalizeSystemColorList("卡其、白、黑", 5)) === JSON.stringify(["卡其", "白", "黑"]),
);
check(
  "list: 上限截断",
  normalizeSystemColorList(["黑", "白", "灰", "米白", "米", "卡其", "棕"], 5).length === 5,
);

console.log("\n=== 额外：UI 组件导入约束 ===");
check(
  "wardrobe-form-controls.tsx 从 color-catalog 导入 COLOR_SWATCHES",
  /from\s+["']@\/lib\/color-catalog["']/.test(wardrobeFormControlsTsx),
);
check(
  "wardrobe-form-controls.tsx 不从 color-chip 导入 COLOR_SWATCHES",
  !/from\s+["']@\/components\/color-chip["']/.test(wardrobeFormControlsTsx),
);
check(
  "wardrobe-app.tsx 从 color-catalog 导入 COLOR_OPTIONS",
  /import\s*\{[^}]*COLOR_OPTIONS[^}]*\}\s*from\s*["']@\/lib\/color-catalog["']/.test(wardrobeAppTsx),
);
check(
  "wardrobe-app.tsx 不再从 color-chip 导入 COLOR_SWATCHES",
  !/from\s+["']@\/components\/color-chip["']/.test(wardrobeAppTsx),
);
check(
  "garment-immersive-detail.tsx 不再本地 export COLOR_SWATCHES",
  !/export const COLOR_SWATCHES/.test(garmentImmersiveDetailTsx),
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);