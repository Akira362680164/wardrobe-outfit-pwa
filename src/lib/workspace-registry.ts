import type { AuthSessionSnapshot, AuthUserSnapshot } from "@/lib/auth-session-store";

export const WORKSPACE_REGISTRY_STORAGE_KEY = "wardrobe-account-workspace-registry-v1";
export const WORKSPACE_SCHEMA_VERSION = 1;

export interface AccountWorkspaceRecord {
  userId: string;
  userIdHash: string;
  dbName: string;
  schemaVersion: number;
  activeWorkspaceGeneration: number;
  createdAt: string;
  lastOpenedAt: string;
  deviceId: string;
  explicitlyLoggedOutAt?: string;
  offlineAccessUntil?: string;
}

export interface AccountWorkspaceRegistry {
  version: 1;
  activeUserId?: string;
  activeDbName?: string;
  activeWorkspaceGeneration?: number;
  updatedAt: string;
  workspaces: Record<string, AccountWorkspaceRecord>;
}

export interface WorkspaceResponseGuard {
  userId: string;
  dbName: string;
  workspaceGeneration: number;
}

type RegistryStorage = Pick<Storage, "getItem" | "setItem">;

export function isAccountWorkspaceEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ACCOUNT_WORKSPACE_ENABLED === "true";
}

export function isCloudSyncEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CLOUD_SYNC_ENABLED === "true";
}

export function stableUserIdHash(userId: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let index = 0; index < userId.length; index++) {
    const code = userId.charCodeAt(index);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code + index;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${toHex32(h1)}${toHex32(h2)}`;
}

export function workspaceDbNameForUser(userId: string): string {
  return `wardrobe_account_${stableUserIdHash(userId)}`;
}

export function loadWorkspaceRegistry(storage = getWorkspaceStorage()): AccountWorkspaceRegistry {
  const empty = createEmptyRegistry(new Date().toISOString());
  if (!storage) return empty;
  const raw = storage.getItem(WORKSPACE_REGISTRY_STORAGE_KEY);
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<AccountWorkspaceRegistry>;
    if (parsed.version !== 1 || !parsed.workspaces || typeof parsed.workspaces !== "object") return empty;
    return {
      version: 1,
      activeUserId: typeof parsed.activeUserId === "string" ? parsed.activeUserId : undefined,
      activeDbName: typeof parsed.activeDbName === "string" ? parsed.activeDbName : undefined,
      activeWorkspaceGeneration: typeof parsed.activeWorkspaceGeneration === "number" ? parsed.activeWorkspaceGeneration : undefined,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : empty.updatedAt,
      workspaces: parsed.workspaces as Record<string, AccountWorkspaceRecord>,
    };
  } catch {
    return empty;
  }
}

export function saveWorkspaceRegistry(
  registry: AccountWorkspaceRegistry,
  storage = getWorkspaceStorage(),
): AccountWorkspaceRegistry {
  if (storage) storage.setItem(WORKSPACE_REGISTRY_STORAGE_KEY, JSON.stringify(registry));
  return registry;
}

export function openWorkspaceForSession(
  session: AuthSessionSnapshot,
  storage = getWorkspaceStorage(),
  openedAt = new Date().toISOString(),
): AccountWorkspaceRecord {
  if (!session.user) throw new Error("账号会话缺少用户信息");
  return openWorkspaceForUser({
    user: session.user,
    deviceId: session.deviceId,
    offlineAccessUntil: session.offlineAccessUntil ?? session.refreshTokenExpiresAt,
    openedAt,
  }, storage);
}

export function openWorkspaceForUser(
  input: {
    user: AuthUserSnapshot;
    deviceId: string;
    offlineAccessUntil?: string;
    openedAt?: string;
  },
  storage = getWorkspaceStorage(),
): AccountWorkspaceRecord {
  const openedAt = input.openedAt ?? new Date().toISOString();
  const registry = loadWorkspaceRegistry(storage);
  const existing = registry.workspaces[input.user.id];
  const userIdHash = existing?.userIdHash ?? stableUserIdHash(input.user.id);
  const nextRecord: AccountWorkspaceRecord = {
    userId: input.user.id,
    userIdHash,
    dbName: existing?.dbName ?? workspaceDbNameForUser(input.user.id),
    schemaVersion: existing?.schemaVersion ?? WORKSPACE_SCHEMA_VERSION,
    activeWorkspaceGeneration: existing?.activeWorkspaceGeneration ?? 1,
    createdAt: existing?.createdAt ?? openedAt,
    lastOpenedAt: openedAt,
    deviceId: input.deviceId,
    offlineAccessUntil: input.offlineAccessUntil ?? existing?.offlineAccessUntil,
  };

  const nextRegistry: AccountWorkspaceRegistry = {
    version: 1,
    activeUserId: input.user.id,
    activeDbName: nextRecord.dbName,
    activeWorkspaceGeneration: nextRecord.activeWorkspaceGeneration,
    updatedAt: openedAt,
    workspaces: {
      ...registry.workspaces,
      [input.user.id]: nextRecord,
    },
  };
  saveWorkspaceRegistry(nextRegistry, storage);
  return nextRecord;
}

export function markWorkspaceLoggedOut(
  userId: string,
  storage = getWorkspaceStorage(),
  loggedOutAt = new Date().toISOString(),
): AccountWorkspaceRegistry {
  const registry = loadWorkspaceRegistry(storage);
  const current = registry.workspaces[userId];
  if (!current) return registry;

  const nextRecord: AccountWorkspaceRecord = {
    ...current,
    activeWorkspaceGeneration: current.activeWorkspaceGeneration + 1,
    explicitlyLoggedOutAt: loggedOutAt,
    offlineAccessUntil: undefined,
  };
  const activeMatches = registry.activeUserId === userId;
  const nextRegistry: AccountWorkspaceRegistry = {
    version: 1,
    activeUserId: activeMatches ? undefined : registry.activeUserId,
    activeDbName: activeMatches ? undefined : registry.activeDbName,
    activeWorkspaceGeneration: activeMatches ? undefined : registry.activeWorkspaceGeneration,
    updatedAt: loggedOutAt,
    workspaces: {
      ...registry.workspaces,
      [userId]: nextRecord,
    },
  };
  return saveWorkspaceRegistry(nextRegistry, storage);
}

export function isWorkspaceOfflineAuthorized(record: AccountWorkspaceRecord, at = new Date()): boolean {
  if (record.explicitlyLoggedOutAt || !record.offlineAccessUntil) return false;
  return Date.parse(record.offlineAccessUntil) > at.getTime();
}

export function isWorkspaceResponseCurrent(
  current: AccountWorkspaceRecord | null | undefined,
  response: WorkspaceResponseGuard,
): boolean {
  return Boolean(
    current
    && current.userId === response.userId
    && current.dbName === response.dbName
    && current.activeWorkspaceGeneration === response.workspaceGeneration,
  );
}

function createEmptyRegistry(now: string): AccountWorkspaceRegistry {
  return {
    version: 1,
    updatedAt: now,
    workspaces: {},
  };
}

function getWorkspaceStorage(): RegistryStorage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function toHex32(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}
