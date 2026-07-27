"use client";

// v1.1.7 4A: AppRoute navigation controller
// Manages the current route and exposes navigation helpers.
// Pure navigation state — no Dexie, no toast, no UI rendering.
// v1.1.20-dev commit2: 集中打 route_change / create_return_route_recorded /
// create_flow_closed 三个 P0 诊断事件, 让 Bug 1 (加号返回) / Bug 2 (详情返回)
// 的完整 route 轨迹在导出日志里可复现。
import { useState, useCallback, useRef } from "react";
import type { AppRoute, MainTabKey, NavigationDirection, NavigationTransition } from "@/lib/app-route";
import { createNavigationTransition, getMainTabFromRoute, getBackRoute, resolveCreateFallbackRoute } from "@/lib/app-route";
import { recordDiagnosticEvent } from "@/lib/diagnostic-log";
import { getWardoraHomeRoute } from "@/lib/home/home-feed-rollout";

export type RouteChangeSource = "user" | "back" | "create" | "nav" | "system";

export interface NavigationController {
  route: AppRoute;
  transition: NavigationTransition;
  mainTab: MainTabKey;
  openRoute: (next: AppRoute) => void;
  popToRoute: (next: AppRoute) => void;
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

const DEFAULT_ROUTE: AppRoute = getWardoraHomeRoute();

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
  const initialRouteRef = useRef<AppRoute>(initialRoute ?? DEFAULT_ROUTE);
  const [navigationState, setNavigationState] = useState(() => ({
    route: initialRouteRef.current,
    transition: createNavigationTransition(
      0,
      initialRouteRef.current,
      initialRouteRef.current,
      "system",
      "replace",
    ),
  }));
  const [createReturnRoute, setCreateReturnRoute] = useState<AppRoute | null>(null);
  const route = navigationState.route;
  const routeRef = useRef(route);
  const nextTransitionIdRef = useRef(1);
  const createReturnRouteRef = useRef<AppRoute | null>(null);

  // P0 诊断事件: route_change
  // 每次真实 route 切换都记录 (from / to / source),
  // 让 Bug 1 (加号返回目标错) / Bug 2 (详情返回目标错) 完整可复现。
  // 同 route 不打 (routeEquals 判断) — 避免重复点击 nav 把 route 覆盖刷屏。
  const setRoute = useCallback((next: AppRoute, source: RouteChangeSource = "system", direction: NavigationDirection = "replace") => {
    const from = routeRef.current;
    if (routeEquals(from, next)) return;
    const transition = createNavigationTransition(
      nextTransitionIdRef.current++,
      from,
      next,
      source,
      direction,
    );
    routeRef.current = next;
    setNavigationState({ route: next, transition });
    recordDiagnosticEvent("route_change", { from, to: next, source, direction });
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
      setRoute(returnTo, "create", "pop");
    } else {
      setRoute(resolveCreateFallbackRoute(before), "create", "pop");
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
    setRoute(next, "user", "push");
  }, [setRoute]);

  const popToRoute = useCallback((next: AppRoute) => {
    setRoute(next, "back", "pop");
  }, [setRoute]);

  const replaceRoute = useCallback((next: AppRoute) => {
    setRoute(next, "user", "replace");
  }, [setRoute]);

  const goBack = useCallback(() => {
    setRoute(getBackRoute(routeRef.current), "back", "pop");
  }, [setRoute]);

  // P0 诊断事件: nav_clicked 由 wardrobe-app 在 NavButton / MobileNavButton onClick 调
  // resetToMainTab 之前主动打点 (因为 controller 不知道 fromMainTab), 这里只负责切换。
  const resetToMainTab = useCallback((tab: MainTabKey) => {
    switch (tab) {
      case "wardrobe": setRoute(getWardoraHomeRoute(), "nav", "tab"); break;
      case "recommend": setRoute({ name: "outfit_home" }, "nav", "tab"); break;
      case "shopping": setRoute({ name: "wishlist_home" }, "nav", "tab"); break;
      case "settings": setRoute({ name: "settings_home" }, "nav", "tab"); break;
    }
  }, [setRoute]);

  const openGarmentDetailFromWardrobe = useCallback((itemId: number) => {
    setRoute({ name: "garment_detail", itemId, returnTo: getWardoraHomeRoute().name }, "user", "push");
  }, [setRoute]);

  const openGarmentDetailFromWishlistPurchased = useCallback((itemId: number) => {
    setRoute({ name: "garment_detail", itemId, returnTo: "wishlist_purchased" }, "user", "push");
  }, [setRoute]);

  const openOutfitDetailFromLibrary = useCallback((outfitId: string) => {
    setRoute({ name: "outfit_detail", outfitId, returnTo: "outfit_home" }, "user", "push");
  }, [setRoute]);

  const openOutfitDetailFromCalendar = useCallback((outfitId: string) => {
    setRoute({ name: "outfit_detail", outfitId, returnTo: "outfit_calendar" }, "user", "push");
  }, [setRoute]);

  const openWishlistPurchased = useCallback(() => {
    setRoute({ name: "wishlist_purchased" }, "user", "push");
  }, [setRoute]);

  const openWishlistRejected = useCallback(() => {
    setRoute({ name: "wishlist_rejected" }, "user", "push");
  }, [setRoute]);

  const openWishlistArchived = useCallback(() => {
    setRoute({ name: "wishlist_archived" }, "user", "push");
  }, [setRoute]);

  const openOutfitCalendar = useCallback(() => {
    setRoute({ name: "outfit_calendar" }, "user", "push");
  }, [setRoute]);

  return {
    route,
    transition: navigationState.transition,
    mainTab,
    openRoute,
    popToRoute,
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
