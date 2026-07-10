export const GARMENT_STATUS_VALUES = ["active", "laundry", "repair", "archived"] as const;
export const WISHLIST_STATUS_VALUES = ["interested", "rejected", "archived"] as const;

export type GarmentStatus = (typeof GARMENT_STATUS_VALUES)[number];
export type WishlistStatus = (typeof WISHLIST_STATUS_VALUES)[number];

export const GARMENT_STATUS_LABELS: Readonly<Record<GarmentStatus, string>> = {
  active: "可穿",
  laundry: "清洗中",
  repair: "维修中",
  archived: "已归档",
};

export const WISHLIST_STATUS_LABELS: Readonly<Record<WishlistStatus | "purchased", string>> = {
  interested: "种草中",
  purchased: "已购买",
  rejected: "不想要了",
  archived: "已归档",
};

export function getGarmentStatusLabel(value: string): string {
  return GARMENT_STATUS_LABELS[value as GarmentStatus] ?? value;
}

export function getWishlistStatusLabel(value: string): string {
  return WISHLIST_STATUS_LABELS[value as WishlistStatus | "purchased"] ?? value;
}
