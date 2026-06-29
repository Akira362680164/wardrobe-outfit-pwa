// scripts/test-thumbnail-backfill.ts
// ============================================================
// 缩略图 backfill / runtime 单元测试 (v1.1.16 commit3 提示词 §5.5)
// ------------------------------------------------------------
// 覆盖 v1.1.16 commit3 §5.5 的 10 项断言:
//   1. generateThumbnailSafe() 包含 JPEG fallback
//   2. 失败对象包含 errorMessage
//   3. thumbnail-backfill state 包含 failedItems
//   4. retryFailed() 存在并只处理失败项
//   5. 设置页展示失败摘要 (前 3 条 + 还有 X 条)
//   6. 设置页存在「重试失败项」按钮
//   7. 种草首页不使用大于套装页的外层 padding
//   8. 种草首页 header 与套装首页使用相同布局 token
//   9. 种草首页保留右下角 floating add button (依赖父级 FAB, 这里验证全局 FAB 存在)
//  10. 种草首页不恢复右上角加号 (只有菜单按钮, 不再额外 + 按钮)
//
// 运行: npx tsx scripts/test-thumbnail-backfill.ts
// ============================================================

import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const thumbRuntime = readFileSync(join(root, "src/lib/thumbnail-runtime.ts"), "utf8");
const thumbBackfill = readFileSync(join(root, "src/lib/thumbnail-backfill.ts"), "utf8");
const imageVariants = readFileSync(join(root, "src/lib/image-variants.ts"), "utf8");
const wardrobeApp = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");
const wishlist = readFileSync(join(root, "src/components/wishlist-view-2.0.tsx"), "utf8");
const outfitList = readFileSync(join(root, "src/components/outfit-list-view.tsx"), "utf8");

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    const msg = detail ? ` — ${detail}` : "";
    failures.push(`${name}${msg}`);
    console.log(`  ❌ ${name}${msg}`);
  }
}

console.log("\n=== §5.5 断言 1-2: generateThumbnailSafe JPEG fallback + errorMessage ===");

// 断言 1: generateThumbnailSafe() 包含 JPEG fallback (quality=0.78)
const hasJpegFallback =
  /JPEG_FALLBACK_QUALITY\s*=\s*0\.78/.test(thumbRuntime) ||
  /image\/jpeg/.test(thumbRuntime) && /0\.78/.test(thumbRuntime);
check("generateThumbnailSafe 包含 JPEG fallback (质量 0.78)", hasJpegFallback);

// 断言 1b: 实际存在 image/jpeg 分支 + tryOrder 数组
const hasJpegBranch = /image\/jpeg/.test(thumbRuntime) && /tryOrder/.test(thumbRuntime);
check("generateThumbnailSafe 内部 tryOrder 包含 image/jpeg 降级路径", hasJpegBranch);

// 断言 2: 失败对象包含 errorMessage
const hasErrorMessageField = /errorMessage\??:\s*string/.test(thumbRuntime);
check("ThumbnailGenResult 接口含 errorMessage 字段", hasErrorMessageField);

// 断言 2b: 失败对象包含 errorTag (含 decode/draw/encode/write 标签)
const hasErrorTag = /ThumbnailErrorTag/.test(thumbRuntime) &&
  /"decode"/.test(thumbRuntime) &&
  /"draw"/.test(thumbRuntime) &&
  /"encode"/.test(thumbRuntime) &&
  /"write"/.test(thumbRuntime);
check("ThumbnailErrorTag 包含 decode / draw / encode / write 四种 tag", hasErrorTag);

check(
  "image-variants 对 SVG dataURL 使用 HTMLImageElement fallback",
  /isSvgDataUrl/.test(imageVariants) &&
    /loadImageElement/.test(imageVariants) &&
    /shouldPreferElement\s*=\s*isSvgDataUrl\(dataUrl\)/.test(imageVariants),
);

console.log("\n=== §5.5 断言 3-4: thumbnail-backfill failedItems + retryFailed ===");

// 断言 3: thumbnail-backfill state 包含 failedItems 数组
const hasFailedItemsArray =
  /failedItems\s*:\s*BackfillFailedItem\[\]/.test(thumbBackfill) ||
  /failedItems\??:\s*BackfillFailedItem\[\]/.test(thumbBackfill) ||
  /failedItems\s*:\s*\[\.\.\.this\.state\.failedItems\]/.test(thumbBackfill);
check("BackfillState 含 failedItems 数组", hasFailedItemsArray);

