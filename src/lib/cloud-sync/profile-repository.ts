"use client";

import { getAccountWorkspaceDb, type WorkspaceProfileRecord } from "@/lib/account-workspace-db";
import { loadCloudBridgeContext } from "@/lib/cloud-sync/bridge-context";
import { currentWorkspaceGuard, isGuardCurrent, writeProfile } from "@/lib/cloud-sync/sync-engine";
import type { TryOnProfile } from "@/lib/types";

const TRY_ON_PROFILE_ID = "tryOnProfile:default";

const DEFAULT_TRY_ON_PROFILE: TryOnProfile = {
  id: "default",
  enabled: false,
  fitGender: "unspecified",
  updatedAt: new Date().toISOString(),
};

export async function readWorkspaceTryOnProfile(): Promise<TryOnProfile> {
  const ctx = await loadCloudBridgeContext();
  if (!ctx) return DEFAULT_TRY_ON_PROFILE;
  const db = getAccountWorkspaceDb(ctx.workspace);
  const record = await db.profiles.get(TRY_ON_PROFILE_ID);
  if (!record || record.deletedAt || record.profileType !== "tryOn") return DEFAULT_TRY_ON_PROFILE;
  const payload = (record.payload ?? {}) as Partial<TryOnProfile>;
  return {
    ...DEFAULT_TRY_ON_PROFILE,
    ...payload,
    id: "default",
    fitGender: payload.fitGender ?? "unspecified",
    updatedAt: payload.updatedAt ?? record.updatedAt,
  };
}

export async function saveWorkspaceTryOnProfile(profile: TryOnProfile): Promise<void> {
  const ctx = await loadCloudBridgeContext();
  if (!ctx) throw new Error("账号工作区不可用");
  const db = getAccountWorkspaceDb(ctx.workspace);
  const existing = await db.profiles.get(TRY_ON_PROFILE_ID);
  const now = new Date().toISOString();
  const payload: TryOnProfile = { ...profile, id: "default", updatedAt: now };
  if (!isGuardCurrent(currentWorkspaceGuard(ctx.workspace))) throw new Error("账号工作区已切换");
  await writeProfile(
    db,
    {
      workspace: ctx.workspace,
      originDeviceId: ctx.deviceId,
      baseRevision: existing?.revision ?? 0,
      payload: { payload },
    },
    {
      id: TRY_ON_PROFILE_ID,
      profileType: "tryOn",
      payload,
    } as Omit<WorkspaceProfileRecord, "userId" | "originDeviceId" | "revision" | "createdAt" | "updatedAt">,
    existing ? "update" : "create",
  );
}
