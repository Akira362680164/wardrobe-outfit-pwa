export const DEFAULT_ASSET_MAX_BYTES = 15 * 1024 * 1024;

export interface StorageConfig {
  root: string | null;
  maxAssetBytes: number;
}

export function loadStorageConfig(env: Record<string, string | undefined> = process.env): StorageConfig {
  const root = env.WARDROBE_STORAGE_ROOT?.trim() || null;
  const declaredLimit = Number(env.ASSET_MAX_BYTES);
  return {
    root,
    maxAssetBytes: Number.isSafeInteger(declaredLimit) && declaredLimit > 0
      ? declaredLimit
      : DEFAULT_ASSET_MAX_BYTES,
  };
}
