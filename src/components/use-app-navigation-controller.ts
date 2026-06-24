"use client";

// v1.1.7 4A: AppRoute navigation controller
// Manages the current route and exposes navigation helpers.
// Pure navigation state — no Dexie, no toast, no UI rendering.
// v1.1.20-dev commit2: 集中打 route_change / create_return_route_recorded /
// create_flow_closed 三个 P0 诊断事件, 让 Bug 1 (加号返回) / Bug 2 (详情返回)
// 的完整 route 轨迹在导出日志里可复现。
import { useState, useCallback, useRef } from "react";
import type { AppRoute, MainTabKey } from "@/lib/app-route";
import { getMainTabFromRoute, getBackRoute, resolveCreateFallbackRoute } from "@/lib/app-route";
import { recordDiagnosticEvent } from "@/lib/diagnostic-log";

export type RouteChangeSource = "user" | "back" | "create" | "nav" | "system";

export interface NavigationController {
  route: AppRoute;
  mainTab: MainTabKey;
  openRoute: (next: AppRoute) => void;
  replaceRoute: (next: AppRoute) => void;
  goBack: () => void;
  resetToMainTab: (tab: MainTabKey) => void;
  openGarmentDetailFromWardrobe: (itemId: number) => void;
  openGarmentDetailFromWishlistPurchased: (itemId: number) => void;
  openOutfitDetailFromLibrary: (outfitId: string) => void;
  openOutfitDetailFromCalendar: (outfitId: string) => void;
  openWishlistPurchased: () => void;
  openWishlistRejected: () => void;
  openWishlistArchived: () => void;
  openOutfitCalendar: () => void;
  createReturnRoute: AppRoute | null;
  rememberCreateReturnRoute: () => void;
  closeCreateFlow: () => void;
}

const DEFAULT_ROUTE: AppRoute = { name: "wardrobe_home" };

function routeEquals(a: AppRoute, b: AppRoute): boolean {
  if (a.name !== b.name) return false;
  if (a.name === "garment_detail" && b.name === "garment_detail") {
    return a.itemId === b.itemId &&
      a.returnTo === b.returnTo &&
      a.initialTab === b.initialTab &&
      JSON.stringify(a.returnRoute ?? null) === JSON.stringify(b.returnRoute ?? null);
  }
  if (a.name === "outfit_detail" && b.name === "outfit_detail") {
    return a.outfitId === b.outfitId &&
      a.returnTo === b.returnTo &&
      JSON.stringify(a.returnRoute ?? null) === JSON.stringify(b.returnRoute ?? null);
  }
  if (
    (a.name === "intake_single_item" || a.name === "intake_outfit" || a.name === "intake_wishlist") &&
    (b.name === "intake_single_item" || b.name === "intake_outfit" || b.name === "intake_wishlist")
  ) {
    return a.returnTo === b.returnTo;
  }
  return true;
}

