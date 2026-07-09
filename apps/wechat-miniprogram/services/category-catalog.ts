export type CategoryOption = {
  value: string;
  label: string;
};

export type CategoryGroup = CategoryOption & {
  subcategories: CategoryOption[];
};

export const GARMENT_CATEGORY_CATALOG: CategoryGroup[] = [
  {
    value: "tops",
    label: "上衣",
    subcategories: [
      { value: "t_shirt", label: "T恤" },
      { value: "polo", label: "POLO衫" },
      { value: "shirt", label: "衬衫" },
      { value: "blouse", label: "女衫" },
      { value: "vest", label: "马甲" },
      { value: "sweater_knit", label: "毛衣/针织" },
      { value: "hoodie_sweatshirt", label: "卫衣" },
      { value: "suit_jacket", label: "西装" },
      { value: "denim_jacket", label: "牛仔衣" },
      { value: "baseball_jacket", label: "棒球服" },
      { value: "jacket", label: "夹克" },
      { value: "padded_fleece", label: "棉衣/羊羔绒" },
      { value: "trench_coat", label: "风衣" },
      { value: "overcoat", label: "大衣" },
      { value: "down_jacket", label: "羽绒服" },
      { value: "leather_jacket", label: "皮衣" },
      { value: "fur", label: "皮草" },
      { value: "cape", label: "斗篷" },
      { value: "camisole", label: "吊带" },
      { value: "tank_top", label: "背心" },
      { value: "tube_top", label: "抹胸" },
      { value: "other_tops", label: "其他上衣" },
    ],
  },
  {
    value: "pants",
    label: "裤子",
    subcategories: [
      { value: "jeans", label: "牛仔长裤" },
      { value: "denim_shorts", label: "牛仔短裤" },
      { value: "casual_pants", label: "休闲长裤" },
      { value: "casual_shorts", label: "休闲短裤" },
      { value: "sports_pants", label: "运动长裤" },
      { value: "sports_shorts", label: "运动短裤" },
      { value: "cargo_pants", label: "工装长裤" },
      { value: "cargo_shorts", label: "工装短裤" },
      { value: "suit_pants", label: "西装裤" },
      { value: "leggings", label: "打底裤" },
      { value: "leather_pants", label: "皮裤" },
      { value: "other_pants", label: "其他裤子" },
    ],
  },
  {
    value: "skirts",
    label: "半身裙",
    subcategories: [
      { value: "pencil_skirt", label: "包臀裙" },
      { value: "pinafore_skirt", label: "背带裙" },
      { value: "tutu_skirt", label: "蓬蓬裙" },
      { value: "a_line_skirt", label: "A字裙" },
      { value: "pleated_skirt", label: "百褶裙" },
      { value: "other_skirts", label: "其他半身裙" },
    ],
  },
  {
    value: "one_piece",
    label: "连体装",
    subcategories: [
      { value: "dress", label: "连衣裙" },
      { value: "jumpsuit", label: "连衣裤" },
    ],
  },
  {
    value: "shoes",
    label: "鞋",
    subcategories: [
      { value: "high_heels", label: "高跟鞋" },
      { value: "loafers", label: "乐福鞋" },
      { value: "long_boots", label: "长靴" },
      { value: "ankle_boots", label: "跟/短靴" },
      { value: "flat_fashion_shoes", label: "平底时装鞋" },
      { value: "sandals", label: "凉鞋" },
      { value: "skate_shoes", label: "板鞋" },
      { value: "canvas_shoes", label: "帆布鞋" },
      { value: "sneakers", label: "运动鞋" },
      { value: "driving_shoes", label: "豆豆鞋" },
      { value: "clogs", label: "洞洞鞋" },
      { value: "platform_shoes", label: "松糕鞋" },
      { value: "slip_ons", label: "懒人鞋" },
      { value: "snow_boots", label: "雪地鞋" },
      { value: "casual_shoes", label: "休闲鞋" },
      { value: "slippers", label: "拖鞋" },
      { value: "other_shoes", label: "其他鞋类" },
    ],
  },
  {
    value: "bags",
    label: "包",
    subcategories: [
      { value: "casual_sport_bag", label: "休闲/运动包" },
      { value: "fashion_bag", label: "时装包" },
      { value: "canvas_bag", label: "帆布包" },
      { value: "waist_chest_bag", label: "腰/胸包" },
      { value: "luggage", label: "箱包" },
      { value: "clutch", label: "手拿包" },
      { value: "backpack", label: "双肩包" },
      { value: "other_bags", label: "其他包类" },
    ],
  },
  {
    value: "hats",
    label: "帽子",
    subcategories: [
      { value: "baseball_cap", label: "鸭舌帽" },
      { value: "beret", label: "贝雷帽" },
      { value: "knit_hat", label: "毛线帽" },
      { value: "sun_hat", label: "遮阳帽" },
      { value: "headscarf_hat", label: "头巾帽" },
      { value: "bucket_hat", label: "渔夫帽" },
      { value: "flat_cap", label: "平顶帽" },
      { value: "newsboy_cap", label: "报童帽" },
      { value: "lei_feng_hat", label: "雷锋帽" },
      { value: "fedora_hat", label: "礼帽" },
      { value: "other_hats", label: "其他帽子" },
    ],
  },
  {
    value: "jewelry",
    label: "首饰",
    subcategories: [
      { value: "bracelet_bangle", label: "手链/镯" },
      { value: "ring", label: "戒指" },
      { value: "brooch", label: "胸针" },
      { value: "necklace", label: "项链" },
      { value: "earrings", label: "耳饰" },
      { value: "other_jewelry", label: "其他首饰" },
    ],
  },
  {
    value: "accessories",
    label: "配饰",
    subcategories: [
      { value: "watch", label: "手表" },
      { value: "hair_accessory", label: "发饰" },
      { value: "underwear", label: "内衣" },
      { value: "socks", label: "袜子" },
      { value: "tie", label: "领带" },
      { value: "belt_chain", label: "腰带/腰链" },
      { value: "scarf_shawl", label: "围巾/披肩" },
      { value: "silk_scarf", label: "丝巾" },
      { value: "gloves", label: "手套" },
      { value: "glasses", label: "眼镜" },
      { value: "other_accessories", label: "其他配饰" },
    ],
  },
];

