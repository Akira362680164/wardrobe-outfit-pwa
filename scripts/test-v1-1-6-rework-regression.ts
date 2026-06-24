#!/usr/bin/env tsx
// v1.1.6 返工修复防回归测试
// 读取源码文件，断言关键修复点不会被回滚

import { readFileSync } from "node:fs";

function check(label: string, ok: boolean): void {
  if (ok) {
    console.log(`  ✅ ${label}`);
  } else {
    console.error(`  ❌ ${label}`);
    process.exitCode = 1;
  }
}

// —— 读取文件 ——
const garmentDetail = readFileSync("src/components/garment-detail-3.0.tsx", "utf-8");
const outfitListView = readFileSync("src/components/outfit-list-view.tsx", "utf-8");
const detailShell = readFileSync("src/components/detail-shell.tsx", "utf-8");
const wishlistView = readFileSync("src/components/wishlist-view-2.0.tsx", "utf-8");
const wardrobeApp = readFileSync("src/components/wardrobe-app.tsx", "utf-8");
const imageIntakeController = readFileSync("src/components/use-wardrobe-image-intake-controller.ts", "utf-8");

console.log("\n📋 单品详情页回归\n");

// 1. 单品详情 DetailQuickActions 不包含 key: "edit"
check(
  "单品详情 DetailQuickActions 不含 key: edit",
  !/key:\s*"edit"/.test(garmentDetail.match(/<DetailQuickActions[\s\S]*?\/>/)?.[0] ?? ""),
);

// 2. 单品详情 DetailHeroGallery 包含 bottomRightAction
check(
  "单品详情 DetailHeroGallery 包含 bottomRightAction",
  garmentDetail.includes("bottomRightAction"),
);

// 3. 单品 AI 标题不含"AI套装建议"
check(
  '单品 AI 标题不含 "AI套装建议"',
  !garmentDetail.includes("AI套装建议"),
);

// 4. 单品 AI 标题包含"AI穿搭建议"
check(
  '单品 AI 标题包含 "AI穿搭建议"',
  garmentDetail.includes("AI穿搭建议"),
);

// 5. 单品详情 MotionPopoverMenu children 不含 shadow-lg ring-1 ring-ink/10
const garmentMenuMatch = garmentDetail.match(/<MotionPopoverMenu[\s\S]*?<\/MotionPopoverMenu>/);
const garmentMenuBlock = garmentMenuMatch?.[0] ?? "";
check(
  "单品详情 MotionPopoverMenu children 不含 shadow-lg ring-1 ring-ink/10",
  !/shadow-lg.*ring-1.*ring-ink\/10/.test(garmentMenuBlock),
);

console.log("\n📋 套装详情页回归\n");

// 6. 套装详情 DetailQuickActions 不包含 key: "edit"
check(
  "套装详情 DetailQuickActions 不含 key: edit",
  !/key:\s*"edit"/.test(outfitListView.match(/<DetailQuickActions[\s\S]*?\/>/)?.[0] ?? ""),
);

// 7. 套装详情 DetailHeroGallery 包含 bottomRightAction
check(
  "套装详情 DetailHeroGallery 包含 bottomRightAction",
  outfitListView.includes("bottomRightAction"),
);

// 8. 套装详情使用 MotionPopoverMenu
check(
  "套装详情使用 MotionPopoverMenu",
  outfitListView.includes("<MotionPopoverMenu"),
);

// 9. 套装详情菜单不含手写 absolute right-4 z-50（含 Pencil 图标）
check(
  "套装详情菜单不含手写 absolute right-4 z-50（含 Pencil 图标）",
  !/absolute\s+right-4\s+z-50[\s\S]{0,200}Pencil[\s\S]{0,80}编辑套装/.test(outfitListView),
);

console.log("\n📋 DetailShell 回归\n");

// 10. DetailHeroGalleryProps 包含 bottomRightAction
check(
  "DetailHeroGallery props 包含 bottomRightAction",
  detailShell.includes("bottomRightAction?: ReactNode"),
);

// 11. SwipeImageCarousel slides badge 清空
check(
  "SwipeImageCarousel slides badge 清空",
  !/badge:\s*slide\.label/.test(detailShell),
);

console.log("\n📋 种草已买页回归\n");

// 12. WishlistGlobalDialogs 在组件单例 return 内
const finalReturn = wishlistView.substring(
  wishlistView.lastIndexOf("  // v1.1.6 followup Commit 2: 统一渲染。子页有 subPageNode"),
);
check(
  "WishlistGlobalDialogs 在组件主 return 底部",
  finalReturn.includes("WishlistGlobalDialogs"),
);

// 13. purchasedItems 使用 isWishlistPurchased 推导
check(
  'purchasedItems 使用 isWishlistPurchased 推导',
  /isWishlistPurchased/.test(wishlistView.match(/purchasedItems\s*=\s*useMemo[\s\S]*?\[/)?.[0] ?? ""),
);

// 14. purchased/rejected/archived 分支无早期 return（subPageNode 赋值后不跟 return;）
// 第一个 "if (subPage === ...)" 在 useStableBackHandler 内，跳过它。
const markerIdx = wishlistView.indexOf("/*  LIST SUB-PAGES");
const purchasedStart2 = markerIdx >= 0
  ? wishlistView.indexOf('if (subPage === "purchased" || subPage === "rejected" || subPage === "archived")', markerIdx)
  : -1;
const detailStart2 = wishlistView.indexOf("/*  DETAIL PAGE", purchasedStart2 > 0 ? purchasedStart2 : 0);
const purchasedRegion = purchasedStart2 >= 0 && detailStart2 > purchasedStart2
  ? wishlistView.substring(purchasedStart2, detailStart2)
  : "";
check(
  "purchased/rejected/archived 分支无早期 return",
  purchasedRegion.length > 0 && !/\);\s*\n\s*return\s*;/.test(purchasedRegion),
);

console.log("\n📋 相机/相册入口回归\n");

// 15. 引入 @capacitor/camera
check(
  "引入 @capacitor/camera",
  wardrobeApp.includes("@capacitor/camera"),
);

// 16. handleNativeCameraCapture 存在 (迁移到 image intake controller)
check(
  "handleNativeCameraCapture 存在",
  imageIntakeController.includes("handleNativeCameraCapture"),
);

// 17. handleNativeGalleryPick 存在 (迁移到 image intake controller)
check(
  "handleNativeGalleryPick 存在",
  imageIntakeController.includes("handleNativeGalleryPick"),
);

// 18. Android 原生拍照通过 image intake controller 的 handleNativeCameraCapture 处理
check(
  "Android 原生拍照按钮通过 image intake controller 处理",
  /handleNativeCameraCapture/.test(imageIntakeController),
);

console.log("");

if (process.exitCode === 1) {
  console.error("❌ 有回归测试失败\n");
  process.exit(1);
} else {
  console.log("✅ 全部回归测试通过\n");
}
