"use client";

import { loadAuthSessionSnapshot } from "@/lib/auth-session-store";
import {
  isAccountWorkspaceEnabled,
  isCloudSyncEnabled,
  loadWorkspaceRegistry,
  type AccountWorkspaceRecord,
} from "@/lib/workspace-registry";

export interface CloudBridgeContext {
  workspace: AccountWorkspaceRecord;
  deviceId: string;
}

export async function loadCloudBridgeContext(): Promise<CloudBridgeContext | null> {
  if (!isAccountWorkspaceEnabled() || !isCloudSyncEnabled()) return null;
  const registry = loadWorkspaceRegistry();
  const activeUserId = registry.activeUserId;
  const activeDbName = registry.activeDbName;
  const activeGen = registry.activeWorkspaceGeneration;
  if (!activeUserId || !activeDbName || activeGen == null) return null;
  const workspace = registry.workspaces[activeUserId];
  if (!workspace) return null;
  if (workspace.dbName !== activeDbName || workspace.activeWorkspaceGeneration !== activeGen) return null;
  const session = await loadAuthSessionSnapshot();
  if (!session.accessToken || !session.user) return null;
  if (session.user.id !== workspace.userId) return null;
  return { workspace, deviceId: session.deviceId };
}