const LEGACY_CATEGORY_MAP: Record<string, string> = {
  top: "tops",
  outerwear: "tops",
  bottom: "pants",
  dress: "one_piece",
  bag: "bags",
  hat: "hats",
  necklace: "jewelry",
  bracelet: "jewelry",
  bangle: "jewelry",
};

export const CATEGORY_OPTIONS: CategoryOption[] = GARMENT_CATEGORY_CATALOG.map(({ value, label }) => ({ value, label }));

export function normalizeCategoryId(category: string): string {
  return GARMENT_CATEGORY_CATALOG.some((item) => item.value === category) ? category : LEGACY_CATEGORY_MAP[category] ?? category;
}

export function getCategoryLabel(category: string): string {
  const normalized = normalizeCategoryId(category);
  return GARMENT_CATEGORY_CATALOG.find((item) => item.value === normalized)?.label ?? "未分类";
}

export function getSubcategoryOptions(category: string): CategoryOption[] {
  const normalized = normalizeCategoryId(category);
  return GARMENT_CATEGORY_CATALOG.find((item) => item.value === normalized)?.subcategories ?? [];
}

export function getSubcategoryLabel(category: string, subcategory?: string): string {
  if (!subcategory) return "";
  return getSubcategoryOptions(category).find((item) => item.value === subcategory)?.label ?? subcategory;
}

export function isSubcategoryInCategory(category: string, subcategory?: string): boolean {
  if (!subcategory) return true;
  return getSubcategoryOptions(category).some((item) => item.value === subcategory);
}

export function buildSubcategoryChoices(category: string, selected?: string): Array<CategoryOption & { selected: boolean }> {
  return getSubcategoryOptions(category).map((item) => ({ ...item, selected: item.value === selected }));
}
