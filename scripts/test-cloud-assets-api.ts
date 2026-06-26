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

console.log("\n=== Cloud Assets API C1 ===");
check("contracts 包含上传授权与完成通知", /AssetUploadAuthorizeRequestSchema/.test(contracts) && /AssetUploadCompleteRequestSchema/.test(contracts));
check("contracts 限制 ownerEntityType 不能是 asset 自身", /SyncEntityTypeSchema\.exclude\(\["asset"\]\)/.test(contracts));
check("客户端封装调用 C1 两个 API", /\/api\/assets\/upload-url/.test(api) && /\/api\/assets\/complete-upload/.test(api));
check("客户端封装沿用 Bearer token 和 device id header", /Authorization: `Bearer \$\{options\.accessToken\}`/.test(api) && /X-Wardrobe-Device-Id/.test(api));
check("cloud-sync index 导出资产 API", /requestAssetUploadUrl/.test(index) && /requestAssetUploadComplete/.test(index));
check("服务端 CORS 允许 device id header", /X-Wardrobe-Device-Id/.test(app));
check("C1 尚未接入业务图片保存路径", !/requestAssetUploadUrl|requestAssetUploadComplete/.test(`${wardrobeApp}\n${wishlistView}\n${outfitView}`));
check("package.json 暴露 cloud-assets-api 测试", /"test:logic:cloud-assets-api": "tsx scripts\/test-cloud-assets-api\.ts"/.test(packageJson));
check("test:logic:all 包含 cloud-assets-api", /test:logic:cloud-assets-api/.test(packageJson));

console.log(`\n${pass} passed, ${fail} failed`);
assert.equal(fail, 0);
