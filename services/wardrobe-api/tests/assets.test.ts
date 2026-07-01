import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import {
  AssetUploadHeadersSchema,
  AssetUploadParamsSchema,
  AssetUploadResponseSchema,
} from "@wardrobe/cloud-contracts";
import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { SessionService } from "../src/auth/session.js";
import type { AssetService } from "../src/assets/service.js";
import { buildAssetStorageKey, formatManifestCursor, parseManifestCursor } from "../src/assets/service.js";
import { AuthApiError } from "../src/auth/registrations.js";
import { LocalFileStorageProvider, matchesMimeMagic } from "../src/storage/local-file-storage.js";
import { StorageProviderError, type StorageProvider } from "../src/storage/provider.js";

const assetId = "018f6f02-7b7a-7a20-8d1d-000000000201";
const ownerEntityId = "018f6f02-7b7a-7a20-8d1d-000000000202";
const pngBytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("wardrobe")]);
const pngSha256 = createHash("sha256").update(pngBytes).digest("hex");

describe("API-proxy asset contracts", () => {
  it("parses string headers, enforces variants and caps assets at 15 MiB", () => {
    expect(AssetUploadParamsSchema.parse({ assetId, variant: "original" }).variant).toBe("original");
    expect(() => AssetUploadParamsSchema.parse({ assetId, variant: "preview" })).toThrow();
    const headers = AssetUploadHeadersSchema.parse({
      "content-type": "image/png",
      "x-asset-owner-entity-type": "garment",
      "x-asset-owner-entity-id": ownerEntityId,
      "x-asset-sha256": pngSha256,
      "x-asset-size-bytes": String(pngBytes.length),
      "x-asset-width": "120",
    });
    expect(headers["x-asset-size-bytes"]).toBe(pngBytes.length);
    expect(headers["x-asset-width"]).toBe(120);
    expect(() => AssetUploadHeadersSchema.parse({ ...headers, "x-asset-owner-entity-type": "asset" })).toThrow();
    expect(() => AssetUploadHeadersSchema.parse({ ...headers, "x-asset-size-bytes": String(15 * 1024 * 1024 + 1) })).toThrow();
  });

  it("returns the completed upload metadata without any external URL", () => {
    const result = AssetUploadResponseSchema.parse({
      status: "ok", assetId, variant: "original", uploadStatus: "uploaded",
      sha256: pngSha256, mimeType: "image/png", sizeBytes: pngBytes.length,
      width: 120, height: 160, updatedAt: new Date().toISOString(),
    });
    expect(result.sha256).toBe(pngSha256);
    expect(Object.keys(result)).not.toContain("uploadUrl");
  });
});

