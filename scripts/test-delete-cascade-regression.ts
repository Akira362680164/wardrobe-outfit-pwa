import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const wardrobeApp = read("src/components/wardrobe-app.tsx");
const repository = read("src/lib/repository/wardrobe-repository.ts");
const outfitList = read("src/components/outfit-list-view.tsx");
const wishlist = read("src/components/wishlist-view-2.0.tsx");
const outfitCascade = read("src/lib/outfit-cascade-delete.ts");
const wardrobeCascade = read("src/lib/wardrobe-cascade-delete.ts");

assert.equal(existsSync(join(root, "src/lib/data-repo.ts")), false, "data-repo Stub 必须删除");
assert.match(repository, /onlineWriteRepository\.remove\("garments"/, "单品删除必须调用线上写仓库");
assert.match(repository, /onlineWriteRepository\.remove\("outfits"/, "套装删除必须调用线上写仓库");
assert.match(wardrobeApp, /repoDeleteGarments\(/, "衣橱删除必须走线上仓库");
assert.match(wardrobeApp, /await refreshState\(\)/, "删除后必须重新读取服务器状态");
assert.match(outfitList, /deleteOutfit\(viewingOutfit\)/, "套装删除必须携带服务器 revision 元数据");
assert.doesNotMatch(outfitList, /deleteOutfit\(viewingOutfit\.id\)/, "不得只传 ID 绕过 revision 检查");
assert.match(wishlist, /wardrobeRepository\.(deleteWishlistItems|undoWishlistPurchase)/, "种草删除与撤销必须走线上仓库");
assert.doesNotMatch(outfitCascade, /db\.|Dexie|transaction\(/, "套装级联类型文件不得保留 Dexie 运行时");
assert.doesNotMatch(wardrobeCascade, /db\.|Dexie|transaction\(/, "衣橱级联类型文件不得保留 Dexie 运行时");

console.log("delete cascade online regression tests passed");
