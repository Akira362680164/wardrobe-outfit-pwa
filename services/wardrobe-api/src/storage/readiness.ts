import type { StorageProvider } from "./provider.js";

export async function isStorageReady(provider: StorageProvider | null): Promise<boolean> {
  if (!provider) return false;
  try {
    await provider.checkReady();
    return true;
  } catch {
    return false;
  }
}
