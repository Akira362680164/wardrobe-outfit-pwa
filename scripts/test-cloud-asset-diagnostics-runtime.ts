import { createHash } from "node:crypto";
import { strict as assert } from "node:assert";

async function main() {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => String(input).includes("/api/assets/manifest")
    ? Response.json({ items: [] }, { status: 200 })
    : new Response(bytes, {
        status: 200,
        headers: { "content-type": "image/png", "x-asset-sha256": sha256 },
      });

  try {
    const { downloadAssetContent, requestAssetManifest, verifyRemoteAssetVariants } = await import("../src/lib/cloud-sync/cloud-assets-api");
    const { getDiagnosticEvents } = await import("../src/lib/diagnostic-log");
    const options = { accessToken: "test-token", deviceId: "test-device" };
    const assetId = "00000000-0000-4000-8000-000000000001";

    const downloaded = await downloadAssetContent({ assetId, variant: "thumbnail" }, options);
    assert.equal(downloaded.httpStatus, 200);
    assert.equal(downloaded.transport, "fetch");
    assert.equal(downloaded.sha256, sha256);
    assert.equal(downloaded.actualSha256, sha256);
    assert.equal(downloaded.sizeBytes, bytes.length);
    assert.match(downloaded.requestId, /^[0-9a-f-]{36}$/);

    const verified = await verifyRemoteAssetVariants({
      assetId,
      expectedSha256: { original: sha256, thumbnail: sha256 },
    }, options);
    assert.equal(verified.length, 2);
    assert(verified.every((entry) => entry.verified && entry.responseSha256 === entry.actualSha256));
    assert.deepEqual(await requestAssetManifest({ limit: 200 }, options), { items: [] });

    const assetEvents = getDiagnosticEvents().filter((event) => event.category === "asset");
    assert(assetEvents.some((event) => event.name === "asset_download_request" && event.phase === "started"));
    assert(assetEvents.some((event) => event.name === "asset_download_request" && event.phase === "succeeded" && event.httpStatus === 200));
    assert(assetEvents.some((event) => event.name === "asset_download_validated" && event.phase === "succeeded"));
    assert(assetEvents.some((event) => event.name === "asset_manifest_request" && event.phase === "succeeded" && event.httpStatus === 200));
    console.log("cloud asset diagnostic runtime: passed");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
