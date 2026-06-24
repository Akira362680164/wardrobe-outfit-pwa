// src/lib/garment-category-catalog.ts
// v0.9.46-dev 基础设施批次 1: 完整衣物一级分类与二级分类目录 + 工具函数 + 兼容映射

export interface GarmentSubcategoryOption {
  id: string;
  label: string;
}

export interface GarmentCategoryGroup {
  id: string;
  label: string;
  icon?: string;
  subcategories: GarmentSubcategoryOption[];
}

export const GARMENT_CATEGORY_CATALOG: GarmentCategoryGroup[] = [
  {
    id: "tops",
    label: "上衣",
    subcategories: [
      { id: "t_shirt", label: "T恤" },
      { id: "polo", label: "POLO衫" },
      { id: "shirt", label: "衬衫" },
      { id: "blouse", label: "女衫" },
      { id: "vest", label: "马甲" },
      { id: "sweater_knit", label: "毛衣/针织" },
      { id: "hoodie_sweatshirt", label: "卫衣" },
      { id: "suit_jacket", label: "西装" },
      { id: "denim_jacket", label: "牛仔衣" },
      { id: "baseball_jacket", label: "棒球服" },
      { id: "jacket", label: "夹克" },
      { id: "padded_fleece", label: "棉衣/羊羔绒" },
      { id: "trench_coat", label: "风衣" },
      { id: "overcoat", label: "大衣" },
      { id: "down_jacket", label: "羽绒服" },
      { id: "leather_jacket", label: "皮衣" },
      { id: "fur", label: "皮草" },
      { id: "cape", label: "斗篷" },
      { id: "camisole", label: "吊带" },
      { id: "tank_top", label: "背心" },
      { id: "tube_top", label: "抹胸" },
      { id: "other_tops", label: "其他上衣" },
    ],
  },
  {
    id: "pants",
    label: "裤子",
    subcategories: [
      { id: "jeans", label: "牛仔裤" },
      { id: "casual_pants", label: "休闲裤" },
      { id: "sports_pants", label: "运动裤" },
      { id: "suit_pants", label: "西装裤" },
      { id: "leggings", label: "打底裤" },
      { id: "leather_pants", label: "皮裤" },
      { id: "other_pants", label: "其他裤子" },
    ],
  },
  {
    id: "skirts",
    label: "半身裙",
    subcategories: [
      { id: "pencil_skirt", label: "包臀裙" },
      { id: "pinafore_skirt", label: "背带裙" },
      { id: "tutu_skirt", label: "蓬蓬裙" },
      { id: "a_line_skirt", label: "A字裙" },
      { id: "pleated_skirt", label: "百褶裙" },
      { id: "other_skirts", label: "其他半身裙" },
    ],
  },
  {
    id: "one_piece",
    label: "连体装",
    subcategories: [
      { id: "dress", label: "连衣裙" },
      { id: "jumpsuit", label: "连衣裤" },
    ],
  },
  {
    id: "shoes",
    label: "鞋",
    subcategories: [
      { id: "high_heels", label: "高跟鞋" },
      { id: "loafers", label: "乐福鞋" },
      { id: "long_boots", label: "长靴" },
      { id: "ankle_boots", label: "跟/短靴" },
      { id: "flat_fashion_shoes", label: "平底时装鞋" },
      { id: "sandals", label: "凉鞋" },
      { id: "skate_shoes", label: "板鞋" },
      { id: "canvas_shoes", label: "帆布鞋" },
      { id: "sneakers", label: "运动鞋" },
      { id: "driving_shoes", label: "豆豆鞋" },
      { id: "clogs", label: "洞洞鞋" },
      { id: "platform_shoes", label: "松糕鞋" },
      { id: "slip_ons", label: "懒人鞋" },
      { id: "snow_boots", label: "雪地鞋" },
      { id: "casual_shoes", label: "休闲鞋" },
      { id: "slippers", label: "拖鞋" },
      { id: "other_shoes", label: "其他鞋类" },
    ],
  },
  {
    id: "bags",
    label: "包",
    subcategories: [
      { id: "casual_sport_bag", label: "休闲/运动包" },
      { id: "fashion_bag", label: "时装包" },
      { id: "canvas_bag", label: "帆布包" },
      { id: "waist_chest_bag", label: "腰/胸包" },
      { id: "luggage", label: "箱包" },
      { id: "clutch", label: "手拿包" },
      { id: "backpack", label: "双肩包" },
      { id: "other_bags", label: "其他包类" },
    ],
  },
  {
    id: "hats",
    label: "帽子",
    subcategories: [
      { id: "baseball_cap", label: "鸭舌帽" },
      { id: "beret", label: "贝雷帽" },
      { id: "knit_hat", label: "毛线帽" },
      { id: "sun_hat", label: "遮阳帽" },
      { id: "headscarf_hat", label: "头巾帽" },
      { id: "bucket_hat", label: "渔夫帽" },
      { id: "flat_cap", label: "平顶帽" },
      { id: "newsboy_cap", label: "报童帽" },
      { id: "lei_feng_hat", label: "雷锋帽" },
      { id: "fedora_hat", label: "礼帽" },
      { id: "other_hats", label: "其他帽子" },
    ],
  },
  {
    id: "jewelry",
    label: "首饰",
    subcategories: [
      { id: "bracelet_bangle", label: "手链/镯" },
      { id: "ring", label: "戒指" },
      { id: "brooch", label: "胸针" },
      { id: "necklace", label: "项链" },
      { id: "earrings", label: "耳饰" },
      { id: "other_jewelry", label: "其他首饰" },
    ],
  },
  {
    id: "accessories",
    label: "配饰",
    subcategories: [
      { id: "watch", label: "手表" },
      { id: "hair_accessory", label: "发饰" },
      { id: "underwear", label: "内衣" },
      { id: "socks", label: "袜子" },
      { id: "tie", label: "领带" },
      { id: "belt_chain", label: "腰带/腰链" },
      { id: "scarf_shawl", label: "围巾/披肩" },
      { id: "silk_scarf", label: "丝巾" },
      { id: "gloves", label: "手套" },
      { id: "glasses", label: "眼镜" },
      { id: "other_accessories", label: "其他配饰" },
    ],
  },
];

