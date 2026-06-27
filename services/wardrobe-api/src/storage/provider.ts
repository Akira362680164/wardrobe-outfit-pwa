import type { Readable } from "node:stream";

export interface StoredFileInfo {
  storageKey: string;
  sha256: string;
  sizeBytes: number;
}

export interface StorageProvider {
  readonly name: string;
  save(input: {
    storageKey: string;
    bytes: Buffer;
    expectedSha256: string;
    expectedSizeBytes: number;
    mimeType: string;
  }): Promise<StoredFileInfo>;
  openReadStream(storageKey: string): Promise<{ stream: Readable; sizeBytes: number }>;
  stat(storageKey: string): Promise<{ exists: boolean; sizeBytes?: number }>;
  delete(storageKey: string): Promise<void>;
  cleanupTemporaryFiles(olderThan: Date): Promise<number>;
  checkReady(): Promise<void>;
}

export class StorageProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class UnavailableStorageProvider implements StorageProvider {
  readonly name = "unavailable";
  private error(): never {
    throw new StorageProviderError("asset_storage_unavailable", "Storage root is not configured");
  }
  save(): Promise<StoredFileInfo> { return Promise.reject(this.error()); }
  openReadStream(): Promise<{ stream: Readable; sizeBytes: number }> { return Promise.reject(this.error()); }
  stat(): Promise<{ exists: boolean; sizeBytes?: number }> { return Promise.reject(this.error()); }
  delete(): Promise<void> { return Promise.reject(this.error()); }
  cleanupTemporaryFiles(): Promise<number> { return Promise.reject(this.error()); }
  checkReady(): Promise<void> { return Promise.reject(this.error()); }
}
