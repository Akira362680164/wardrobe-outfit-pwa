import { loadStorageConfig } from "./config.js";
import { LocalFileStorageProvider } from "./local-file-storage.js";
import type { StorageProvider } from "./provider.js";

export function createStorageProviderFromEnv(): StorageProvider | null {
  const config = loadStorageConfig();
  return config.root ? new LocalFileStorageProvider(config.root, config.maxAssetBytes) : null;
}
