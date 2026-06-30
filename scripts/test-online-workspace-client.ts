import assert from "node:assert/strict";

import type { WorkspaceEntity } from "@wardrobe/cloud-contracts";

import { OnlineImageClient } from "../src/lib/online/online-image-client";
import { getOnlineEntityMetadata, OnlineWorkspaceRepository } from "../src/lib/online/online-repository";
import { beginOnlineLoad, failOnlineLoad, finishOnlineLoad, initialOnlineState } from "../src/lib/online/online-state";

async function main() {
  const loading = initialOnlineState<{ value: number }>();
  assert.deepEqual(loading, { status: "loading", data: null });
  const ready = finishOnlineLoad({ value: 1 });
  assert.deepEqual(beginOnlineLoad(ready), { status: "refreshing", data: { value: 1 } });
  assert.deepEqual(failOnlineLoad(ready, "刷新失败"), { status: "refresh_error", data: { value: 1 }, message: "刷新失败" });
  assert.deepEqual(failOnlineLoad(loading, "加载失败"), { status: "error", data: null, message: "加载失败" });

  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return new Response(new Blob(["image"], { type: "image/jpeg" }), {
      status: 200,
      headers: { "content-type": "image/jpeg", "x-asset-sha256": "a".repeat(64) },
    });
  };
  const revoked: string[] = [];
  let nextUrl = 0;
  const images = new OnlineImageClient({
    session: { accessToken: "token", deviceId: "device" },
    createObjectUrl: () => `blob:test-${++nextUrl}`,
    revokeObjectUrl: (url) => revoked.push(url),
  });
  try {
    const first = await images.load("11111111-1111-4111-8111-111111111111", "original", "a".repeat(64));
    const cached = await images.load("11111111-1111-4111-8111-111111111111", "original", "a".repeat(64));
    assert.equal(first, cached);
    assert.equal(fetchCount, 1, "a session image should only download once");
    const retried = await images.retry("11111111-1111-4111-8111-111111111111", "original", "a".repeat(64));
    assert.notEqual(retried, first);
    assert.equal(fetchCount, 2, "single-image retry should only re-download that image");
    assert.deepEqual(revoked, [first]);
    images.clear();
    assert.deepEqual(revoked, [first, retried], "logout/unmount cleanup should revoke all object URLs");
  } finally {
    globalThis.fetch = originalFetch;
  }

  const entity: WorkspaceEntity = {
    id: "22222222-2222-4222-8222-222222222222",
    revision: 4,
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
    payload: { legacyItemId: 7, name: "测试衬衫", locationId: "home", colors: { mode: "single", primary: "蓝色" } },
  };
  const repository = new OnlineWorkspaceRepository({ accessToken: "token", deviceId: "device" });
  const garment = await repository.mapGarment(entity);
  assert.equal(garment.id, 7);
  assert.deepEqual(getOnlineEntityMetadata(garment), { entityId: entity.id, revision: 4, kind: "garment" });
  repository.dispose();

  console.log("online workspace client checks passed");
}

void main();
