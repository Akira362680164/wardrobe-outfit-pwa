/**
 * v1.1.27 颜色领域唯一目录。
 *
 * 不依赖 React / 组件 / Dexie / types.ts / window / 数据库 / MiniMax。
 * 业务类型 ColorInfo 仍在 src/lib/types.ts 中维护，本文件只负责颜色枚举、
 * 色值、别名归一、提示词统一、唯一派生。
 */
export type ColorFamily =
  | "common"
  | "neutral_earth"
  | "warm"
  | "blue_green"
  | "special";

export interface ColorCatalogEntry {
  value: string;
  swatch: string;
  border?: string;
  family: ColorFamily;
  aliases: readonly string[];
  description?: string;
}

/** 26 个标准色唯一目录。顺序即 COLOR_OPTIONS 顺序。 */
export const COLOR_CATALOG: readonly ColorCatalogEntry[] = [
  // common · 中性常用
  { value: "黑", swatch: "#1D2228", family: "common", aliases: ["黑色", "纯黑", "墨黑"] },
  { value: "白", swatch: "#F8FAFC", border: "rgba(29,34,40,0.26)", family: "common", aliases: ["白色", "纯白", "雪白"], description: "纯净中性白。" },
  { value: "灰", swatch: "#9CA3AF", family: "common", aliases: ["灰色", "中灰", "浅灰"], description: "中等明度灰。" },
  // common · 米/卡其
  { value: "米白", swatch: "#F3EEE3", border: "rgba(29,34,40,0.18)", family: "common", aliases: ["米白色", "奶油白", "象牙白", "燕麦白"], description: "接近白色，带轻微暖黄或奶油倾向。" },
  { value: "米", swatch: "#E6D5B8", border: "rgba(29,34,40,0.16)", family: "common", aliases: ["米色", "浅米色", "奶油色"], description: "浅暖中性色，比米白明显更深。" },
  { value: "卡其", swatch: "#B7A477", family: "common", aliases: ["卡其色", "浅卡其", "深卡其", "沙色"], description: "黄灰或土灰倾向，不等于米色和棕色。" },
  // common · 棕/蓝/绿/红/粉
  { value: "棕", swatch: "#87583E", family: "common", aliases: ["棕色", "褐色", "茶棕"], description: "标准中深棕。" },
  { value: "蓝", swatch: "#355C7D", family: "common", aliases: ["蓝色", "宝蓝", "钴蓝"], description: "普通中等明度蓝。" },
  { value: "牛仔蓝", swatch: "#3F6F9F", family: "common", aliases: ["牛仔蓝色", "丹宁蓝", "水洗蓝"], description: "典型丹宁灰蓝，仅用于明显牛仔面料或典型牛仔蓝。" },
  { value: "绿", swatch: "#5F7058", family: "common", aliases: ["绿色", "正绿", "翠绿"], description: "普通绿色。" },
  { value: "红", swatch: "#B84A45", family: "common", aliases: ["红色", "正红", "大红"] },
  { value: "粉", swatch: "#E8A7B8", family: "common", aliases: ["粉色", "粉红", "浅粉"] },

  // neutral_earth · 中性与大地色
  { value: "深灰", swatch: "#4B5563", family: "neutral_earth", aliases: ["深灰色", "炭灰", "碳灰", "铁灰"], description: "明显低明度灰，不等于黑色。" },
  { value: "杏", swatch: "#E6C5A5", border: "rgba(29,34,40,0.14)", family: "neutral_earth", aliases: ["杏色", "杏仁色", "裸杏"], description: "浅暖色，带轻微粉橙倾向。" },
  { value: "驼", swatch: "#B8845F", family: "neutral_earth", aliases: ["驼色", "骆驼色", "焦糖色"], description: "中等明度暖橙棕，比卡其明显更暖。" },
  { value: "咖啡", swatch: "#5F4032", family: "neutral_earth", aliases: ["咖啡色", "深咖", "摩卡", "巧克力色"], description: "比棕更深、更浓。" },

  // warm · 红橙黄色系
  { value: "酒红", swatch: "#7B2E3A", family: "warm", aliases: ["酒红色", "勃艮第红", "暗红"], description: "低明度、偏紫或偏棕的红色。" },
  { value: "橙", swatch: "#D9823B", family: "warm", aliases: ["橙色", "橘色", "橘红"] },
  { value: "黄", swatch: "#E3B64B", border: "rgba(29,34,40,0.12)", family: "warm", aliases: ["黄色", "明黄", "芥末黄", "姜黄"] },

  // blue_green · 蓝绿色系
  { value: "天蓝", swatch: "#83B6D9", family: "blue_green", aliases: ["天蓝色", "浅蓝", "湖蓝"], description: "明亮浅蓝。" },
  { value: "藏青", swatch: "#243B5A", family: "blue_green", aliases: ["藏青色", "深蓝", "午夜蓝", "海军蓝"], description: "低明度深蓝，不等于黑色。" },
  { value: "橄榄绿", swatch: "#777B48", family: "blue_green", aliases: ["橄榄色", "军绿", "军绿色", "草绿色"], description: "带黄灰倾向的绿色。" },
  { value: "墨绿", swatch: "#315B4B", family: "blue_green", aliases: ["墨绿色", "深绿", "森林绿"], description: "低明度深绿色。" },

  // special · 特殊色
  { value: "紫", swatch: "#8C4A86", family: "special", aliases: ["紫色", "紫罗兰"] },
  { value: "金", swatch: "#C6A15B", border: "rgba(29,34,40,0.12)", family: "special", aliases: ["金色", "金属金", "香槟金"] },
  { value: "银", swatch: "#B8C0C8", border: "rgba(29,34,40,0.16)", family: "special", aliases: ["银色", "金属银", "银灰"] },
] as const;

