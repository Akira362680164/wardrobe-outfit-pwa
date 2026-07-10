import assert from "node:assert/strict";
import test from "node:test";

import { createImageEntity } from "../suites/helpers";
import type { AndroidE2EContext, AuthSession } from "../suites/types";

test("createImageEntity reuses the temporary asset clientMutationId", async () => {
  let assetClientMutationId: unknown;
  let createClientMutationId: unknown;

  const api = {
    async request(_session: AuthSession, path: string, options: { method?: string; body?: unknown } = {}) {
      if (path === "/api/workspace/assets/sessions" && options.method === "POST") {
        assetClientMutationId = (options.body as { clientMutationId: unknown }).clientMutationId;
        return {
          sessionId: "asset-session",
          assets: [
            { assetId: "original", fieldName: "imageDataUrl", variant: "original", uploadStatus: "pending" },
            { assetId: "thumbnail", fieldName: "imageDataUrl", variant: "thumbnail", uploadStatus: "pending" },
          ],
        };
      }
      if (path === "/api/workspace/assets/sessions/asset-session") {
        return {
          sessionId: "asset-session",
          ready: true,
          assets: [
            { assetId: "original", fieldName: "imageDataUrl", variant: "original", uploadStatus: "uploaded" },
            { assetId: "thumbnail", fieldName: "imageDataUrl", variant: "thumbnail", uploadStatus: "uploaded" },
          ],
        };
      }
      if (path === "/api/workspace/garments" && options.method === "POST") {
        createClientMutationId = (options.body as { clientMutationId: unknown }).clientMutationId;
        return { status: "committed", entity: { id: "garment", revision: 1, payload: {} } };
      }
      throw new Error(`unexpected request: ${options.method ?? "GET"} ${path}`);
    },
    async upload() {
      return {};
    },
  };

  await createImageEntity(
    { api } as unknown as AndroidE2EContext,
    { accessToken: "token", deviceId: "device" },
    "garments",
    "garment",
    { name: "fixture" },
  );

  assert.equal(typeof assetClientMutationId, "string");
  assert.equal(createClientMutationId, assetClientMutationId);
});
