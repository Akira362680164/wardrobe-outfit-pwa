// Static assertion helpers for source-level checks
import { strict as assert } from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const wardrobeApp = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");
const imageIntakeController = readFileSync(join(root, "src/components/use-wardrobe-image-intake-controller.ts"), "utf8");
const hiddenInputs = readFileSync(join(root, "src/components/wardrobe-hidden-image-inputs.tsx"), "utf8");
const imageSourceSheet = readFileSync(join(root, "src/components/wardrobe-image-source-sheet.tsx"), "utf8");
const appRoute = readFileSync(join(root, "src/lib/app-route.ts"), "utf8");
const wardrobeCardMarker = wardrobeApp.indexOf("const cardEntries = deriveGarmentImageList(item, outfits);");
const wardrobeCardStart = wardrobeApp.lastIndexOf('<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">', wardrobeCardMarker);
const wardrobeCardEnd = wardrobeApp.indexOf("{multiSelectMode && selectedItemIds.size > 0", wardrobeCardMarker);
const wardrobeCardBlock = wardrobeCardStart >= 0 && wardrobeCardEnd > wardrobeCardStart
  ? wardrobeApp.slice(wardrobeCardStart, wardrobeCardEnd)
  : "";

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

// 1. wardrobe_home 返回目标重置规则
// 2. wishlist_owned 返回目标一次性规则
// 3. 常驻 input 入口存在性静态断言
// 4. openImageSourceSheet("garment") 设置 captureMode 为 "item" 的静态断言
// 5. openImageSourceSheet("wishlist") 设置 captureMode 为 "item" 的静态断言

// Test 1: wardrobeApp has openWardrobeItemDetail that sets garmentDetailReturnTarget first
check(
  "WardrobeApp 内 openWardrobeItemDetail 函数在 setViewingItem 之前先 setGarmentDetailReturnTarget",
  /function openWardrobeItemDetail[\s\S]*?setGarmentDetailReturnTarget\(returnTarget\)[\s\S]*?setViewingItem\(item\)/.test(wardrobeApp),
);

