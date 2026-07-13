import assert from "node:assert/strict";

async function main() {
let downloadCalls = 0;
let shouldFail = false;
const storage = new Map<string, unknown>();
(globalThis as typeof globalThis & { getApp: () => unknown }).getApp = () => ({ globalData: { apiBaseUrl: "https://example.test" } });
(globalThis as typeof globalThis & { wx: Record<string, unknown> }).wx = {
  getStorageSync: (key: string) => storage.get(key) ?? "",
  setStorageSync: (key: string, value: unknown) => storage.set(key, value),
  removeStorageSync: (key: string) => storage.delete(key),
  downloadFile: (options: { success: (result: { statusCode: number; tempFilePath: string }) => void; fail: () => void }) => {
    downloadCalls += 1;
    queueMicrotask(() => shouldFail ? options.fail() : options.success({ statusCode: 200, tempFilePath: `/tmp/image-${downloadCalls}` }));
  },
};

const { clearDownloadedAssetImageCache, downloadAssetImage } = await import("../apps/wechat-miniprogram/services/assets");
const { clearSession, setSession } = await import("../apps/wechat-miniprogram/stores/session");

setSession({ token: "token-a", deviceId: "device-a", user: { id: "user-a" } });
const ref = { assetId: "asset-a", variants: ["thumbnail", "original"] };
const [first, concurrent] = await Promise.all([downloadAssetImage(ref), downloadAssetImage(ref)]);
assert.equal(downloadCalls, 1, "concurrent image reads share one download");
assert.equal(first, concurrent);
assert.equal(await downloadAssetImage(ref), first);
assert.equal(downloadCalls, 1, "resolved image path is reused in the same session");

clearSession();
setSession({ token: "token-b", deviceId: "device-b", user: { id: "user-b" } });
await downloadAssetImage(ref);
assert.equal(downloadCalls, 2, "a different session cannot reuse the previous path");

clearDownloadedAssetImageCache();
shouldFail = true;
assert.equal(await downloadAssetImage({ assetId: "asset-fail", variants: ["thumbnail"] }), "");
shouldFail = false;
assert.notEqual(await downloadAssetImage({ assetId: "asset-fail", variants: ["thumbnail"] }), "");
assert.equal(downloadCalls, 4, "failed downloads are evicted and can retry");

console.log("miniprogram image session cache passed");
}

void main();
