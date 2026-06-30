"use client";

const PURGE_MARKER_KEY = "wardrobe-online-only-purge-v1";
const LEGACY_REGISTRY_KEY = "wardrobe-account-workspace-registry-v1";
const LEGACY_DATABASE_PREFIXES = ["wardrobe_account_", "wardrobe-imgcache-"];
const LEGACY_CACHE_PREFIXES = ["wardrobe-workspace-", "wardrobe-assets-", "wardrobe-imgcache-"];

interface PurgeDependencies {
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  listDatabases?: () => Promise<Array<{ name?: string }>>;
  deleteDatabase?: (name: string) => Promise<void>;
  listCaches?: () => Promise<string[]>;
  deleteCache?: (name: string) => Promise<boolean>;
}

export interface LocalBusinessPurgeResult {
  alreadyPurged: boolean;
  deletedDatabases: string[];
  deletedCaches: string[];
  registryRemoved: boolean;
}

export async function purgeLegacyLocalBusinessData(
  dependencies: PurgeDependencies = browserPurgeDependencies(),
): Promise<LocalBusinessPurgeResult> {
  const storage = dependencies.storage;
  if (storage?.getItem(PURGE_MARKER_KEY) === "done") {
    return { alreadyPurged: true, deletedDatabases: [], deletedCaches: [], registryRemoved: false };
  }

  const registryDatabaseNames = readRegistryDatabaseNames(storage?.getItem(LEGACY_REGISTRY_KEY));
  const listedDatabases = dependencies.listDatabases ? await dependencies.listDatabases() : [];
  const databaseNames = collectLegacyDatabaseNames(listedDatabases, registryDatabaseNames);
  for (const name of databaseNames) await dependencies.deleteDatabase?.(name);

  const cacheNames = dependencies.listCaches ? await dependencies.listCaches() : [];
  const legacyCaches = cacheNames.filter(isLegacyBusinessCacheName);
  for (const name of legacyCaches) await dependencies.deleteCache?.(name);

  const registryRemoved = Boolean(storage?.getItem(LEGACY_REGISTRY_KEY));
  storage?.removeItem(LEGACY_REGISTRY_KEY);
  storage?.setItem(PURGE_MARKER_KEY, "done");
  return {
    alreadyPurged: false,
    deletedDatabases: databaseNames,
    deletedCaches: legacyCaches,
    registryRemoved,
  };
}

export function collectLegacyDatabaseNames(
  databases: Array<{ name?: string }>,
  registryDatabaseNames: string[] = [],
): string[] {
  return [...new Set([
    ...databases.map((database) => database.name).filter((name): name is string => Boolean(name)),
    ...registryDatabaseNames,
  ].filter((name) => LEGACY_DATABASE_PREFIXES.some((prefix) => name.startsWith(prefix))))].sort();
}

export function isLegacyBusinessCacheName(name: string): boolean {
  return LEGACY_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function readRegistryDatabaseNames(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { activeDbName?: unknown; workspaces?: Record<string, { dbName?: unknown }> };
    return [
      typeof parsed.activeDbName === "string" ? parsed.activeDbName : undefined,
      ...Object.values(parsed.workspaces ?? {}).map((workspace) => typeof workspace.dbName === "string" ? workspace.dbName : undefined),
    ].filter((name): name is string => Boolean(name));
  } catch {
    return [];
  }
}

function browserPurgeDependencies(): PurgeDependencies {
  if (typeof window === "undefined") return {};
  return {
    storage: window.localStorage,
    listDatabases: typeof indexedDB.databases === "function" ? () => indexedDB.databases() : undefined,
    deleteDatabase: (name) => new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error(`delete_database_failed:${name}`));
      request.onblocked = () => reject(new Error(`delete_database_blocked:${name}`));
    }),
    listCaches: typeof caches === "undefined" ? undefined : () => caches.keys(),
    deleteCache: typeof caches === "undefined" ? undefined : (name) => caches.delete(name),
  };
}
