import assert from "node:assert/strict";

import type { WorkspaceCommandResponse, WorkspaceDetailResponse, WorkspaceEntity } from "@wardrobe/cloud-contracts";
import { createOnlineWriteRepository, type OnlineWriteRequester } from "../src/lib/online/online-write-repository";

const now = "2026-06-30T00:00:00.000Z";
const entity = (id: string): WorkspaceEntity => ({
  id,
  revision: 1,
  createdAt: now,
  updatedAt: now,
  payload: { legacyItemId: 1 },
});

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const originalAssetId = "44444444-4444-4444-8444-444444444444";
const thumbnailAssetId = "55555555-5555-4555-8555-555555555555";
const calls: Array<{ path: string; method?: string; body?: unknown }> = [];

const request: OnlineWriteRequester = async <T>(path: string, options = {}) => {
  calls.push({ path, method: options.method, body: options.body });
  if (path.endsWith("/garments") && options.method === "POST") {
    return { status: "committed", entity: entity(firstId) } as T;
  }
  if (path.endsWith(`/garments/${firstId}`)) {
    return { data: { ...entity(firstId), revision: 2 } } as WorkspaceDetailResponse as T;
  }
  if (path.endsWith("/garments/batch")) {
    return { status: "committed", entities: [entity(firstId), entity(secondId)] } as WorkspaceCommandResponse as T;
  }
  if (path.endsWith(`/garments/${secondId}`)) throw new Error("read-back failed");
  if (path.endsWith("/assets/sessions") && options.method === "POST") {
    const body = options.body as { clientMutationId: string; slots: Array<Record<string, unknown>> };
    return {
      sessionId,
      clientMutationId: body.clientMutationId,
      assets: body.slots.map((slot, index) => ({ ...slot, assetId: index === 0 ? originalAssetId : thumbnailAssetId, uploadStatus: "pending" })),
      expiresAt: "2026-07-01T00:00:00.000Z",
    } as T;
  }
  if (path.includes(`/assets/sessions/${sessionId}/assets/`) && options.method === "PUT") {
    return { status: "uploaded" } as T;
  }
  if (path.endsWith(`/assets/sessions/${sessionId}`) && !options.method) {
    return {
      sessionId,
      clientMutationId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      assets: [originalAssetId, thumbnailAssetId].map((assetId, index) => ({
        assetId, fieldName: "imageDataUrl", variant: index === 0 ? "original" : "thumbnail",
        sha256: "a".repeat(64), mimeType: "image/png", sizeBytes: 3, uploadStatus: "uploaded",
      })),
      expiresAt: "2026-07-01T00:00:00.000Z",
      ready: true,
    } as T;
  }
  throw new Error(`unexpected request: ${path}`);
};

async function main() {
const repository = createOnlineWriteRepository(request);
const created = await repository.create("garments", {
  clientMutationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  payload: { legacyItemId: 1 },
  assetMutations: [],
});
assert.equal(created.revision, 2, "create must return the mandatory server re-read, not the command echo");
assert.deepEqual(calls.slice(0, 2).map((call) => [call.method ?? "GET", call.path]), [
  ["POST", "/api/workspace/garments"],
  ["GET", `/api/workspace/garments/${firstId}`],
]);

await assert.rejects(
  repository.update("garments", firstId, {
    clientMutationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    expectedRevision: 0,
    payload: {},
    assetMutations: [],
  }),
  /expectedRevision/,
  "updates must reject missing/invalid revision before sending",
);

const batch = await repository.createBatch("garments", {
  items: [
    { clientMutationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", payload: {}, assetMutations: [] },
    { clientMutationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", payload: {}, assetMutations: [] },
  ],
});
assert.deepEqual(batch.map((item) => item.status), ["succeeded", "failed"], "batch returns one status per item");
assert.equal(batch[0].entity?.revision, 2);
assert.match(batch[1].error ?? "", /read-back failed/);

const uploaded = await repository.uploadAssetInputs({
  clientMutationId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  entityType: "garment",
  assets: [
    { fieldName: "imageDataUrl", variant: "original", image: new Blob(["raw"], { type: "image/png" }) },
    { fieldName: "imageDataUrl", variant: "thumbnail", image: new Blob(["tn!"], { type: "image/png" }) },
  ],
});
assert.deepEqual(uploaded.assetMutations, [{
  kind: "create_or_replace",
  fieldName: "imageDataUrl",
  temporaryAssetIds: [originalAssetId, thumbnailAssetId],
}]);
const sessionCall = calls.find((call) => call.path.endsWith("/assets/sessions") && call.method === "POST");
assert.equal((sessionCall?.body as { slots: Array<{ sha256: string }> }).slots[0].sha256.length, 64, "asset slots include SHA-256");
assert.equal(calls.filter((call) => call.path.includes(`/assets/sessions/${sessionId}/assets/`) && call.method === "PUT").length, 2, "original and thumbnail are uploaded separately");

console.log("✓ online write repository: assets, revision guard, read-back, and per-item batch results");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
