import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const contracts = read("packages/cloud-contracts/src/assets/contracts.ts");
const api = read("src/lib/cloud-sync/cloud-assets-api.ts");
const index = read("src/lib/cloud-sync/index.ts");
const app = read("services/wardrobe-api/src/app.ts");
const wardrobeApp = read("src/components/wardrobe-app.tsx");
const wishlistView = read("src/components/wishlist-view-2.0.tsx");
const outfitView = read("src/components/outfit-list-view.tsx");
const packageJson = read("package.json");

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`);
  }
}

console.log("\n=== Cloud Assets API Proxy ===");
check("contracts 包含二进制上传参数、header 和响应", /AssetUploadParamsSchema/.test(contracts) && /AssetUploadHeadersSchema/.test(contracts) && /AssetUploadResponseSchema/.test(contracts));
check("contracts 包含直接下载和删除", /AssetDownloadParamsSchema/.test(contracts) && /AssetDeleteParamsSchema/.test(contracts));
check("contracts 包含资产清单", /AssetManifestRequestSchema/.test(contracts) && /AssetManifestResponseSchema/.test(contracts));
check("contracts 限制 ownerEntityType 不能是 asset 自身", /SyncEntityTypeSchema\.exclude\(\["asset"\]\)/.test(contracts));
check("客户端只调用自有 API 的 content/manifest 路由", /\/api\/assets\/\$\{encodeURIComponent\(request\.assetId\)\}\/\$\{encodeURIComponent\(request\.variant\)\}\/content/.test(api) && /\/api\/assets\/manifest/.test(api));
check("客户端不接受任意 host 或外部地址", !/uploadUrl|downloadUrl|putToUrl/.test(api));
check("客户端封装沿用 Bearer token 和 device id header", /Authorization: `Bearer \$\{options\.accessToken\}`/.test(api) && /X-Wardrobe-Device-Id/.test(api));
check("cloud-sync index 导出新资产 API", /uploadAssetContent/.test(index) && /downloadAssetContent/.test(index) && /deleteCloudAsset/.test(index) && /requestAssetManifest/.test(index));
check("服务端 CORS 允许二进制上传和完整资产 header", /GET, POST, PUT, DELETE, OPTIONS/.test(app) && /X-Asset-Owner-Entity-Type/.test(app) && /X-Asset-SHA256/.test(app));
check("业务图片路径不再引用旧授权函数", !/requestAssetUploadUrl|requestAssetDownloadUrl/.test(`${wardrobeApp}\n${wishlistView}\n${outfitView}`));
check("package.json 暴露 cloud-assets-api 测试", /"test:logic:cloud-assets-api": "tsx scripts\/test-cloud-assets-api\.ts"/.test(packageJson));
check("test:logic:all 包含 cloud-assets-api", /test:logic:cloud-assets-api/.test(packageJson));

console.log(`\n${pass} passed, ${fail} failed`);
assert.equal(fail, 0);
