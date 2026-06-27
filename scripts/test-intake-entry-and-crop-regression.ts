import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const wardrobeApp = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");
const imageCropEditor = readFileSync(join(root, "src/components/image-crop-editor.tsx"), "utf8");
const garmentIntakeFlow = readFileSync(join(root, "src/components/garment-intake-flow.tsx"), "utf8");
const wishlistView = readFileSync(join(root, "src/components/wishlist-view-2.0.tsx"), "utf8");
const cropperMath = readFileSync(join(root, "src/lib/cropper-math.ts"), "utf8");

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

const startMatch = /function startGarmentIntakeFlow\(\) \{([\s\S]*?)\n  \}/.exec(wardrobeApp);
const startBody = startMatch?.[1] ?? "";
check("startGarmentIntakeFlow 存在", Boolean(startMatch));
check("startGarmentIntakeFlow 关闭全局新增 Sheet", /setShowCreateSheet\(false\)/.test(startBody));
check("startGarmentIntakeFlow 清空旧图片队列", /setCaptureImageQueue\(\[\]\)/.test(startBody) && /setCaptureQueueIndex\(0\)/.test(startBody));
check("startGarmentIntakeFlow 关闭旧图片来源 Sheet", /setShowImageSourceSheet\(false\)/.test(startBody));
check("startGarmentIntakeFlow 记录 create 返回来源", /rememberCreateReturnRoute\(\)/.test(startBody));
check("startGarmentIntakeFlow 进入 capture 可见视图 (v1.1.20-dev: setRoute intake_single_item)",
  /navigation\.openRoute\(\{\s*name:\s*"intake_single_item"/.test(startBody));
check("startGarmentIntakeFlow 打开 GarmentIntakeFlow", /setShowGarmentIntakeFlow\(true\)/.test(startBody));

check(
  // v1.1.20-dev 方案 C: route.mainTab → activeView useEffect 已删除 (Bug 1 根因),
  // view 完全由 route 派生,不需要再"不抢回主 tab"的同步 guard。
  "v1.1.20-dev 方案 C: route.mainTab → activeView useEffect 已删除 (不再需要 guard)",
  !/useEffect\(\(\) => \{[\s\S]{0,80}if \(showGarmentIntakeFlow\) return;[\s\S]*?\}, \[navigation\.mainTab, showGarmentIntakeFlow\]\)/.test(wardrobeApp),
);

const addSingleMatch = /case "add_single_item":([\s\S]*?)break;/.exec(wardrobeApp);
const addSingleBody = addSingleMatch?.[1] ?? "";
check("全局加号 add_single_item 调用 startGarmentIntakeFlow", /startGarmentIntakeFlow\(\)/.test(addSingleBody));
check("全局加号 add_single_item 不调用旧图片来源 Sheet", !/openImageSourceSheet\(\s*"garment"\s*\)/.test(addSingleBody));

check("空衣橱入口传入 onStartGarmentIntake", /onStartGarmentIntake=\{startGarmentIntakeFlow\}/.test(wardrobeApp));
check("空衣橱按钮调用 onStartGarmentIntake", /onClick=\{onStartGarmentIntake\}[\s\S]{0,160}录入第一件/.test(wardrobeApp));
check("WardrobeApp 不再定义 CaptureView", !/function CaptureView/.test(wardrobeApp));
check("GarmentIntakeFlow 退出时关闭 showGarmentIntakeFlow", /onExit=\{\(\) => \{[\s\S]{0,120}setShowGarmentIntakeFlow\(false\);[\s\S]{0,80}closeCreateFlow\(\)/.test(wardrobeApp));

check("ImageCropEditor 暴露 onReadyChange prop", /onReadyChange\?: \(ready: boolean\) => void/.test(imageCropEditor));
check("ImageCropEditor ready 要求 cropFrame 宽高有效", /const ready =[\s\S]*cropFrame\.width > 0 && cropFrame\.height > 0/.test(imageCropEditor));
check("ImageCropEditor ready 变化上报父组件", /onReadyChange\?\.\(ready\)/.test(imageCropEditor));
check("ImageCropEditor runConfirm 在 !ready 时直接返回", /if \(!ready\) return/.test(imageCropEditor));
check("ImageCropEditor 图片 onLoad 写入 naturalSize", /onLoad=\{\(e\) => \{[\s\S]{0,160}setNaturalSize/.test(imageCropEditor));
check("ImageCropEditor 初始化默认裁切框", /setCropFrame\(getInitialCropFrameInImage\(imageRect, aspectRatio\)\)/.test(imageCropEditor));
check("自由裁切默认框是图片显示区域 80%x80%", /aspectRatio === "free"[\s\S]{0,120}width = iw \* 0\.8[\s\S]{0,80}height = ih \* 0\.8/.test(cropperMath));

check("GarmentIntakeFlow 裁切 ready 使用 state，而不是直接读 ref 触发 disabled", /const \[cropReady, setCropReady\] = useState\(false\)/.test(garmentIntakeFlow));
check("GarmentIntakeFlow 将 onReadyChange 传给 ImageCropEditor", /onReadyChange=\{setCropReady\}/.test(garmentIntakeFlow));
check("GarmentIntakeFlow 确认图片按钮 disabled 依赖 cropReady", /disabled=\{!cropReady\}/.test(garmentIntakeFlow));
check("GarmentIntakeFlow 裁切空结果回退当前图片", /onCropConfirm\(croppedDataUrl \|\| imageItem\.displayDataUrl, cropBox\)/.test(garmentIntakeFlow));
check("GarmentIntakeFlow 步骤2不再强制保存并下一张", !/handleSaveCurrentAndContinue|保存并下一张/.test(garmentIntakeFlow));
check("GarmentIntakeFlow 允许未裁切直接开始识别", !/请先裁切所有图片/.test(garmentIntakeFlow) && /imageToProcess =[\s\S]{0,120}item\.croppedImageDataUrl \?\? item\.displayDataUrl \?\? item\.originalDataUrl/.test(garmentIntakeFlow));
check("GarmentIntakeFlow 相册/拍照取消直接返回空结果", /catch \(error\) \{[\s\S]{0,80}isImagePickerCancelError\(error\)[\s\S]{0,40}return \[\]/.test(wardrobeApp));
check("GarmentIntakeFlow 相册 fallback 超时会清理 pendingGalleryResolverRef", /const finish = \(files: File\[\] \| null\)[\s\S]+?pendingGalleryResolverRef\.current = null[\s\S]+?timeout = setTimeout\(\(\) => finish\(null\), 30000\)/.test(wardrobeApp));
check("隐藏 gallery input 优先回传当前录入流, 不落到旧图片队列", /if \(pendingGalleryResolverRef\.current\) \{[\s\S]{0,140}pendingGalleryResolverRef\.current\(files\)[\s\S]{0,140}return;[\s\S]{0,120}imageIntake\.handleGallerySelect\(e\.target\.files\)/.test(wardrobeApp));

check("WishlistView20 种草正式录入复用 GarmentIntakeFlow", /<GarmentIntakeFlow[\s\S]+?title="添加种草"[\s\S]+?flowKind="wishlist"/.test(wishlistView));
check("WishlistView20 种草录入传入多图选择回调", /onPickImages=\{onPickIntakeImages\}/.test(wishlistView));
check("WishlistView20 种草录入传入单品识别回调", /onProcessImage=\{onProcessIntakeImage\}/.test(wishlistView));
// wishlist-intake-flow.tsx 已删 dead code（v1.1.22-dev bugfix）：种草价格/链接契约由 garment-intake-flow + flowKind="wishlist" 守护。
// 校验 GarmentIntakeFlow 走种草分支时不暴露单品字段名误用：
check("GarmentIntakeFlow wishlist 分支用「价格」label 而非「商品价格」", /flowKind === "wishlist"\s*\?\s*"价格"/.test(garmentIntakeFlow));
check("GarmentIntakeFlow wishlist 分支用「链接」label 而非「商品链接」", /flowKind === "wishlist"\s*\?\s*"链接"/.test(garmentIntakeFlow));

// v1.1.16-dev commit1 §3.4.4 + §3.4.5 + §3.4.6: 编辑页 AI 与裁切源修复
check("recognizeEditDraftAgain 优先使用 editDraft.imageDataUrl", /async function recognizeEditDraftAgain[\s\S]+?const source = editDraft\.imageDataUrl \|\| editDraft\.sourceImageDataUrl/.test(wardrobeApp));
// recognizeEditDraftAgain 不再修改 cropBox / imageDataUrl（自带保护，无需显式检查 hasUserCropBox）
check("recognizeEditDraftAgain 不修改 cropBox / imageDataUrl",
  (() => {
    const start = wardrobeApp.indexOf("async function recognizeEditDraftAgain");
    const end = wardrobeApp.indexOf("async function saveEditedItem", start);
    if (start < 0 || end < 0) return false;
    const body = wardrobeApp.slice(start, end);
    return body.includes("recognizeSingleItemFromDataUrl") && !body.includes("detectGarmentsOnDevice") && !body.includes("candidate");
  })(),
);
check("WardrobeEditPage 不再接收 onCropFromSource prop", !/onCropFromSource/.test(wardrobeApp));
check("wardrobe-app 传 onCrop (sourceImageDataUrl 优先, sourceKind=original)", /onCrop=\{\(editDraft\.sourceImageDataUrl \|\| editDraft\.imageDataUrl\) \? \(\) => \{[\s\S]+?sourceKind:[\s\S]+?"original"[\s\S]+?setViewingItemCropJob/.test(wardrobeApp));
check("wardrobe-app 不再传 onCropFromSource", !/onCropFromSource=/.test(wardrobeApp));
check("WardrobeEditPage 不再渲染「从原图重新裁切」按钮", !/从原图重新裁切/.test(wardrobeApp));
check("viewingItemCropJob 类型含 sourceKind 字段", /viewingItemCropJob[\s\S]+?sourceKind\?:\s*"current"\s*\|\s*"original"/.test(wardrobeApp));
check("编辑页 onConfirm 使用统一裁切提示", /onMessage\("裁切已更新，请保存衣物", "success"\)/.test(wardrobeApp));

console.log(`\nintake entry and crop regression tests: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
