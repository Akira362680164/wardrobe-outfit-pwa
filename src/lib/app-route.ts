// v1.1.7 4A: AppRoute 导航模型 — 纯函数路由定义，不依赖 React/Dexie/window
// v1.1.20-dev: 录入流路由化 — intake_* 三个 route 把 create flow 纳入同一套路由模型，
// 消除 wardrobe-app 顶部 activeView 独立 state（参见方案 C：route 派生 view）。
export type MainTabKey = "wardrobe" | "recommend" | "shopping" | "settings";

export type AppRouteName =
  | "wardrobe_home"
  | "garment_detail"
  | "outfit_home"
  | "outfit_detail"
  | "outfit_calendar"
  | "wishlist_home"
  | "wishlist_purchased"
  | "wishlist_rejected"
  | "wishlist_archived"
  | "settings_home"
  | "account_management"
  | "change_password"
  | "intake_single_item"
  | "intake_outfit"
  | "intake_wishlist";

export type GarmentDetailTab = "info" | "inspiration" | "pairing";

export type AppRoute =
  | { name: "wardrobe_home" }
  | { name: "garment_detail"; itemId: number; returnTo: AppRouteName; initialTab?: GarmentDetailTab; returnRoute?: AppRoute }
  | { name: "outfit_home" }
  | { name: "outfit_detail"; outfitId: string; returnTo: AppRouteName; returnRoute?: AppRoute }
  | { name: "outfit_calendar" }
  | { name: "wishlist_home" }
  | { name: "wishlist_purchased" }
  | { name: "wishlist_rejected" }
  | { name: "wishlist_archived" }
  | { name: "settings_home" }
  | { name: "account_management" }
  | { name: "change_password" }
  | { name: "intake_single_item"; returnTo: AppRouteName }
  | { name: "intake_outfit"; returnTo: AppRouteName }
  | { name: "intake_wishlist"; returnTo: AppRouteName };

// v2.0.12-test: 全局加号白名单——只有三个主首页 (wardrobe / outfit / wishlist) 允许显示全局加号；
// 详情页、编辑页、设置/账号/修改密码、所有 wishlist_* 子页、所有 intake_* 路由、outfit_calendar 全部隐藏。
// 加白名单优先于不断累加黑名单。
const GLOBAL_CREATE_ALLOWED_ROUTE_NAMES: ReadonlySet<AppRouteName> = new Set([
  "wardrobe_home",
  "outfit_home",
  "wishlist_home",
]);

export function isGlobalCreateAllowedRoute(name: AppRouteName): boolean {
  return GLOBAL_CREATE_ALLOWED_ROUTE_NAMES.has(name);
}

export function getMainTabFromRoute(route: AppRoute): MainTabKey {
  switch (route.name) {
    case "wardrobe_home":
      return "wardrobe";
    case "garment_detail":
      if (route.returnTo.startsWith("wishlist_")) return "shopping";
      return "wardrobe";
    case "outfit_home":
    case "outfit_detail":
    case "outfit_calendar":
    case "intake_outfit":
      return "recommend";
    case "wishlist_home":
    case "wishlist_purchased":
    case "wishlist_rejected":
    case "wishlist_archived":
    case "intake_wishlist":
      return "shopping";
    case "settings_home":
    case "account_management":
    case "change_password":
      return "settings";
    case "intake_single_item":
      return "wardrobe";
  }
}

export function getBackRoute(route: AppRoute): AppRoute {
  switch (route.name) {
    case "garment_detail": {
      if (route.returnRoute) return route.returnRoute;
      const rt = route.returnTo;
      if (rt === "wishlist_purchased") return { name: "wishlist_purchased" };
      if (rt === "wishlist_rejected") return { name: "wishlist_rejected" };
      if (rt === "wishlist_archived") return { name: "wishlist_archived" };
      return { name: "wardrobe_home" };
    }
    case "outfit_detail": {
      if (route.returnRoute) return route.returnRoute;
      if (route.returnTo === "outfit_calendar") return { name: "outfit_calendar" };
      return { name: "outfit_home" };
    }
    case "wishlist_purchased":
    case "wishlist_rejected":
    case "wishlist_archived":
      return { name: "wishlist_home" };
    case "outfit_calendar":
      return { name: "outfit_home" };
    case "account_management":
      return { name: "settings_home" };
    case "change_password":
      return { name: "account_management" };
    case "intake_single_item":
    case "intake_outfit":
    case "intake_wishlist":
      // 录入流返回到用户进入录入前的具体 route（由创建时记录的 returnTo 决定）。
      return { name: route.returnTo } as AppRoute;
    case "wardrobe_home":
    case "outfit_home":
    case "wishlist_home":
    case "settings_home":
      return route;
  }
}

export function isWishlistRouteName(name: AppRouteName): boolean {
  return name.startsWith("wishlist_");
}

export function isIntakeRouteName(name: AppRouteName): boolean {
  return name === "intake_single_item" || name === "intake_outfit" || name === "intake_wishlist";
}

export function isDetailRoute(route: AppRoute): boolean {
  return route.name === "garment_detail" || route.name === "outfit_detail";
}

export function getMainTabHomeRoute(tab: MainTabKey): AppRoute {
  switch (tab) {
    case "wardrobe": return { name: "wardrobe_home" };
    case "recommend": return { name: "outfit_home" };
    case "shopping": return { name: "wishlist_home" };
    case "settings": return { name: "settings_home" };
  }
}

export function resolveCreateFallbackRoute(route: AppRoute): AppRoute {
  // 录入流本身也是 create flow 的一部分：从 intake_* fallback 时回到对应 tab 的 main home。
  const tab = getMainTabFromRoute(route);
  return getMainTabHomeRoute(tab);
}

export function routeToDebugLabel(route: AppRoute): string {
  switch (route.name) {
    case "wardrobe_home": return "衣橱首页";
    case "garment_detail": return `衣物详情(${route.itemId})`;
    case "outfit_home": return "套装首页";
    case "outfit_detail": return `套装详情(${route.outfitId})`;
    case "outfit_calendar": return "月历页";
    case "wishlist_home": return "种草首页";
    case "wishlist_purchased": return "已买单品";
    case "wishlist_rejected": return "不感兴趣";
    case "wishlist_archived": return "已归档";
    case "settings_home": return "设置";
    case "account_management": return "账号管理";
    case "change_password": return "修改密码";
    case "intake_single_item": return `单品录入→${route.returnTo}`;
    case "intake_outfit": return `套装录入→${route.returnTo}`;
    case "intake_wishlist": return `种草录入→${route.returnTo}`;
  }
}
