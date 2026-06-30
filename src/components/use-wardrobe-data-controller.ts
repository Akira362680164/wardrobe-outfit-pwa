"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useOnlineWorkspaceGate } from "@/components/auth/workspace-gate";
import { recordDiagnosticEvent } from "@/lib/diagnostic-log";
import { onlineErrorMessage } from "@/lib/online/online-error";
import { OnlineWorkspaceRepository, type OnlineWorkspaceSnapshot } from "@/lib/online/online-repository";
import {
  beginOnlineLoad,
  failOnlineLoad,
  finishOnlineLoad,
  initialOnlineState,
  type OnlineListState,
} from "@/lib/online/online-state";
import type {
  ClosetLocation,
  OutfitCalendarPlan,
  OutfitPlanEntry,
  PlanPackingChecklistItem,
  SavedOutfit,
  WardrobeItem,
  WishlistItem,
} from "@/lib/types";

export function useWardrobeDataController() {
  const gate = useOnlineWorkspaceGate();
  const ownedRepository = useRef<OnlineWorkspaceRepository | null>(null);
  const repository = gate?.repository ?? (ownedRepository.current ??= new OnlineWorkspaceRepository());
  const [onlineState, setOnlineState] = useState<OnlineListState<OnlineWorkspaceSnapshot>>(
    gate ? finishOnlineLoad(gate.initialSnapshot) : initialOnlineState,
  );
  const snapshot = onlineState.data;
  const [items, setItems] = useState<WardrobeItem[]>(snapshot?.items ?? []);
  const [locations, setLocations] = useState<ClosetLocation[]>(snapshot?.locations ?? []);
  const [outfits, setOutfits] = useState<SavedOutfit[]>(snapshot?.outfits ?? []);
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>(snapshot?.wishlistItems ?? []);
  const [outfitPlanEntries, setOutfitPlanEntries] = useState<OutfitPlanEntry[]>(snapshot?.outfitPlanEntries ?? []);
  const [outfitCalendarPlans, setOutfitCalendarPlans] = useState<OutfitCalendarPlan[]>(snapshot?.outfitCalendarPlans ?? []);
  const [planPackingChecklistItems, setPlanPackingChecklistItems] = useState<PlanPackingChecklistItem[]>(snapshot?.planPackingChecklistItems ?? []);

  const applySnapshot = useCallback((next: OnlineWorkspaceSnapshot) => {
    setItems(next.items);
    setLocations(next.locations);
    setOutfits(next.outfits);
    setWishlistItems(next.wishlistItems);
    setOutfitPlanEntries(next.outfitPlanEntries);
    setOutfitCalendarPlans(next.outfitCalendarPlans);
    setPlanPackingChecklistItems(next.planPackingChecklistItems);
  }, []);

  const refreshState = useCallback(async () => {
    setOnlineState((current) => beginOnlineLoad(current));
    recordDiagnosticEvent("network", "online_workspace_refresh", { phase: "started", severity: "info" });
    try {
      const next = await repository.getOverview();
      applySnapshot(next);
      setOnlineState(finishOnlineLoad(next));
      recordDiagnosticEvent("network", "online_workspace_refresh", {
        phase: "succeeded", severity: "info", requestId: next.requestId,
        metadata: { itemCount: next.items.length, outfitCount: next.outfits.length, wishlistCount: next.wishlistItems.length },
      });
    } catch (error) {
      const message = onlineErrorMessage(error);
      setOnlineState((current) => failOnlineLoad(current, message));
      recordDiagnosticEvent("network", "online_workspace_refresh", { phase: "failed", severity: "error", errorCode: "WORKSPACE_REFRESH_FAILED" });
      throw error;
    }
  }, [applySnapshot, repository]);

  useEffect(() => {
    if (gate) return;
    void refreshState().catch(() => undefined);
    return () => {
      ownedRepository.current?.dispose();
      ownedRepository.current = null;
    };
  }, [gate, refreshState]);

  return {
    items, setItems,
    locations, setLocations,
    outfits, setOutfits,
    wishlistItems, setWishlistItems,
    outfitPlanEntries, setOutfitPlanEntries,
    outfitCalendarPlans, setOutfitCalendarPlans,
    planPackingChecklistItems, setPlanPackingChecklistItems,
    loading: onlineState.status === "loading",
    onlineState,
    onlineRepository: repository,
    refreshState,
  };
}