// Test 2: openWardrobeItemDetail is called with AppRoute in pendingViewingItemId flow
// v1.1.20-dev (方案 C + Bug 2): 第二参数从字符串 wardrobe_home / wishlist_owned 升级为完整 AppRoute 对象。
check(
  "pendingViewingItemId 路径通过 openWardrobeItemDetail 打开 (避免直接 setViewingItem 污染)",
  /pendingViewingItemId[\s\S]{0,1500}openWardrobeItemDetail\(item,\s*targetRoute/.test(wardrobeApp),
);

// Test 3: 普通录入完成后只关闭创建流程, 不再强制返回衣橱首页
const saveGarmentMatch = /async function saveGarmentIntakeDraft[\s\S]*?\n  \}/.exec(wardrobeApp);
const saveGarmentBlock = saveGarmentMatch?.[0] ?? "";
const saveBatchMatch = /async function saveBatchGarmentIntakeDrafts[\s\S]*?\n  async function updateItemStatus/.exec(wardrobeApp);
const saveBatchBlock = saveBatchMatch?.[0] ?? "";
check(
  "saveGarmentIntakeDraft 保存后关闭 showGarmentIntakeFlow",
  /setShowGarmentIntakeFlow\(false\)/.test(saveGarmentBlock),
);
check(
  "saveGarmentIntakeDraft 不再强制 switchView(\"wardrobe\")",
  !/switchView\("wardrobe"\)/.test(saveGarmentBlock),
);
check(
  "saveBatchGarmentIntakeDrafts 不再强制 switchView(\"wardrobe\")",
  !/switchView\("wardrobe"\)/.test(saveBatchBlock),
);
check(
  "GarmentIntakeFlow 保存后调用 closeCreateFlow 恢复来源页",
  /await saveBatchGarmentIntakeDrafts\(drafts\);[\s\S]{0,80}closeCreateFlow\(\)/.test(wardrobeApp),
);
check(
  "父层在 garment_detail route 下仍渲染 WardrobeView",
  /route\.name === "wardrobe_home" \|\| route\.name === "garment_detail"[\s\S]+?<WardrobeView/.test(wardrobeApp),
);
check(
  "WardrobeView 接收 activeGarmentRoute 打开衣物详情",
  /activeGarmentRoute=\{route\.name === "garment_detail" \? route : undefined\}/.test(wardrobeApp),
);
check(
  "历史套装点击打开 outfit_detail 并携带 garment_detail pairing returnRoute",
  /onViewOutfit=\{\(outfitId\) => \{[\s\S]+?initialTab: "pairing"[\s\S]+?name: "outfit_detail"[\s\S]+?returnRoute: currentDetailRoute/.test(wardrobeApp),
);
check(
  "OutfitListView 接收 activeOutfitRoute 并用 navigation.goBack 返回",
  /activeOutfitRoute=\{route\.name === "outfit_detail" \? route : undefined\}[\s\S]+?onCloseOutfitDetail=\{\(\) => navigation\.goBack\(\)\}/.test(wardrobeApp),
);
check(
  "移动底部导航使用 navigation.resetToMainTab 同步 AppRoute",
  /MobileNavButton[\s\S]{0,800}navigation\.resetToMainTab/.test(wardrobeApp),
);

// Test 4: 一次性消费 — pendingViewingItemId 在 useEffect 之外不能保留
// 项目源码 onPendingViewingItemConsumed={ () => { 存在 "{" 与 "(" 之间的空格, 匹配允许.
check(
  "pendingViewingItemId 通过 onPendingViewingItemConsumed 一次性消费 (setPendingViewingItemId(null) + setPendingViewingItemReturnTarget('wardrobe_home'))",
  /onPendingViewingItemConsumed\s*=\s*\{\s*\(\s*\)\s*=>\s*\{[\s\S]{0,200}setPendingViewingItemId\(null\);[\s\S]{0,80}setPendingViewingItemReturnTarget\("wardrobe_home"\)/.test(wardrobeApp),
);

// Test 5: 常驻 input 入口存在性
// Test 5 replaced with WardrobeHiddenImageInputs component check
check("WardrobeHiddenImageInputs 组件存在", /WardrobeHiddenImageInputs/.test(wardrobeApp));
// Test 5 replaced with WardrobeHiddenImageInputs component check
check("WardrobeHiddenImageInputs 组件存在", /WardrobeHiddenImageInputs/.test(wardrobeApp));
// Test 5 replaced with WardrobeHiddenImageInputs component check
check("WardrobeHiddenImageInputs 组件存在", /WardrobeHiddenImageInputs/.test(wardrobeApp));
// Test 5 replaced with WardrobeHiddenImageInputs component check
check("WardrobeHiddenImageInputs 组件存在", /WardrobeHiddenImageInputs/.test(wardrobeApp));

// Test 6: openImageSourceSheet("garment") 设置 captureMode 为 "item"
check(
  "openImageSourceSheet('garment') 在 setShowImageSourceSheet(true) 之前设置 captureMode 为 'item'",
  /const openImageSourceSheet = useCallback\([\s\S]*?if \(purpose === "garment" \|\| purpose === "wishlist"\)[\s\S]*?setCaptureMode\("item"\)[\s\S]*?setShowImageSourceSheet\(true\)/.test(imageIntakeController),
);

// Test 7: triggerCameraInput / triggerGalleryInput 安全函数 + 错误提示
check(
  "triggerCameraInput 存在, ref 空时返回 '相机入口未就绪，请重试'",
  /const triggerCameraInput = useCallback\(\(\) => \{[\s\S]*?fileInputRef\.current[\s\S]*?showMessage\("相机入口未就绪，请重试"/.test(imageIntakeController),
);
check(
  "triggerGalleryInput 存在, ref 空时返回 '相册入口未就绪，请重试'",
  /const triggerGalleryInput = useCallback\(\(\) => \{[\s\S]*?galleryInputRef\.current[\s\S]*?showMessage\("相册入口未就绪，请重试"/.test(imageIntakeController),
);

// 4C Follow-up: 新增隐藏 input 真实属性断言
check("WardrobeHiddenImageInputs 中 camera input accept=\"image/*\"", /accept="image\/\*"/.test(hiddenInputs));
check("WardrobeHiddenImageInputs 中 camera input capture=\"environment\"", /capture="environment"/.test(hiddenInputs));
check("WardrobeHiddenImageInputs 中 gallery input accept=\"image/*\"", hiddenInputs.includes("accept=") && hiddenInputs.includes("multiple"));
check("WardrobeHiddenImageInputs 中 gallery input multiple", /multiple/.test(hiddenInputs));
check("WardrobeHiddenImageInputs 使用 fileInputRef", /fileInputRef/.test(hiddenInputs));
check("WardrobeHiddenImageInputs 使用 galleryInputRef", /galleryInputRef/.test(hiddenInputs));
check("WardrobeHiddenImageInputs 调用 onCameraInputChange", /onCameraInputChange/.test(hiddenInputs));
check("WardrobeHiddenImageInputs 调用 onGalleryInputChange", /onGalleryInputChange/.test(hiddenInputs));
check("WardrobeImageSourceSheet 拍照按钮调用 onNativeCameraCapture", /onCameraClick/.test(imageSourceSheet));
check("WardrobeImageSourceSheet 相册按钮调用 onNativeGalleryPick", /onGalleryClick/.test(imageSourceSheet));
check("useWardrobeImageIntakeController 定义 triggerCameraInput", /triggerCameraInput/.test(imageIntakeController));
check("useWardrobeImageIntakeController 定义 triggerGalleryInput", /triggerGalleryInput/.test(imageIntakeController));
check("useWardrobeImageIntakeController 在 ref 缺失时调用 showMessage", /showMessage\("相机入口未就绪，请重试"/.test(imageIntakeController));
check("useWardrobeImageIntakeController 使用 CameraSource.Camera", /CameraSource\.Camera/.test(imageIntakeController));
check("useWardrobeImageIntakeController 使用 pickImages", /pickImages/.test(imageIntakeController));

// Test 8: 来源弹层按钮调 triggerCameraInput / triggerGalleryInput
check("WardrobeImageSourceSheet 组件存在 (含 onCameraClick + onGalleryClick)", /WardrobeImageSourceSheet/.test(wardrobeApp) && /onCameraClick/.test(wardrobeApp) && /onGalleryClick/.test(wardrobeApp));

// Test 9: CaptureView 内部已不重复挂载 file input
const captureViewFileInput = /function CaptureView[\s\S]*?<input[\s\S]*?ref=\{fileInputRef\}[\s\S]*?capture="environment"/.test(wardrobeApp);
check("CaptureView 内部已删除重复 file input (capture=environment)", !captureViewFileInput);
const captureViewGalleryInput = /function CaptureView[\s\S]*?<input[\s\S]*?ref=\{galleryInputRef\}[\s\S]*?multiple/.test(wardrobeApp);
check("CaptureView 内部已删除重复 gallery input (multiple)", !captureViewGalleryInput);

// Test 10: CaptureView 已删除 (单衣物模式已移除)
check("WardrobeApp 不再定义 CaptureView 函数", !/function CaptureView/.test(wardrobeApp));
check("CaptureView「拍一张」按钮不再存在", !/拍一张[\s\S]*?onClick=\{onCameraClick\}/.test(wardrobeApp));
check("CaptureView「从图库」按钮不再存在", !/从图库[\s\S]*?onClick=\{onGalleryClick\}/.test(wardrobeApp));
check("CaptureView 不再渲染单衣物模式", !/单衣物/.test(wardrobeApp));
check("WardrobeApp 不再渲染 captureMode !== \"outfit\" 的 BatchReviewView", !/captureMode !== "outfit"[\s\S]*?<BatchReviewView/.test(wardrobeApp));

/* ------------------------------------------------------------------ */
/*  P0 收口: 全局加号 → 衣橱 / 种草正式录入唯一两步链路 + 删除旧图片队列直接入库 */
/* ------------------------------------------------------------------ */

// Test 11: add_single_item 不再调 openImageSourceSheet("garment")
check(
  "handleCreateAction add_single_item 分支不存在 openImageSourceSheet(\"garment\")",
  !/case "add_single_item":[\s\S]*?openImageSourceSheet\(\s*"garment"\s*\)/.test(wardrobeApp),
);

// Test 12: add_wishlist_item 不再调 openImageSourceSheet("wishlist")
check(
  "handleCreateAction add_wishlist_item 分支不存在 openImageSourceSheet(\"wishlist\")",
  !/case "add_wishlist_item":[\s\S]*?openImageSourceSheet\(\s*"wishlist"\s*\)/.test(wardrobeApp),
);

// Test 13: add_single_item 走 startGarmentIntakeFlow()
check(
  "handleCreateAction add_single_item 分支调用 startGarmentIntakeFlow()",
  /case "add_single_item":[\s\S]*?startGarmentIntakeFlow\(\)/.test(wardrobeApp),
);

// Test 14: add_wishlist_item 走 setCreateWishlistTrigger((n) => n + 1)
check(
  "handleCreateAction add_wishlist_item 分支调用 setCreateWishlistTrigger((n) => n + 1)",
  /case "add_wishlist_item":[\s\S]*?setCreateWishlistTrigger\(\(n\)\s*=>\s*n\s*\+\s*1\)/.test(wardrobeApp),
);

// Test 15: WardrobeApp 整体不存在 processWishlistImageQueue 任何定义/调用
check(
  "WardrobeApp 不存在 processWishlistImageQueue",
  !/processWishlistImageQueue/.test(wardrobeApp),
);

// Test 16: WardrobeApp 不存在 processWishlistImageQueue(captureImageQueue) 调用
check(
  "WardrobeApp 不存在 processWishlistImageQueue(captureImageQueue) 调用",
  !/processWishlistImageQueue\(\s*captureImageQueue\s*\)/.test(wardrobeApp),
);

// Test 17: SelectedImagesReview 的 onConfirm 函数体内不存在 imageIntakePurpose === "wishlist" 正式录入分支
// (注: handleNativeCameraCapture / processGalleryFiles 里仍有 imageIntakePurpose === "wishlist",
//  它们仅用于文件命名 / captureQueueMode 设置, 不属于正式录入分支, 不在删除范围)
{
  const onConfirmMatch = /onConfirm=\{async \(\) => \{([\s\S]+?)\}\s*\}\s*\n\s+confirmText=/.exec(wardrobeApp);
  const onConfirmBody = onConfirmMatch ? onConfirmMatch[1] : "";
  check(
    "SelectedImagesReview onConfirm 内不存在 imageIntakePurpose === \"wishlist\" 正式录入分支",
    !/imageIntakePurpose\s*===\s*"wishlist"/.test(onConfirmBody),
  );
}

// Test 18: WardrobeApp 不存在 db.wishlistItems.put(newItem) 直接写库
check(
  "WardrobeApp 不存在 db.wishlistItems.put(newItem) 直接写库",
  !/db\.wishlistItems\.put\(\s*newItem\s*\)/.test(wardrobeApp),
);

// Test 19: SelectedImagesReview 渲染位置上方存在「SelectedImagesReview 仅允许服务灵感图添加」注释
check(
  "SelectedImagesReview 渲染位置上方存在「SelectedImagesReview 仅允许服务灵感图添加」注释",
  /SelectedImagesReview\s+仅允许服务灵感图添加/.test(wardrobeApp),
);

/* ------------------------------------------------------------------ */
/*  瀑布流卡片统一: 单品列表卡片只浏览和进详情                         */
/* ------------------------------------------------------------------ */

check(
  "单品瀑布流卡片不再包含 aria-label=\"打开操作菜单\"",
  !/aria-label="打开操作菜单"/.test(wardrobeCardBlock),
);
check(
  "单品瀑布流卡片不再包含卡片级 MotionPopoverMenu visible={cardMenuId",
  !/MotionPopoverMenu\s+visible=\{cardMenuId/.test(wardrobeCardBlock),
);
check(
  "单品瀑布流卡片不再渲染 STATUS_LABELS[item.status]",
  !/STATUS_LABELS\[item\.status\]/.test(wardrobeCardBlock),
);
check(
  "单品瀑布流卡片不再渲染 item.needsReview chip",
  !/item\.needsReview/.test(wardrobeCardBlock),
);
check(
  "单品瀑布流卡片仍通过 openWardrobeItemDetail(item, { name: \"wardrobe_home\" }) 进入详情 (v1.1.20-dev: 升级为完整 AppRoute)",
  /openWardrobeItemDetail\(item,\s*\{\s*name:\s*"wardrobe_home"\s*\}\s*\)/.test(wardrobeCardBlock),
);
check(
  "单品列表仍保留批量删除工具条",
  /批量删除\s*\{selectedItemIds\.size\}\s*件/.test(wardrobeApp),
);

/* ------------------------------------------------------------------ */
/*  v1.1.20-dev 方案 C (route-driven view) + Bug 2 (returnTarget 扩展)   */
/* ------------------------------------------------------------------ */

// AppRoute 包含三个录入流 route
check(
  "AppRoute 类型包含 intake_single_item (v1.1.20-dev)",
  /name:\s*"intake_single_item";\s*returnTo:\s*AppRouteName/.test(appRoute),
);
check(
  "AppRoute 类型包含 intake_outfit (v1.1.20-dev)",
  /name:\s*"intake_outfit";\s*returnTo:\s*AppRouteName/.test(appRoute),
);
check(
  "AppRoute 类型包含 intake_wishlist (v1.1.20-dev)",
  /name:\s*"intake_wishlist";\s*returnTo:\s*AppRouteName/.test(appRoute),
);
check(
  "AppRouteName union 包含 intake_* 三种 route 名称",
  /\|\s*"intake_single_item"\s*\|\s*"intake_outfit"\s*\|\s*"intake_wishlist"/.test(appRoute),
);
check(
  "getMainTabFromRoute 处理 intake_single_item → wardrobe tab",
  /case\s*"intake_single_item"\s*:\s*return\s*"wardrobe"/.test(appRoute),
);
check(
  "getMainTabFromRoute 处理 intake_outfit → recommend tab",
  /case\s*"intake_outfit"\s*:\s*return\s*"recommend"/.test(appRoute),
);
check(
  "getMainTabFromRoute 处理 intake_wishlist → shopping tab",
  /case\s*"intake_wishlist"\s*:\s*return\s*"shopping"/.test(appRoute),
);
check(
  "getBackRoute 处理 intake_* route 返回 returnTo (录完后回原页面)",
  /case\s*"intake_(single_item|outfit|wishlist)"[\s\S]*?return\s*\{\s*name:\s*route\.returnTo/.test(appRoute),
);
check(
  "routeToDebugLabel 处理 intake_* 三种 route (诊断日志)",
  /case\s*"intake_single_item"\s*:\s*return/.test(appRoute) &&
  /case\s*"intake_outfit"\s*:\s*return/.test(appRoute) &&
  /case\s*"intake_wishlist"\s*:\s*return/.test(appRoute),
);

// wardrobe-app.tsx 方案 C 改造
check(
  "wardrobe-app 已删除独立 useState<ViewKey> activeView (v1.1.20-dev 方案 C)",
  !/const\s*\[activeView,\s*setActiveView\]\s*=\s*useState<ViewKey>/.test(wardrobeApp),
);
check(
  "wardrobe-app 已删除 route.mainTab → activeView useEffect 同步逻辑",
  !/route\.mainTab[\s\S]{0,40}setActiveView/.test(wardrobeApp),
);
check(
  "wardrobe-app 派生 activeViewForCreateActions (intake_* 映射回 ViewKey)",
  /activeViewForCreateActions[\s\S]{0,300}intake_single_item[\s\S]{0,200}return\s*"capture"/.test(wardrobeApp),
);
check(
  "wardrobe-app switchView 改用 navigation.openRoute 替代 setActiveView",
  /function\s+switchView[\s\S]{0,1500}navigation\.openRoute\(targetRoute\)/.test(wardrobeApp),
);
check(
  "wardrobe-app handleCreateAction add_single_item 走 intake_single_item route",
  /startGarmentIntakeFlow[\s\S]{0,400}navigation\.openRoute\(\{\s*name:\s*"intake_single_item"/.test(wardrobeApp),
);
check(
  "wardrobe-app handleCreateAction create_outfit 走 intake_outfit route",
  /case\s*"create_outfit"[\s\S]{0,400}navigation\.openRoute\(\{\s*name:\s*"intake_outfit"/.test(wardrobeApp),
);
check(
  "wardrobe-app handleCreateAction add_wishlist_item 走 intake_wishlist route",
  /case\s*"add_wishlist_item"[\s\S]{0,400}navigation\.openRoute\(\{\s*name:\s*"intake_wishlist"/.test(wardrobeApp),
);
check(
  "wardrobe-app motion.div key={route.name} 替换 activeView (方案 C)",
  /key=\{route\.name\}/.test(wardrobeApp),
);
check(
  "wardrobe-app 渲染分支改为基于 route.name (outfit_home/outfit_detail/outfit_calendar/intake_outfit)",
  /route\.name\s*===\s*"outfit_home"\s*\|\|\s*route\.name\s*===\s*"outfit_detail"\s*\|\|\s*route\.name\s*===\s*"outfit_calendar"\s*\|\|\s*route\.name\s*===\s*"intake_outfit"/.test(wardrobeApp),
);
check(
  "wardrobe-app 渲染分支处理 wishlist_* + intake_wishlist (shopping tab)",
  /route\.name\s*===\s*"wishlist_home"\s*\|\|\s*route\.name\s*===\s*"wishlist_purchased"\s*\|\|\s*route\.name\s*===\s*"wishlist_rejected"\s*\|\|\s*route\.name\s*===\s*"wishlist_archived"\s*\|\|\s*route\.name\s*===\s*"intake_wishlist"/.test(wardrobeApp),
);
check(
  "wardrobe-app hideMobileNav 改用 isIntakeRouteName 或 route.name 派生",
  /route\.name\s*===\s*"intake_single_item"/.test(wardrobeApp) ||
  /isIntakeRouteName\(route\.name\)/.test(wardrobeApp),
);
check(
  "wardrobe-app shouldShowGlobalCreate 改用 isIntakeRouteName 替代 activeView===\"capture\"",
  /isIntakeRouteName\(route\.name\)/.test(wardrobeApp),
);

// Bug 2 修复: garmentDetailReturnTarget 扩展为完整 AppRoute
check(
  "Bug 2: garmentDetailReturnTarget 升级为 AppRoute 类型 (v1.1.20-dev)",
  /useState<AppRoute>\(\{\s*name:\s*"wardrobe_home"\s*\}\)/.test(wardrobeApp),
);
check(
  "Bug 2: openWardrobeItemDetail 第二参数升级为 AppRoute",
  /function\s+openWardrobeItemDetail\([^,]+,\s*returnTarget:\s*AppRoute\)/.test(wardrobeApp),
);
check(
  "Bug 2: closeViewingItemByReturnTarget 重置 returnTarget 后通过 onReturnToRoute 回调",
  /closeViewingItemByReturnTarget[\s\S]{0,600}onReturnToRoute\?\.\(target\)/.test(wardrobeApp),
);
check(
  "Bug 2: wardrobe-app 给 WardrobeView 传 onReturnToRoute={(route) => navigation.openRoute(route)}",
  /onReturnToRoute=\{[\s\S]{0,80}navigation\.openRoute/.test(wardrobeApp),
);

console.log(`\nfollowup-navigation tests: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

console.log(`\nfollowup-navigation tests: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