describe("local file storage provider", () => {
  it("atomically saves, streams, stats and idempotently deletes an image", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "wardrobe-storage-test-"));
    const provider = new LocalFileStorageProvider(root, 15 * 1024 * 1024);
    await provider.checkReady();
    const storageKey = buildAssetStorageKey("user-1", assetId, "original", pngSha256, "image/png");
    const saved = await provider.save({ storageKey, bytes: pngBytes, expectedSha256: pngSha256, expectedSizeBytes: pngBytes.length, mimeType: "image/png" });
    expect(saved).toMatchObject({ storageKey, sha256: pngSha256, sizeBytes: pngBytes.length });
    expect(await provider.stat(storageKey)).toEqual({ exists: true, sizeBytes: pngBytes.length });
    const opened = await provider.openReadStream(storageKey);
    expect(Buffer.concat(await opened.stream.toArray())).toEqual(pngBytes);
    await provider.delete(storageKey);
    await provider.delete(storageKey);
    expect(await provider.stat(storageKey)).toEqual({ exists: false });
  });

  it("rejects traversal, hash, size, limit, type and magic mismatches without a final file", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "wardrobe-storage-invalid-"));
    const provider = new LocalFileStorageProvider(root, pngBytes.length);
    const base = { bytes: pngBytes, expectedSha256: pngSha256, expectedSizeBytes: pngBytes.length, mimeType: "image/png" };
    await expect(provider.save({ ...base, storageKey: "../escape.png" })).rejects.toMatchObject({ code: "asset_upload_failed" });
    await expect(provider.save({ ...base, storageKey: "/absolute.png" })).rejects.toMatchObject({ code: "asset_upload_failed" });
    await expect(provider.save({ ...base, storageKey: "users\\escape.png" })).rejects.toMatchObject({ code: "asset_upload_failed" });
    await expect(provider.save({ ...base, storageKey: "users/a.png", expectedSha256: "0".repeat(64) })).rejects.toMatchObject({ code: "asset_hash_mismatch" });
    await expect(provider.save({ ...base, storageKey: "users/a.png", expectedSizeBytes: 1 })).rejects.toMatchObject({ code: "asset_size_mismatch" });
    await expect(provider.save({ ...base, storageKey: "users/a.jpg", mimeType: "image/jpeg" })).rejects.toMatchObject({ code: "asset_magic_mismatch" });
    await expect(new LocalFileStorageProvider(root, pngBytes.length - 1).save({ ...base, storageKey: "users/a.png" })).rejects.toMatchObject({ code: "asset_too_large" });
    await expect(provider.save({ ...base, storageKey: "users/a.gif", mimeType: "image/gif" })).rejects.toMatchObject({ code: "asset_invalid_mime_type" });
  });

  it("recognizes every allowed image family by magic bytes", () => {
    expect(matchesMimeMagic(Buffer.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg")).toBe(true);
    expect(matchesMimeMagic(pngBytes, "image/png")).toBe(true);
    expect(matchesMimeMagic(Buffer.from("RIFF0000WEBP", "ascii"), "image/webp")).toBe(true);
    expect(matchesMimeMagic(Buffer.from("0000ftypheic", "ascii"), "image/heic")).toBe(true);
    expect(matchesMimeMagic(Buffer.from("0000ftypmif1", "ascii"), "image/heif")).toBe(true);
    expect(matchesMimeMagic(Buffer.from("not-an-image"), "image/png")).toBe(false);
  });

  it("removes stale part files but retains recent ones", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "wardrobe-storage-parts-"));
    const provider = new LocalFileStorageProvider(root, 1024);
    await provider.checkReady();
    await writeFile(path.join(root, "old.part"), "old");
    const count = await provider.cleanupTemporaryFiles(new Date(Date.now() + 1000));
    expect(count).toBe(1);
    await expect(readFile(path.join(root, "old.part"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("asset routes", () => {
  it("rejects the removed direct-to-entity upload endpoint", async () => {
    const calls: any[] = [];
    const app = buildApp({
      readinessCheck: async () => ({ database: "ready" }),
      sessionService: fakeSessionService(),
      storageProvider: memoryStorage(),
      assetService: {
        upload: async (input: any) => {
          calls.push(input);
          return { status: "ok", assetId, variant: "original", uploadStatus: "uploaded", sha256: pngSha256, mimeType: "image/png", sizeBytes: pngBytes.length, updatedAt: new Date().toISOString() };
        },
      } as unknown as AssetService,
    });
    const response = await app.inject({
      method: "PUT", url: `/api/assets/${assetId}/original/content`,
      headers: {
        authorization: "Bearer ok", "x-wardrobe-device-id": "device-1", "content-type": "image/png",
        "x-asset-owner-entity-type": "garment", "x-asset-owner-entity-id": ownerEntityId,
        "x-asset-sha256": pngSha256, "x-asset-size-bytes": String(pngBytes.length),
      },
      payload: pngBytes,
    });
    expect(response.statusCode).toBe(404);
    expect(calls).toEqual([]);
    await app.close();
  });

  it("streams an owned download with integrity headers", async () => {
    const app = buildApp({
      sessionService: fakeSessionService(), storageProvider: memoryStorage(),
      assetService: {
        download: async () => ({ stream: Readable.from(pngBytes), sizeBytes: pngBytes.length, sha256: pngSha256, mimeType: "image/png" }),
      } as unknown as AssetService,
    });
    const response = await app.inject({ method: "GET", url: `/api/assets/${assetId}/original/content`, headers: { authorization: "Bearer ok", "x-wardrobe-device-id": "device-1" } });
    expect(response.statusCode).toBe(200);
    expect(response.headers["x-asset-sha256"]).toBe(pngSha256);
    expect(response.headers["x-asset-variant"]).toBe("original");
    expect(response.rawPayload).toEqual(pngBytes);
    await app.close();
  });

  it("requires the token device", async () => {
    const app = buildApp({ sessionService: fakeSessionService(), storageProvider: memoryStorage(), assetService: {} as AssetService });
    const mismatch = await app.inject({ method: "GET", url: `/api/assets/${assetId}/original/content`, headers: { authorization: "Bearer ok", "x-wardrobe-device-id": "other" } });
    expect(mismatch.statusCode).toBe(403);
    await app.close();
  });
});

describe("manifest cursor", () => {
  it("roundtrips and rejects malformed values", () => {
    const now = new Date("2026-06-27T12:00:00.000Z");
    const encoded = formatManifestCursor({ updatedAt: now, id: assetId });
    expect(parseManifestCursor(encoded)).toEqual({ updatedAt: now.toISOString(), id: assetId });
    expect(parseManifestCursor("not-valid~")).toBeNull();
  });
});

function fakeSessionService(): SessionService {
  return {
    authenticate: async (authorizationHeader: string | undefined) => {
      if (authorizationHeader !== "Bearer ok") throw new AuthApiError(401, "AUTH_TOKEN_INVALID", "Invalid access token");
      return { userId: "user-1", sessionId: "session-1", deviceId: "device-1" };
    },
  } as SessionService;
}

function memoryStorage(): StorageProvider {
  return {
    name: "memory",
    save: async (input) => ({ storageKey: input.storageKey, sha256: input.expectedSha256, sizeBytes: input.bytes.length }),
    openReadStream: async () => ({ stream: Readable.from([]), sizeBytes: 0 }),
    stat: async () => ({ exists: true, sizeBytes: 0 }),
    delete: async () => {},
    cleanupTemporaryFiles: async () => 0,
    checkReady: async () => {},
  };
}