export function useAppNavigationController(initialRoute?: AppRoute): NavigationController {
  const [route, setRouteState] = useState<AppRoute>(initialRoute ?? DEFAULT_ROUTE);
  const [createReturnRoute, setCreateReturnRoute] = useState<AppRoute | null>(null);
  const routeRef = useRef(route);
  const createReturnRouteRef = useRef<AppRoute | null>(null);
  routeRef.current = route;
  createReturnRouteRef.current = createReturnRoute;

  // P0 诊断事件: route_change
  // 每次真实 route 切换都记录 (from / to / source),
  // 让 Bug 1 (加号返回目标错) / Bug 2 (详情返回目标错) 完整可复现。
  // 同 route 不打 (routeEquals 判断) — 避免重复点击 nav 把 route 覆盖刷屏。
  const setRoute = useCallback((next: AppRoute, source: RouteChangeSource = "system") => {
    const from = routeRef.current;
    routeRef.current = next;
    setRouteState(next);
    if (!routeEquals(from, next)) {
      recordDiagnosticEvent("route_change", { from, to: next, source });
    }
  }, []);

  const rememberCreateReturnRoute = useCallback(() => {
    const current = routeRef.current;
    createReturnRouteRef.current = current;
    setCreateReturnRoute(current);
    // P0 诊断事件: create_return_route_recorded
    // Bug 1 复现必备 — 确认加号按下时记下的"创建后回到哪"是否就是用户实际想回的页面。
    recordDiagnosticEvent("create_return_route_recorded", { createReturnRoute: current });
  }, []);

  const closeCreateFlow = useCallback(() => {
    const before = routeRef.current;
    const returnTo = createReturnRouteRef.current;
    if (returnTo) {
      setRoute(returnTo, "create");
    } else {
      setRoute(resolveCreateFallbackRoute(before), "create");
    }
    // P0 诊断事件: create_flow_closed
    // Bug 1 复现必备 — 确认退出 create flow 走了 if (returnTo) 分支还是 fallback,
    // 以及最终 route 跳到了哪个 AppRouteName。
    recordDiagnosticEvent("create_flow_closed", {
      fromRoute: before,
      returnRoute: returnTo,
      fallbackRoute: returnTo ? null : resolveCreateFallbackRoute(before),
      usedFallback: !returnTo,
    });
    createReturnRouteRef.current = null;
    setCreateReturnRoute(null);
  }, [setRoute]);

  const mainTab = getMainTabFromRoute(route);

  const openRoute = useCallback((next: AppRoute) => {
    setRoute(next, "user");
  }, [setRoute]);

  const replaceRoute = useCallback((next: AppRoute) => {
    setRoute(next, "user");
  }, [setRoute]);

  const goBack = useCallback(() => {
    setRoute(getBackRoute(routeRef.current), "back");
  }, [setRoute]);

  // P0 诊断事件: nav_clicked 由 wardrobe-app 在 NavButton / MobileNavButton onClick 调
  // resetToMainTab 之前主动打点 (因为 controller 不知道 fromMainTab), 这里只负责切换。
  const resetToMainTab = useCallback((tab: MainTabKey) => {
    switch (tab) {
      case "wardrobe": setRoute({ name: "wardrobe_home" }, "nav"); break;
      case "recommend": setRoute({ name: "outfit_home" }, "nav"); break;
      case "shopping": setRoute({ name: "wishlist_home" }, "nav"); break;
      case "settings": setRoute({ name: "settings_home" }, "nav"); break;
    }
  }, [setRoute]);

  const openGarmentDetailFromWardrobe = useCallback((itemId: number) => {
    setRoute({ name: "garment_detail", itemId, returnTo: "wardrobe_home" }, "user");
  }, [setRoute]);

  const openGarmentDetailFromWishlistPurchased = useCallback((itemId: number) => {
    setRoute({ name: "garment_detail", itemId, returnTo: "wishlist_purchased" }, "user");
  }, [setRoute]);

  const openOutfitDetailFromLibrary = useCallback((outfitId: string) => {
    setRoute({ name: "outfit_detail", outfitId, returnTo: "outfit_home" }, "user");
  }, [setRoute]);

  const openOutfitDetailFromCalendar = useCallback((outfitId: string) => {
    setRoute({ name: "outfit_detail", outfitId, returnTo: "outfit_calendar" }, "user");
  }, [setRoute]);

  const openWishlistPurchased = useCallback(() => {
    setRoute({ name: "wishlist_purchased" }, "user");
  }, [setRoute]);

  const openWishlistRejected = useCallback(() => {
    setRoute({ name: "wishlist_rejected" }, "user");
  }, [setRoute]);

  const openWishlistArchived = useCallback(() => {
    setRoute({ name: "wishlist_archived" }, "user");
  }, [setRoute]);

  const openOutfitCalendar = useCallback(() => {
    setRoute({ name: "outfit_calendar" }, "user");
  }, [setRoute]);

  return {
    route,
    mainTab,
    openRoute,
    replaceRoute,
    goBack,
    resetToMainTab,
    openGarmentDetailFromWardrobe,
    openGarmentDetailFromWishlistPurchased,
    openOutfitDetailFromLibrary,
    openOutfitDetailFromCalendar,
    openWishlistPurchased,
    openWishlistRejected,
    openWishlistArchived,
    openOutfitCalendar,
    createReturnRoute,
    rememberCreateReturnRoute,
    closeCreateFlow,
  };
}