export type SystemColor = (typeof COLOR_CATALOG)[number]["value"];

/** 26 色顺序数组。 */
export const COLOR_OPTIONS: readonly SystemColor[] = COLOR_CATALOG.map((entry) => entry.value);

/** 12 个常用色 — 顺序固定且与扩展色互不影响。 */
export const COMMON_COLOR_VALUES = [
  "黑", "白", "灰",
  "米白", "米", "卡其",
  "棕", "蓝", "牛仔蓝",
  "绿", "红", "粉",
] as const satisfies readonly SystemColor[];

export const COMMON_COLOR_OPTIONS: readonly SystemColor[] = COMMON_COLOR_VALUES;

/** 14 个扩展色分 4 组。顺序固定：中性与大地色 / 红橙黄色系 / 蓝绿色系 / 特殊色。 */
export interface ExtendedColorGroup {
  family: ColorFamily;
  label: string;
  colors: readonly SystemColor[];
}

export const EXTENDED_COLOR_GROUPS: readonly ExtendedColorGroup[] = [
  {
    family: "neutral_earth",
    label: "中性与大地色",
    colors: ["深灰", "杏", "驼", "咖啡"],
  },
  {
    family: "warm",
    label: "红橙黄色系",
    colors: ["酒红", "橙", "黄"],
  },
  {
    family: "blue_green",
    label: "蓝绿色系",
    colors: ["天蓝", "藏青", "橄榄绿", "墨绿"],
  },
  {
    family: "special",
    label: "特殊色",
    colors: ["紫", "金", "银"],
  },
];

/** 色值映射：所有组件必须读取这一份色值。 */
export const COLOR_SWATCHES: Readonly<Record<SystemColor, { bg: string; border?: string }>> =
  COLOR_CATALOG.reduce(
    (acc, entry) => {
      acc[entry.value] = { bg: entry.swatch, border: entry.border };
      return acc;
    },
    {} as Record<SystemColor, { bg: string; border?: string }>,
  );

