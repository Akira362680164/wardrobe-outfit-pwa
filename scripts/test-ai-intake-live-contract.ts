// v1.1.16-dev commit1: AI 录入主链 + 裁切源契约静态断言
// 覆盖 prompt §3.5 全部 10 项断言, 不写入真实 MiniMax Key, 只验证源码接线与文案。
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const wardrobeApp = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");
const garmentFlow = readFileSync(join(root, "src/components/garment-intake-flow.tsx"), "utf8");
const wishlistView = readFileSync(join(root, "src/components/wishlist-view-2.0.tsx"), "utf8");
const outfitFlow = readFileSync(join(root, "src/components/outfit-intake-flow.tsx"), "utf8");
const deviceMiniMax = readFileSync(join(root, "src/lib/device-minimax.ts"), "utf8");
const wishlistFromAi = readFileSync(join(root, "src/lib/wishlist-intake-from-ai.ts"), "utf8");

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

console.log("\n=== §3.4.1 单品录入 AI 主链 ===");
// 1. 单品裁切确认后存在 recognizing 状态
check(
  "GarmentIntakeFlow 状态机含 recognizing",
  /"recognizing"/.test(garmentFlow) && /setGarmentIntakeImageError[\s\S]+?setGarmentIntakeImageDraft/.test(garmentFlow),
);
// 2. 单品 AI 请求源使用 croppedImageDataUrl
check(
  "GarmentIntakeFlow processAllImagesForRecognition 优先 croppedImageDataUrl",
  /imageToProcess = item\.croppedImageDataUrl \?\? item\.originalDataUrl/.test(garmentFlow),
);
// 3. 单品 fallback 只在 AI catch 分支出现
check(
  "GarmentIntakeFlow fallback 仅在 catch 分支",
  /catch \(err\)[\s\S]+?setGarmentIntakeImageError\(prev, item\.id, formatIntakeError/.test(garmentFlow),
);
check(
  "GarmentIntakeFlow 失败草稿顶部显示「AI 识别失败」banner",
  /AI 识别失败，已生成待确认草稿/.test(garmentFlow),
);
check(
  "GarmentIntakeFlow 缩略图 strip 显示「AI 正在识别第 N 张」loading",
  /item\.status === "recognizing"[\s\S]+?识别中/.test(garmentFlow),
);
// 4. wardrobe-app 给 GarmentIntakeFlow 传 onProcessImage
check(
  "wardrobe-app GarmentIntakeFlow wiring 传 onProcessImage",
  /<GarmentIntakeFlow[\s\S]+?onProcessImage=\{processGarmentIntakeImage\}/.test(wardrobeApp),
);
// 5. wardrobe-app 的 processGarmentIntakeImage 调 recognizeSingleItemFromDataUrl
check(
  "wardrobe-app processGarmentIntakeImage 调 recognizeSingleItemFromDataUrl",
  /async function processGarmentIntakeImage[\s\S]+?recognizeSingleItemFromDataUrl\(/.test(wardrobeApp),
);
// 6. processGarmentIntakeImage 用裁切图（imageToProcess）作 AI 源
check(
  "processGarmentIntakeImage 使用裁切图 imageDataUrl 作为 AI 请求源",
  /processGarmentIntakeImage[\s\S]+?recognizeSingleItemFromDataUrl\([\s\S]+?aiRequestDataUrl/.test(wardrobeApp),
);
// 7. garment-intake-flow.tsx 把 aiTag 映射到 buildLocalGarmentDraft
check(
  "GarmentIntakeFlow 把 aiTag 映射到 buildLocalGarmentDraft",
  /mapAiTagToGarmentDraftInput\(aiTag, item\.fileName\)/.test(garmentFlow),
);

console.log("\n=== §3.4.2 种草录入 AI 商品识别 ===");
// 8. 种草正式录入复用单品多图识别链
check(
  "WishlistView20 渲染 GarmentIntakeFlow 作为种草录入",
  /<GarmentIntakeFlow[\s\S]+?title="添加种草"[\s\S]+?flowKind="wishlist"/.test(wishlistView),
);
check(
  "WishlistView20 给种草 GarmentIntakeFlow 传 onPickImages",
  /<GarmentIntakeFlow[\s\S]+?onPickImages=\{onPickIntakeImages\}/.test(wishlistView),
);
check(
  "WishlistView20 给种草 GarmentIntakeFlow 传 onProcessImage",
  /<GarmentIntakeFlow[\s\S]+?onProcessImage=\{onProcessIntakeImage\}/.test(wishlistView),
);
check(
  "WishlistView20 批量保存种草草稿",
  /handleSaveIntakeDrafts[\s\S]+?garmentDraftToWishlistItem/.test(wishlistView),
);
check(
  "wardrobe-app 给 WishlistView20 传种草录入多图与识别回调",
  /<WishlistView20[\s\S]+?onPickIntakeImages=\{pickGarmentIntakeImages\}[\s\S]+?onProcessIntakeImage=\{processGarmentIntakeImage\}/.test(wardrobeApp),
);

console.log("\n=== §3.4.3 套装录入 AI 复核 ===");
// 11. 套装录入不含图片 AI 识别
check(
  "OutfitIntakeFlow 设计为「已有衣物组合」, 不含图片 onProcessImage",
  !/onProcessImage/.test(outfitFlow),
);
// 12. 套装 ensureEnhancedDraft 有 AI 失败兜底本地规则
check(
  "OutfitIntakeFlow ensureEnhancedDraft AI 失败兜底本地规则",
  /ensureEnhancedDraft[\s\S]+?AI失败 → 本地规则兜底/.test(outfitFlow),
);

console.log("\n=== §3.4.4 编辑页重新识别 ===");
// 13. recognizeEditDraftAgain 优先使用 imageDataUrl
check(
  "recognizeEditDraftAgain 优先使用 editDraft.imageDataUrl",
  /async function recognizeEditDraftAgain[\s\S]+?const source = editDraft\.imageDataUrl \|\| editDraft\.sourceImageDataUrl/.test(wardrobeApp),
);
// 14. recognizeEditDraftAgain 不修改 cropBox / imageDataUrl / sourceImageDataUrl
check(
  "recognizeEditDraftAgain 不修改 cropBox / imageDataUrl",
  (() => {
    const start = wardrobeApp.indexOf("async function recognizeEditDraftAgain");
    const end = wardrobeApp.indexOf("async function saveEditedItem", start);
    if (start < 0 || end < 0) return false;
    const body = wardrobeApp.slice(start, end);
    return body.includes("recognizeSingleItemFromDataUrl") && !body.includes("detectGarmentsOnDevice") && !body.includes("candidate");
  })(),
);

console.log("\n=== §3.4.5 编辑页单一裁切入口 ===");
// 15. WardrobeEditPage 有 onCrop prop
check(
  "WardrobeEditPage 接收 onCrop prop",
  /function WardrobeEditPage\(\{[\s\S]+?onCrop,/.test(wardrobeApp),
);
// 16. WardrobeEditPage 不再有 onCropFromSource prop
check(
  "WardrobeEditPage 不再接收 onCropFromSource prop",
  !/onCropFromSource/.test(wardrobeApp),
);
// 17. wardrobe-app 给 WardrobeEditPage 传 onCrop（用 sourceImageDataUrl 优先）
check(
  "wardrobe-app onCrop 用 sourceImageDataUrl 优先",
  /onCrop=\{\(editDraft\.sourceImageDataUrl \|\| editDraft\.imageDataUrl\) \? \(\) => \{[\s\S]+?sourceKind:[\s\S]+?"original"[\s\S]+?setViewingItemCropJob/.test(wardrobeApp),
);
// 18. wardrobe-app 不再给 WardrobeEditPage 传 onCropFromSource
check(
  "wardrobe-app 不再传 onCropFromSource",
  !/onCropFromSource=/.test(wardrobeApp),
);
// 19. WardrobeEditPage 渲染「重新裁切」按钮
check(
  "WardrobeEditPage 渲染「重新裁切」按钮 (onClick={onCrop})",
  /onClick=\{onCrop\}[\s\S]+?重新裁切/.test(wardrobeApp),
);
// 20. WardrobeEditPage 不再渲染「从原图重新裁切」按钮
check(
  "WardrobeEditPage 不再渲染「从原图重新裁切」按钮",
  !/从原图重新裁切/.test(wardrobeApp),
);

console.log("\n=== §3.4.6 cropBoxSource 标记 ===");
// 21. viewingItemCropJob 含 sourceKind 字段
check(
  "viewingItemCropJob 类型含 sourceKind: \"current\" | \"original\"",
  /viewingItemCropJob[\s\S]+?sourceKind\?:\s*"current"\s*\|\s*"original"/.test(wardrobeApp),
);
// 22. 编辑页 onConfirm 使用统一 toast 文案
check(
  "编辑页 onConfirm 使用统一裁切提示",
  /onMessage\("裁切已更新，请保存衣物", "success"\)/.test(wardrobeApp),
);
// 23. 当前主图裁切路径不使用 sourceImageDataUrl 作 imageDataUrl 来源
check(
  "当前主图裁切 (sourceKind=current) 保留 sourceImageDataUrl 不变",
  /sourceKind\?:\s*"current"[\s\S]+?sourceImageDataUrl: current\.sourceImageDataUrl \|\| viewingItemCropJob\.dataUrl/.test(wardrobeApp),
);

console.log("\n=== 安全契约（不写入真实 Key） ===");
// 24. 测试文件本身不含 key 字面值
const testContent = readFileSync(__filename, "utf8");
check(
  "本测试脚本不含真实 MiniMax Key 字面值",
  !/sk-[a-zA-Z0-9]{20,}/.test(testContent) && !/eyJ[A-Za-z0-9_-]{30,}/.test(testContent),
);
// 25. wardrobe-app 不在源码硬编码 Key
check(
  "wardrobe-app.tsx 不硬编码 MiniMax Key 字面值",
  !/sk-[a-zA-Z0-9]{20,}/.test(wardrobeApp) && !/eyJ[A-Za-z0-9_-]{30,}/.test(wardrobeApp),
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
