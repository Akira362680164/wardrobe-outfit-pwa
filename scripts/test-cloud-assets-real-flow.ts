#!/usr/bin/env tsx
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

const apiBase = (process.env.WARDROBE_API_BASE_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");
const phone = process.env.WARDROBE_TEST_PHONE;
const password = process.env.WARDROBE_TEST_PASSWORD;
const imagePath = process.env.WARDROBE_TEST_IMAGE;
if (!phone || !password || !imagePath) {
  throw new Error("WARDROBE_TEST_PHONE, WARDROBE_TEST_PASSWORD and WARDROBE_TEST_IMAGE are required");
}
const credentials = { phone, password, imagePath };

async function main() {
const bytes = await readFile(credentials.imagePath);
const mimeType = detectMime(bytes);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const primaryDeviceId = `real-flow-${randomUUID()}`;
const secondDeviceId = `real-flow-restore-${randomUUID()}`;

const primary = await login(primaryDeviceId);
const owners = [
  { type: "garment", id: randomUUID(), label: "real-flow-garment" },
  { type: "wishlistItem", id: randomUUID(), label: "real-flow-wishlist" },
  { type: "outfit", id: randomUUID(), label: "real-flow-outfit" },
] as const;

const createResult = await jsonRequest("/api/sync/push", {
  method: "POST", token: primary.accessToken,
  body: {
    deviceId: primaryDeviceId,
    mutations: owners.map((owner) => ({
      mutationId: randomUUID(), entityType: owner.type, entityId: owner.id,
      operation: "create", payload: { name: owner.label, realFlow: true },
      createdAt: new Date().toISOString(), attemptCount: 0,
    })),
  },
});
assertAccepted(createResult, owners.length, "owner creation");

const assets = [] as Array<{ assetId: string; owner: typeof owners[number] }>;
for (const owner of owners) {
  const assetId = randomUUID();
  assets.push({ assetId, owner });
  for (const variant of ["original", "thumbnail"] as const) {
    const response = await fetch(`${apiBase}/api/assets/${assetId}/${variant}/content`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${primary.accessToken}`,
        "x-wardrobe-device-id": primaryDeviceId,
        "content-type": mimeType,
        "x-asset-owner-entity-type": owner.type,
        "x-asset-owner-entity-id": owner.id,
        "x-asset-sha256": sha256,
        "x-asset-size-bytes": String(bytes.length),
      },
      body: bytes,
    });
    if (!response.ok) throw new Error(`upload ${owner.type}/${variant} failed: ${response.status} ${await response.text()}`);
    const result = await response.json() as { uploadStatus?: string; sha256?: string };
    if (result.uploadStatus !== "uploaded" || result.sha256 !== sha256) throw new Error(`invalid upload response for ${assetId}/${variant}`);
  }
}

const manifest = await jsonRequest("/api/assets/manifest", {
  method: "POST", token: primary.accessToken, deviceId: primaryDeviceId, body: { limit: 200 },
}) as { items?: Array<{ assetId: string; original?: unknown; thumbnail?: unknown }> };
for (const asset of assets) {
  const item = manifest.items?.find((candidate) => candidate.assetId === asset.assetId);
  if (!item?.original || !item.thumbnail) throw new Error(`manifest omitted uploaded variants for ${asset.assetId}`);
}

await verifyDownload(primary.accessToken, primaryDeviceId, assets[0].assetId, "original");
await verifyDownload(primary.accessToken, primaryDeviceId, assets[0].assetId, "thumbnail");
const secondary = await login(secondDeviceId);
await verifyDownload(secondary.accessToken, secondDeviceId, assets[1].assetId, "original");

const deleteResult = await jsonRequest("/api/sync/push", {
  method: "POST", token: primary.accessToken,
  body: {
    deviceId: primaryDeviceId,
    mutations: [{
      mutationId: randomUUID(), entityType: "garment", entityId: owners[0].id,
      operation: "delete", baseRevision: 1, payload: {}, createdAt: new Date().toISOString(), attemptCount: 0,
    }],
  },
});
assertAccepted(deleteResult, 1, "garment deletion");
const deletedResponse = await fetch(`${apiBase}/api/assets/${assets[0].assetId}/original/content`, {
  headers: { authorization: `Bearer ${primary.accessToken}`, "x-wardrobe-device-id": primaryDeviceId },
});
if (deletedResponse.status !== 404) throw new Error(`deleted garment asset remained downloadable: ${deletedResponse.status}`);

console.log(JSON.stringify({
  status: "ok",
  apiBase,
  mimeType,
  sizeBytes: bytes.length,
  sha256,
  primaryDeviceId,
  secondDeviceId,
  deletedAssetId: assets[0].assetId,
  retainedAssetIds: assets.slice(1).map((asset) => asset.assetId),
  ownerIds: owners.map((owner) => ({ type: owner.type, id: owner.id })),
}, null, 2));

async function login(deviceId: string): Promise<{ accessToken: string }> {
  const body = { phone: credentials.phone, password: credentials.password, deviceId, deviceLabel: "API proxy real flow" };
  try {
    return await jsonRequest("/api/auth/login", { method: "POST", body }) as { accessToken: string };
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("401")) throw error;
    return await jsonRequest("/api/auth/register", { method: "POST", body }) as { accessToken: string };
  }
}

async function verifyDownload(token: string, deviceId: string, assetId: string, variant: string) {
  const response = await fetch(`${apiBase}/api/assets/${assetId}/${variant}/content`, {
    headers: { authorization: `Bearer ${token}`, "x-wardrobe-device-id": deviceId },
  });
  if (!response.ok) throw new Error(`download failed: ${response.status} ${await response.text()}`);
  const downloaded = Buffer.from(await response.arrayBuffer());
  const downloadedSha = createHash("sha256").update(downloaded).digest("hex");
  if (!downloaded.equals(bytes) || downloadedSha !== sha256) throw new Error("downloaded bytes failed integrity validation");
  if (response.headers.get("content-type") !== mimeType || response.headers.get("x-asset-sha256") !== sha256) {
    throw new Error("download integrity headers are incorrect");
  }
}

async function jsonRequest(path: string, input: { method: string; token?: string; deviceId?: string; body?: unknown }): Promise<unknown> {
  const response = await fetch(`${apiBase}${path}`, {
    method: input.method,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(input.token ? { authorization: `Bearer ${input.token}` } : {}),
      ...(input.deviceId ? { "x-wardrobe-device-id": input.deviceId } : {}),
    },
    body: input.body == null ? undefined : JSON.stringify(input.body),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${text}`);
  return body;
}

function assertAccepted(value: unknown, count: number, label: string) {
  const results = (value as { results?: Array<{ status?: string; errorCode?: string }> }).results;
  if (!results || results.length !== count || results.some((result) => result.status !== "accepted")) {
    throw new Error(`${label} was not accepted: ${JSON.stringify(results)}`);
  }
}

function detectMime(value: Buffer): string {
  if (value.length >= 3 && value[0] === 0xff && value[1] === 0xd8 && value[2] === 0xff) return "image/jpeg";
  if (value.length >= 8 && value.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (value.length >= 12 && value.toString("ascii", 0, 4) === "RIFF" && value.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  throw new Error("WARDROBE_TEST_IMAGE must be JPEG, PNG or WebP");
}
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
