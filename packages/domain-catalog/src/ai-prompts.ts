import { COLOR_CATALOG, COLOR_OPTIONS } from "./colors.js";

/**
 * 唯一构造器：单品与种草识别提示词共用。
 * 严格从 COLOR_CATALOG 派生颜色枚举、别名归一与相近色说明。
 */
export function buildColorRecognitionPrompt(): string[] {
  const lines: string[] = [];

  // 1. 标准枚举 — 数字由 COLOR_OPTIONS.length 动态生成
  lines.push(
    `系统标准颜色仅允许以下 ${COLOR_OPTIONS.length} 个中文值：${COLOR_OPTIONS.join("、")}。`,
  );

  // 2. 输出结构
  lines.push(
    "颜色字段只能返回 colors。colors.mode 只能是 single、main_with_accent、multicolor。",
  );
  lines.push('single 返回 {"mode":"single","primary":"标准色"}。');
  lines.push('main_with_accent 返回 {"mode":"main_with_accent","primary":"标准色","accents":["标准色"]}。');
  lines.push('multicolor 返回 {"mode":"multicolor","primaries":["标准色","标准色"]}。');
  lines.push(
    "不得输出 colorMode、primaryColors、secondaryColors、mainColor、accentColors 等旧字段。",
  );

  // 3. 颜色模式规则
  lines.push(
    "single：衣物主体基本为一种颜色。阴影、高光、面料褶皱和同色深浅变化不算多色。",
  );
  lines.push(
    "main_with_accent：一个颜色明显占主体，另有小面积包边、印花、拼接或装饰颜色。极小面积纽扣、拉链、文字和 Logo 不计入辅助色。",
  );
  lines.push(
    "multicolor：两个以上颜色均占据明显面积，没有唯一绝对主色。格纹、宽条纹、大面积撞色通常属于 multicolor。",
  );

  // 4. 相近颜色边界（关键易混色）
  const boundaryLines: string[] = [];
  const boundaries: Array<[string, string]> = [
    ["白", "纯净中性白。"],
    ["米白", "接近白色，但有轻微暖黄或奶油倾向。"],
    ["米", "浅暖中性色，比米白明显更深。"],
    ["卡其", "黄灰或土灰倾向，不等于米色，也不等于棕色。"],
    ["杏", "浅暖色，带轻微粉橙倾向。"],
    ["驼", "中等明度暖橙棕，比卡其明显更暖。"],
    ["棕", "标准中深棕，比卡其与驼更深。"],
    ["咖啡", "比棕更深、更浓。"],
    ["灰", "中等明度灰。"],
    ["深灰", "明显低明度灰，不等于黑色。"],
    ["天蓝", "明亮浅蓝，不是普通中等明度蓝。"],
    ["蓝", "普通中等明度蓝。"],
    ["牛仔蓝", "典型丹宁灰蓝，仅用于明显牛仔面料或典型灰蓝。"],
    ["藏青", "低明度深蓝，不等于黑色。"],
    ["绿", "普通绿色。"],
    ["橄榄绿", "带黄灰倾向的绿色。"],
    ["墨绿", "低明度深绿色。"],
    ["酒红", "低明度、偏紫或偏棕的红色。"],
  ];
  for (const [value, desc] of boundaries) {
    const entry = COLOR_CATALOG.find((c) => c.value === value);
    if (!entry) continue;
    boundaryLines.push(`${entry.value}：${desc}`);
  }
  if (boundaryLines.length > 0) {
    lines.push("相近颜色边界：");
    lines.push(...boundaryLines);
  }

  // 5. 光影与背景排除
  lines.push("光影与背景排除：");
  lines.push("只判断衣物面料本身的固有颜色。");
  lines.push("忽略背景、人物肤色、衣架、地面和其他商品。");
  lines.push("忽略阴影导致的局部变暗。");
  lines.push("忽略高光和过曝导致的局部变白。");
  lines.push("忽略极小面积纽扣、拉链、文字和 Logo。");
  lines.push("图片存在明显暖光或冷光时，尽量还原衣物本色。");
  lines.push("无法可靠区分相邻标准色时，选择最接近的标准色，并将 needsReview 设为 true。");

  // 6. 别名归一（由 COLOR_CATALOG.aliases 动态生成，按标准色聚合）
  lines.push("别名归一（出现下列写法时归一为对应标准色）：");
  const aliasLines: string[] = [];
  for (const entry of COLOR_CATALOG) {
    if (entry.aliases.length === 0) continue;
    aliasLines.push(`${entry.aliases.join("、")} → ${entry.value}`);
  }
  lines.push(...aliasLines);

  return lines;
}
