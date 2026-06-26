import { readFileSync } from "node:fs";
import path from "node:path";

import {
  AssetUploadAuthorizeRequestSchema,
  AssetUploadAuthorizeResponseSchema,
  AssetUploadCompleteRequestSchema,
  AssetUploadCompleteResponseSchema,
} from "@wardrobe/cloud-contracts";
import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { SessionService } from "../src/auth/session.js";
import type { AssetService } from "../src/assets/service.js";
import {
  buildAssetObjectKey,
  createCosPutObjectPresignedUrl,
  loadCosUploadConfig,
} from "../src/assets/service.js";
import { AuthApiError } from "../src/auth/registrations.js";

const root = path.resolve(__dirname, "../../..");
const migration = readFileSync(path.join(root, "services/wardrobe-api/migrations/0002_asset_upload_metadata.sql"), "utf8");
const journal = readFileSync(path.join(root, "services/wardrobe-api/migrations/meta/_journal.json"), "utf8");
const drizzleSchema = readFileSync(path.join(root, "services/wardrobe-api/src/db/schema.ts"), "utf8");

const assetId = "018f6f02-7b7a-7a20-8d1d-000000000201";
const ownerEntityId = "018f6f02-7b7a-7a20-8d1d-000000000202";
const sha256 = "a".repeat(64);

describe("asset upload contracts", () => {
  it("validates C1 authorize and complete payloads", () => {
    const authorize = AssetUploadAuthorizeRequestSchema.parse({
      assetId,
      ownerEntityType: "garment",
      ownerEntityId,
      variant: "original",
      sha256,
      mimeType: "image/jpeg",
      sizeBytes: 1024,
      width: 100,
      height: 200,
    });
    expect(authorize.variant).toBe("original");
    expect(() => AssetUploadAuthorizeRequestSchema.parse({ ...authorize, ownerEntityType: "asset" })).toThrow();

    expect(AssetUploadAuthorizeResponseSchema.parse({
      assetId,
      variant: "original",
      method: "PUT",
      uploadUrl: "https://bucket.cos.ap-guangzhou.myqcloud.com/key?sign=x",
      objectKey: "users/u/assets/a/original.jpg",
      expiresAt: "2026-06-26T12:10:00.000Z",
    }).headers).toEqual({});

    expect(AssetUploadCompleteRequestSchema.parse({
      assetId,
      variant: "thumbnail",
      objectKey: "users/u/assets/a/thumbnail.webp",
      sha256,
      mimeType: "image/webp",
      sizeBytes: 256,
    }).variant).toBe("thumbnail");
    expect(AssetUploadCompleteResponseSchema.parse({
      status: "ok",
      assetId,
      variant: "thumbnail",
      uploadStatus: "uploaded",
    }).status).toBe("ok");
  });

  it("adds asset upload metadata migration and drizzle fields", () => {
    for (const column of ["original_object_key", "thumbnail_object_key", "upload_status", "size_bytes", "width", "height"]) {
      expect(migration).toContain(column);
    }
    expect(journal).toContain("0002_asset_upload_metadata");
    for (const field of ["originalObjectKey", "thumbnailObjectKey", "uploadStatus", "sizeBytes", "width", "height"]) {
      expect(drizzleSchema).toContain(field);
    }
  });
});

describe("asset COS signing", () => {
  it("builds per-user object keys and signed PUT urls without leaking the secret", () => {
    const config = {
      bucket: "wardrobe-1250000000",
      region: "ap-guangzhou",
      secretId: "AKIDEXAMPLE",
      secretKey: "SECRET_SHOULD_NOT_LEAK",
      expiresSeconds: 600,
      protocol: "https" as const,
    };
    const objectKey = buildAssetObjectKey("user-1", assetId, "thumbnail", sha256, "image/webp");
    const uploadUrl = createCosPutObjectPresignedUrl({
      config,
      objectKey,
      now: new Date("2026-06-26T12:00:00.000Z"),
    });
    const url = new URL(uploadUrl);
    const sign = url.searchParams.get("sign") ?? "";

    expect(objectKey).toBe(`users/user-1/assets/${assetId}/thumbnail-${sha256.slice(0, 16)}.webp`);
    expect(url.host).toBe("wardrobe-1250000000.cos.ap-guangzhou.myqcloud.com");
    expect(sign).toContain("q-sign-algorithm=sha1");
    expect(sign).toContain("q-ak=AKIDEXAMPLE");
    expect(sign).toContain("q-header-list=host");
    expect(uploadUrl).not.toContain(config.secretKey);
  });

  it("requires complete COS env before enabling uploads", () => {
    expect(loadCosUploadConfig({})).toBeNull();
    expect(loadCosUploadConfig({
      COS_BUCKET: "bucket",
      COS_REGION: "ap-guangzhou",
      COS_SECRET_ID: "sid",
      COS_SECRET_KEY: "skey",
      COS_UPLOAD_EXPIRES_SECONDS: "999999",
    })?.expiresSeconds).toBe(3600);
  });
});

describe("asset upload routes", () => {
  it("authenticates and forwards upload-url to the asset service", async () => {
    const calls: unknown[] = [];
    const app = buildApp({
      readinessCheck: async () => ({ database: "ready" }),
      sessionService: fakeSessionService(),
      assetService: {
        authorizeUpload: async (input: unknown) => {
          calls.push(input);
          return {
            assetId,
            variant: "original",
            method: "PUT",
            uploadUrl: "https://wardrobe-125.cos.ap-guangzhou.myqcloud.com/k?sign=s",
            objectKey: "users/user-1/assets/key",
            expiresAt: "2026-06-26T12:10:00.000Z",
            headers: { "Content-Type": "image/jpeg" },
          };
        },
      } as unknown as AssetService,
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/assets/upload-url",
        headers: { authorization: "Bearer ok" },
        payload: {
          assetId,
          ownerEntityType: "garment",
          ownerEntityId,
          variant: "original",
          sha256,
          mimeType: "image/jpeg",
          sizeBytes: 1024,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ assetId, method: "PUT" });
      expect(calls[0]).toMatchObject({ userId: "user-1", deviceId: "device-1", assetId });
    } finally {
      await app.close();
    }
  });

  it("rejects unauthenticated asset upload requests", async () => {
    const app = buildApp({
      readinessCheck: async () => ({ database: "ready" }),
      sessionService: fakeSessionService(),
      assetService: {} as AssetService,
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/assets/upload-url",
        payload: {},
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "AUTH_TOKEN_INVALID" });
    } finally {
      await app.close();
    }
  });
});

function fakeSessionService(): SessionService {
  return {
    authenticate: async (authorizationHeader: string | undefined) => {
      if (authorizationHeader !== "Bearer ok") {
        throw new AuthApiError(401, "AUTH_TOKEN_INVALID", "Invalid access token");
      }
      return { userId: "user-1", sessionId: "session-1", deviceId: "device-1" };
    },
  } as unknown as SessionService;
}