// 断言 3b: failed 计数等于 failedItems.length (赋值恒等式)
const failedEqualsLength = /failed\s*:\s*failedItems\.length/.test(thumbBackfill);
check("BackfillState.failed 恒等于 failedItems.length", failedEqualsLength);

// 断言 3c: BackfillFailedItem 包含 id/name/kind/errorMessage/failedAt
const failedItemFields =
  /id:\s*number/.test(thumbBackfill) &&
  /name:\s*string/.test(thumbBackfill) &&
  /kind:\s*"main"\s*\|\s*"reference"/.test(thumbBackfill) &&
  /errorMessage:\s*string/.test(thumbBackfill) &&
  /failedAt:\s*string/.test(thumbBackfill);
check("BackfillFailedItem 含 id / name / kind / errorMessage / failedAt", failedItemFields);

// 断言 4: retryFailed() 存在并只处理失败项
const hasRetryFailed =
  /retryFailed\s*\(/.test(thumbBackfill) &&
  /failedItemsByKey\.keys\(\)/.test(thumbBackfill);
check("retryFailed() 方法存在并只遍历 failedItemsByKey", hasRetryFailed);

// 断言 4b: retryFailed() 内部只把 failedKeys 转回 job 入队 (不混入缺失项)
const retryOnlyFailed =
  /retryFailed\s*\(items:[\s\S]{0,2000}?for\s*\(\s*const\s+key\s+of\s+failedKeys\s*\)/.test(thumbBackfill);
check("retryFailed 内部仅遍历 failedKeys, 不混入全量缺失项", retryOnlyFailed);

// 断言 4c: reset() 清空 failedItems
const resetClearsFailed = /reset\s*\(\s*\)\s*:\s*void\s*\{[\s\S]{0,500}?failedItemsByKey\.clear\(\)/.test(thumbBackfill);
check("reset() 内部调用 failedItemsByKey.clear()", resetClearsFailed);

check(
  "thumbnail-backfill 使用运行时缩略图 helper 而不是直接 createThumbnailDataUrl",
  /(generateThumbnailSafe|prepareGarmentThumbnail)/.test(thumbBackfill) && !/createThumbnailDataUrl/.test(thumbBackfill),
);

check(
  "主图回填 job 携带 originalDataUrl + cropBox + cropRevision",
  /originalDataUrl:\s*string/.test(thumbBackfill)
    && /cropBox\?:\s*NormalizedCropBox/.test(thumbBackfill)
    && /cropRevision:\s*number/.test(thumbBackfill),
);

check(
  "主图回填调用 prepareGarmentThumbnail 并传入 cropBox/cropRevision",
  /prepareGarmentThumbnail\(\{[\s\S]{0,300}?cropBox:\s*job\.cropBox[\s\S]{0,120}?cropRevision:\s*job\.cropRevision/.test(thumbBackfill),
);

check(
  "主图回填写回前检查最新 cropRevision 并丢弃旧 job",
  /latestCropRevision\s*!==\s*job\.cropRevision/.test(thumbBackfill)
    && /thumbnail_backfill_stale_job_discarded/.test(thumbBackfill),
);

console.log("\n=== §5.5 断言 5-6: SettingsView 失败摘要 + 重试失败项按钮 ===");

// 断言 5: SettingsView「优化图片缓存」卡片在失败 > 0 时显示前 3 条摘要 + 查看全部入口
const showsFailureSummary =
  /backfillState\.failed\s*>\s*0/.test(wardrobeApp) &&
  /failedItems\.slice\(0,\s*3\)/.test(wardrobeApp) &&
  /data-testid="backfill-failure-open-all"/.test(wardrobeApp) &&
  /查看全部失败记录/.test(wardrobeApp);
check(
  "SettingsView 在 failed > 0 时显示前 3 条失败摘要 + 「查看全部失败记录」按钮",
  showsFailureSummary,
);

// 断言 5b: 失败摘要里显示「主图」/「灵感图」 + 衣物名 + 失败原因
const summaryReadableFormat =
  /主图/.test(wardrobeApp) && /灵感图/.test(wardrobeApp) &&
  /\{f\.name\}/.test(wardrobeApp) && /\{f\.errorMessage\}/.test(wardrobeApp);
check("失败摘要显示衣物名 + 主图/灵感图 + errorMessage", summaryReadableFormat);

// 断言 6: SettingsView 存在「重试失败项」按钮
const hasRetryButton =
  /重试失败项/.test(wardrobeApp) && /backfill\.retryFailed\(/.test(wardrobeApp);
check("SettingsView 含「重试失败项」按钮 (调 backfill.retryFailed)", hasRetryButton);

// 断言 6b: 存在「重新检查」按钮文案 (用于重新统计 Dexie 中所有缺失和失败项)
const hasRecheckButton = /重新检查/.test(wardrobeApp);
check("SettingsView 含「重新检查」按钮 (重新统计 Dexie 缺失和失败项)", hasRecheckButton);

check(
  "设置页底部包含用户主动触发的远程诊断入口",
  /aria-label="远程诊断"/.test(wardrobeApp) &&
    /上传诊断数据/.test(wardrobeApp) &&
    /handleStartDiagnosticUpload/.test(wardrobeApp),
);

console.log("\n=== §5.5 断言 7-10: 种草首页与套装首页布局对齐 ===");

// 断言 7: 种草首页最外层 padding 不大于套装页
// outfit-list-view.tsx 的子页用 space-y-4, 没有额外外层 padding (parent 已 px-4 pt-3)
// wishlist-view-2.0.tsx 首页现在也用 space-y-4 (不再有 px-4 内容容器)
const wishlistNoExtraPadding =
  /space-y-4/.test(wishlist) &&
  !/wishlistHomeContentClassName\s*=\s*"px-4"/.test(wishlist);
check(
  "种草首页不再使用独立 px-4 内容容器, 与套装首页 space-y-4 对齐",
  wishlistNoExtraPadding,
);

// 断言 8: 种草首页 header 与套装首页使用相同布局 token
const outfitHeaderToken = /flex h-14 items-center justify-between gap-3/.test(outfitList);
const wishlistHeaderToken = /flex h-14 items-center justify-between gap-3/.test(wishlist);
check("种草首页 header 使用与套装首页相同的 flex h-14 items-center justify-between gap-3", outfitHeaderToken && wishlistHeaderToken);

// 断言 8b: 都用 min-w-0 包裹标题
const bothUseMinW0 =
  /<div className="min-w-0">/.test(outfitList) &&
  /<div className="min-w-0">/.test(wishlist);
check("种草/套装首页 header 都用 min-w-0 包裹标题区", bothUseMinW0);

// 断言 9: 种草首页保留全局右下角 floating add button (依赖 wardrobe-app 的全局 FAB)
// 验证: 父级有 fixed right-4 ... bottom-5 的浮动按钮, 永远显示
const globalFab = /fixed right-4[^"]*bottom-?[^"]*5rem/.test(wardrobeApp) ||
  /setShowCreateSheet/.test(wardrobeApp) && /rounded-full/.test(wardrobeApp);
check("wardrobe-app 仍保留全局 floating add button (种草页继承父级 FAB)", globalFab);

// 断言 10: 种草首页不恢复右上角加号 (只保留菜单按钮)
// 验证: 种草首页 header 右侧只渲染 MoreVertical 菜单按钮, 不再渲染任何 "+" 文字按钮
const wishlistHeaderMenuBlockStart = wishlist.indexOf('data-testid="wishlist-header-menu"') - 600;
const wishlistHeaderMenuBlockEnd = wishlist.indexOf("</AnimatePresence>", wishlistHeaderMenuBlockStart) + 200;
const wishlistHeaderMenuBlock = wishlist.slice(
  Math.max(0, wishlistHeaderMenuBlockStart),
  Math.min(wishlist.length, wishlistHeaderMenuBlockEnd),
);
const hasNoHeaderPlus = !/[\u52a0\u53f7\u6309\u94ae].*\+\s*(?:种\u8349|新\u5efa|添加|新建)/.test(wishlistHeaderMenuBlock);
const hasMenuButton = /<MoreVertical\b/.test(wishlistHeaderMenuBlock) || /MoreVertical size=\{18\}/.test(wishlistHeaderMenuBlock);
check(
  "种草首页 header 右上角只保留 MoreVertical 菜单, 不再渲染 + 文字按钮",
  hasNoHeaderPlus && hasMenuButton,
  `headerMenuBlockHasNoPlus=${hasNoHeaderPlus}, hasMenuButton=${hasMenuButton}`,
);

// 总结
console.log(`\n=== 总计: ${pass} pass / ${fail} fail ===\n`);
if (fail > 0) {
  console.log("失败项：");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("🎉 v1.1.16 commit3 §5.5 全部测试通过");