/** 别名 → 标准色。运行时初始化时校验唯一性。 */
export const COLOR_ALIAS_MAP: Readonly<Record<string, SystemColor>> = COLOR_CATALOG.reduce(
  (acc, entry) => {
    for (const alias of entry.aliases) {
      if (acc[alias] && acc[alias] !== entry.value) {
        throw new Error(`Color alias conflict: "${alias}" maps to both "${acc[alias]}" and "${entry.value}"`);
      }
      acc[alias] = entry.value;
    }
    return acc;
  },
  {} as Record<string, SystemColor>,
);

export const COLOR_FAMILY_LABELS: Readonly<Record<ColorFamily, string>> = {
  common: "常用",
  neutral_earth: "中性与大地色",
  warm: "红橙黄色系",
  blue_green: "蓝绿色系",
  special: "特殊色",
};

const SYSTEM_COLOR_SET: ReadonlySet<string> = new Set(COLOR_OPTIONS);

/** 标准色判定。 */
export function isSystemColor(value: unknown): value is SystemColor {
  return typeof value === "string" && SYSTEM_COLOR_SET.has(value);
}

/**
 * 把任意字符串归一为标准色。
 * 严格按顺序匹配：
 * 1. 去除首尾空白。
 * 2. 精确命中标准色。
 * 3. 去除末尾"色系"。
 * 4. 去除末尾"色"。
 * 5. 再次精确命中标准色。
 * 6. 精确匹配别名。
 * 7. 未命中返回 null。
 *
 * 禁止 includes 模糊匹配；禁止原样返回未知字符串。
 */
export function normalizeSystemColorValue(value: unknown): SystemColor | null {
  if (typeof value !== "string") return null;
  const clean: string = value.trim();
  if (!clean) return null;
  if (isSystemColor(clean)) return clean;

  let noColorFamily: string = clean;
  if (noColorFamily.endsWith("色系")) {
    noColorFamily = noColorFamily.slice(0, -2);
    if (isSystemColor(noColorFamily)) return noColorFamily;
  }

  let noColorSuffix: string = noColorFamily;
  if (noColorSuffix.endsWith("色")) {
    noColorSuffix = noColorSuffix.slice(0, -1);
    if (isSystemColor(noColorSuffix)) return noColorSuffix;
  }

  if (COLOR_ALIAS_MAP[noColorSuffix]) return COLOR_ALIAS_MAP[noColorSuffix];
  if (COLOR_ALIAS_MAP[clean]) return COLOR_ALIAS_MAP[clean];

  return null;
}

/**
 * 解析一组颜色字符串（数组或以 / 、,，/ 分隔的字符串）为标准色去重数组。
 * 上限 max；超过 max 截断。
 */
export function normalizeSystemColorList(values: unknown, max: number): SystemColor[] {
  const source = Array.isArray(values)
    ? values
    : typeof values === "string"
    ? values.split(/[、,，/|;；\s]+/u)
    : [];
  const result: SystemColor[] = [];
  for (const value of source) {
    if (typeof value !== "string") continue;
    const normalized = normalizeSystemColorValue(value);
    if (!normalized) continue;
    if (result.includes(normalized)) continue;
    result.push(normalized);
    if (result.length >= max) break;
  }
  return result;
}

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

/**
 * 静态自检：模块加载时一次性校验别名/标准色唯一性。
 * 任意冲突抛错。运行时无副作用。
 */
function assertCatalogInvariants(): void {
  const seenValues = new Set<string>();
  const seenAliases = new Set<string>();
  for (const entry of COLOR_CATALOG) {
    if (seenValues.has(entry.value)) {
      throw new Error(`ColorCatalog: duplicate value "${entry.value}"`);
    }
    seenValues.add(entry.value);
    for (const alias of entry.aliases) {
      if (seenAliases.has(alias)) {
        throw new Error(`ColorCatalog: duplicate alias "${alias}"`);
      }
      seenAliases.add(alias);
      if (alias === entry.value) {
        throw new Error(`ColorCatalog: alias equals value for "${entry.value}"`);
      }
      if (seenValues.has(alias)) {
        throw new Error(`ColorCatalog: alias "${alias}" conflicts with another standard value`);
      }
    }
  }
}

assertCatalogInvariants();