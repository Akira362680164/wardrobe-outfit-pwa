import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readFile, readdir, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { StorageProviderError, type StorageProvider, type StoredFileInfo } from "./provider.js";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/json",
]);

export class LocalFileStorageProvider implements StorageProvider {
  readonly name = "local-file";
  private readonly root: string;

  constructor(root: string, private readonly maxBytes: number) {
    if (!root.trim()) throw new StorageProviderError("asset_storage_unavailable", "Storage root is not configured");
    this.root = path.resolve(root);
  }

  async save(input: {
    storageKey: string;
    bytes: Buffer;
    expectedSha256: string;
    expectedSizeBytes: number;
    mimeType: string;
  }): Promise<StoredFileInfo> {
    if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
      throw new StorageProviderError("asset_invalid_mime_type", "Unsupported file content type");
    }
    if (input.bytes.length > this.maxBytes) {
      throw new StorageProviderError("asset_too_large", "File exceeds the configured size limit");
    }
    if (input.bytes.length !== input.expectedSizeBytes) {
      throw new StorageProviderError("asset_size_mismatch", "Actual file size does not match the declaration");
    }
    const actualSha256 = createHash("sha256").update(input.bytes).digest("hex");
    if (actualSha256 !== input.expectedSha256) {
      throw new StorageProviderError("asset_hash_mismatch", "Actual file digest does not match the declaration");
    }
    if (!matchesMimeMagic(input.bytes, input.mimeType)) {
      throw new StorageProviderError("asset_magic_mismatch", "File content does not match its declared type");
    }

    const target = await this.prepareTarget(input.storageKey);
    const temporary = `${target}.${randomUUID()}.part`;
    try {
      await writeFile(temporary, input.bytes, { flag: "wx", mode: 0o600 });
      await rename(temporary, target);
      return { storageKey: input.storageKey, sha256: actualSha256, sizeBytes: input.bytes.length };
    } catch (error) {
      await unlink(temporary).catch(() => {});
      if (error instanceof StorageProviderError) throw error;
      throw new StorageProviderError("asset_upload_failed", "File could not be stored");
    }
  }

  async openReadStream(storageKey: string) {
    const target = await this.safeExistingPath(storageKey);
    const info = await stat(target);
    if (!info.isFile()) throw new StorageProviderError("asset_file_missing", "Stored file is unavailable");
    return { stream: createReadStream(target), sizeBytes: info.size };
  }

  async stat(storageKey: string): Promise<{ exists: boolean; sizeBytes?: number }> {
    try {
      const target = await this.safeExistingPath(storageKey);
      const info = await stat(target);
      return info.isFile() ? { exists: true, sizeBytes: info.size } : { exists: false };
    } catch (error) {
      if (isMissing(error)) return { exists: false };
      if (error instanceof StorageProviderError && error.code === "asset_file_missing") return { exists: false };
      throw error;
    }
  }

  async delete(storageKey: string): Promise<void> {
    try {
      const target = await this.safeExistingPath(storageKey);
      await unlink(target);
    } catch (error) {
      if (isMissing(error) || (error instanceof StorageProviderError && error.code === "asset_file_missing")) return;
      throw new StorageProviderError("asset_delete_failed", "Stored file could not be deleted");
    }
  }

  async cleanupTemporaryFiles(olderThan: Date): Promise<number> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    let deleted = 0;
    const visit = async (directory: string): Promise<void> => {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        const candidate = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          await visit(candidate);
        } else if (entry.isFile() && entry.name.endsWith(".part")) {
          const info = await stat(candidate);
          if (info.mtime < olderThan) {
            await unlink(candidate);
            deleted += 1;
          }
        }
      }
    };
    await visit(this.root);
    return deleted;
  }

  async checkReady(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const rootInfo = await lstat(this.root);
    if (rootInfo.isSymbolicLink()) {
      throw new StorageProviderError("asset_storage_unavailable", "Storage root must not be a symbolic link");
    }
    const probe = path.join(this.root, `.readiness-${randomUUID()}.part`);
    const expected = Buffer.from("wardrobe-storage-ready", "utf8");
    try {
      await writeFile(probe, expected, { flag: "wx", mode: 0o600 });
      const actual = await readFile(probe);
      if (!actual.equals(expected)) throw new Error("probe mismatch");
    } catch {
      throw new StorageProviderError("asset_storage_unavailable", "Storage root is not readable and writable");
    } finally {
      await unlink(probe).catch(() => {});
    }
  }

  private resolveKey(storageKey: string): string {
    if (!storageKey || path.isAbsolute(storageKey) || storageKey.includes("\\")) {
      throw new StorageProviderError("asset_upload_failed", "Invalid storage key");
    }
    const segments = storageKey.split("/");
    if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
      throw new StorageProviderError("asset_upload_failed", "Invalid storage key");
    }
    const target = path.resolve(this.root, ...segments);
    if (!target.startsWith(`${this.root}${path.sep}`)) {
      throw new StorageProviderError("asset_upload_failed", "Invalid storage key");
    }
    return target;
  }

  private async prepareTarget(storageKey: string): Promise<string> {
    const target = this.resolveKey(storageKey);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    const [resolvedRoot, resolvedParent] = await Promise.all([realpath(this.root), realpath(path.dirname(target))]);
    if (!resolvedParent.startsWith(`${resolvedRoot}${path.sep}`)) {
      throw new StorageProviderError("asset_upload_failed", "Storage path escaped its root");
    }
    return target;
  }

  private async safeExistingPath(storageKey: string): Promise<string> {
    const target = this.resolveKey(storageKey);
    let info;
    try {
      info = await lstat(target);
    } catch (error) {
      if (isMissing(error)) throw new StorageProviderError("asset_file_missing", "Stored file is unavailable");
      throw error;
    }
    if (info.isSymbolicLink()) throw new StorageProviderError("asset_file_missing", "Stored file is unavailable");
    const [resolvedRoot, resolvedTarget] = await Promise.all([realpath(this.root), realpath(target)]);
    if (!resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
      throw new StorageProviderError("asset_file_missing", "Stored file is unavailable");
    }
    return target;
  }
}

export function matchesMimeMagic(bytes: Buffer, mimeType: string): boolean {
  if (mimeType === "application/json") {
    try { JSON.parse(bytes.toString("utf8")); return true; } catch { return false; }
  }
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/webp") return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (mimeType === "image/heic" || mimeType === "image/heif") {
    if (bytes.length < 12 || bytes.toString("ascii", 4, 8) !== "ftyp") return false;
    const brand = bytes.toString("ascii", 8, 12);
    const compatible = bytes.toString("ascii", 8, Math.min(bytes.length, 64));
    const brands = mimeType === "image/heic" ? ["heic", "heix", "hevc", "hevx"] : ["mif1", "msf1", "heif"];
    return brands.includes(brand) || brands.some((candidate) => compatible.includes(candidate));
  }
  return false;
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error != null && "code" in error && (error as { code?: string }).code === "ENOENT";
}
