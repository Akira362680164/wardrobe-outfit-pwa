// src/lib/wishlist-display-state.ts
// v0.9.49-dev 种草 2.0: 展示层派生状态、彩色胶囊标签、卡片副标题。

import type { WishlistItem, WishlistRuleAssessment } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  WishlistDisplayState                                               */
/* ------------------------------------------------------------------ */

export type WishlistDisplayState =
  | "pending_assessment"
  | "worth_buying"
  | "consider"
  | "not_recommended"
  | "rejected"
  | "purchased"
  | "archived";

export function getWishlistDisplayState(item: WishlistItem): WishlistDisplayState {
  if (item.convertedItemId || item.convertedAt) return "purchased";
  if (item.status === "archived") return "archived";
  if (item.status === "rejected") return "rejected";

  switch (item.aiAssessment?.verdict) {
    case "worth_buying":
      return "worth_buying";
    case "consider":
      return "consider";
    case "not_recommended":
      return "not_recommended";
    default:
      return "pending_assessment";
  }
}

export function getWishlistDisplayLabel(state: WishlistDisplayState): string {
  switch (state) {
    case "pending_assessment": return "待评估";
    case "worth_buying": return "建议买";
    case "consider": return "再考虑";
    case "not_recommended": return "不建议";
    case "rejected": return "不想要了";
    case "purchased": return "已购买";
    case "archived": return "已归档";
  }
}

/* ------------------------------------------------------------------ */
/*  状态胶囊颜色                                                        */
/* ------------------------------------------------------------------ */

export function getWishlistStatusCapsuleColor(state: WishlistDisplayState): {
  bg: string;
  text: string;
} {
  switch (state) {
    case "pending_assessment":
      return { bg: "bg-ink/10", text: "text-ink/60" };
    case "worth_buying":
      return { bg: "bg-emerald-100", text: "text-emerald-700" };
    case "consider":
      return { bg: "bg-amber-100", text: "text-amber-700" };
    case "not_recommended":
      return { bg: "bg-red-100", text: "text-red-600" };
    case "rejected":
      return { bg: "bg-red-50", text: "text-red-400" };
    case "purchased":
      return { bg: "bg-teal-100", text: "text-teal-700" };
    case "archived":
      return { bg: "bg-ink/10", text: "text-ink/50" };
  }
}

/* ------------------------------------------------------------------ */
/*  首页卡片第三行摘要                                                   */
/* ------------------------------------------------------------------ */

export function getWishlistCardSubtitle(
  item: WishlistItem,
  ruleAssessment?: WishlistRuleAssessment,
): string {
  const state = getWishlistDisplayState(item);

  if (state === "purchased") return "已加入衣橱";
  if (state === "rejected") return "可从不感兴趣中恢复";
  if (state === "archived") return "历史记录";

  if (!item.aiAssessment && !ruleAssessment) return "点击查看";

  const matchCount = ruleAssessment?.matchCount
    ?? item.aiAssessment?.suggestedOutfits?.length
    ?? 0;
  const similarCount = ruleAssessment?.similarCount
    ?? item.aiAssessment?.similarOwnedItemIds?.length
    ?? 0;

  if (state === "not_recommended") {
    if (similarCount > 0) return `相似 ${similarCount} 件`;
    return "重复或适配风险较高";
  }

  if (matchCount > 0) return `可搭 ${matchCount} 件`;
  if (similarCount > 0) return `相似 ${similarCount} 件`;

  return "点击查看";
}

/* ------------------------------------------------------------------ */
/*  主列表过滤                                                          */
/* ------------------------------------------------------------------ */

export function isMainWishlistItem(item: WishlistItem): boolean {
  return item.status === "interested" && !item.convertedItemId && !item.convertedAt;
}

export type WishlistMainFilter = "all" | "pending" | "worth_buying" | "consider" | "not_recommended";

export function filterMainWishlistItems(
  items: WishlistItem[],
  filter: WishlistMainFilter,
): WishlistItem[] {
  const main = items.filter(isMainWishlistItem);

  if (filter === "all") return main;

  return main.filter((item) => {
    const state = getWishlistDisplayState(item);
    if (filter === "pending") return state === "pending_assessment";
    if (filter === "worth_buying") return state === "worth_buying";
    if (filter === "consider") return state === "consider";
    if (filter === "not_recommended") return state === "not_recommended";
    return true;
  });
}

/* ------------------------------------------------------------------ */
/*  三点菜单统计                                                        */
/* ------------------------------------------------------------------ */

export function countPurchasedWishlistItems(items: WishlistItem[]): number {
  return items.filter((item) => item.convertedItemId || item.convertedAt).length;
}

export function countRejectedWishlistItems(items: WishlistItem[]): number {
  return items.filter((item) => item.status === "rejected").length;
}

export function countArchivedWishlistItems(items: WishlistItem[]): number {
  return items.filter(
    (item) => item.status === "archived" && !item.convertedItemId && !item.convertedAt,
  ).length;
}

/* ------------------------------------------------------------------ */
/*  筛选栏数量（仅统计种草中商品）                                        */
/* ------------------------------------------------------------------ */

export function getMainWishlistFilterCounts(items: WishlistItem[]) {
  const main = items.filter(isMainWishlistItem);
  let pending = 0, worthBuying = 0, consider = 0, notRecommended = 0;
  for (const w of main) {
    const s = getWishlistDisplayState(w);
    if (s === "pending_assessment") pending++;
    else if (s === "worth_buying") worthBuying++;
    else if (s === "consider") consider++;
    else if (s === "not_recommended") notRecommended++;
  }
  return { total: main.length, pending, worthBuying, consider, notRecommended };
}