const groupById = new Map<string, GarmentCategoryGroup>();
for (const g of GARMENT_CATEGORY_CATALOG) {
  groupById.set(g.id, g);
}

export function getCategoryGroupById(id: string): GarmentCategoryGroup | undefined {
  return groupById.get(id);
}

export function getSubcategoryById(groupId: string, subcategoryId: string): GarmentSubcategoryOption | undefined {
  const group = groupById.get(groupId);
  return group?.subcategories.find((s) => s.id === subcategoryId);
}

export function getCategoryLabel(groupId: string): string {
  return groupById.get(groupId)?.label ?? groupId;
}

export function getSubcategoryLabel(groupId: string, subcategoryId?: string): string {
  if (!subcategoryId) return "";
  const group = groupById.get(groupId);
  const sub = group?.subcategories.find((s) => s.id === subcategoryId);
  return sub?.label ?? subcategoryId;
}

/**
 * 旧 GarmentCategory 枚举 → 新 catalog group id 兼容映射。
 * 旧值不在映射中时返回 undefined，调用方可自行兜底。
 */
export function mapLegacyCategoryToCatalogGroup(category: string): string | undefined {
  const map: Record<string, string> = {
    top: "tops",
    outerwear: "tops",
    bottom: "pants",
    dress: "one_piece",
    shoes: "shoes",
    bag: "bags",
    hat: "hats",
    necklace: "jewelry",
    bracelet: "jewelry",
    bangle: "jewelry",
  };
  return map[category];
}
