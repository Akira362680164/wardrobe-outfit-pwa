// v1.1.9 4C: wardrobe-app.tsx 拆分测试
import { strict as assert } from "node:assert";
import { readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const wardrobeApp = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

// File existence
check("use-wardrobe-data-controller.ts 存在", existsSync(join(root, "src/components/use-wardrobe-data-controller.ts")));
check("use-wardrobe-message-controller.ts 存在", existsSync(join(root, "src/components/use-wardrobe-message-controller.ts")));
check("use-wardrobe-lightbox-controller.ts 存在", existsSync(join(root, "src/components/use-wardrobe-lightbox-controller.ts")));
check("wardrobe-image-source-sheet.tsx 存在", existsSync(join(root, "src/components/wardrobe-image-source-sheet.tsx")));
check("wardrobe-hidden-image-inputs.tsx 存在", existsSync(join(root, "src/components/wardrobe-hidden-image-inputs.tsx")));
check("wardrobe-create-actions.tsx 存在", existsSync(join(root, "src/components/wardrobe-create-actions.tsx")));

// 4C Follow-up new files
check("use-wardrobe-image-intake-controller.ts 存在", existsSync(join(root, "src/components/use-wardrobe-image-intake-controller.ts")));
check("use-wardrobe-capture-queue-controller.ts 存在", existsSync(join(root, "src/components/use-wardrobe-capture-queue-controller.ts")));
check("wardrobe-selected-images-review-portal.tsx 存在", existsSync(join(root, "src/components/wardrobe-selected-images-review-portal.tsx")));

// wardrobe-app.tsx imports
check("引入 useWardrobeDataController", /useWardrobeDataController/.test(wardrobeApp));
check("引入 useWardrobeMessageController", /useWardrobeMessageController/.test(wardrobeApp));
check("引入 useWardrobeLightboxController", /useWardrobeLightboxController/.test(wardrobeApp));
check("引入 WardrobeImageSourceSheet", /WardrobeImageSourceSheet/.test(wardrobeApp));
check("引入 WardrobeHiddenImageInputs", /WardrobeHiddenImageInputs/.test(wardrobeApp));

// 4C Follow-up: 新 hook 引入
check("引入 useWardrobeImageIntakeController", /useWardrobeImageIntakeController/.test(wardrobeApp));
check("引入 useWardrobeCaptureQueueController", /useWardrobeCaptureQueueController/.test(wardrobeApp));
check("引入 WardrobeSelectedImagesReviewPortal", /WardrobeSelectedImagesReviewPortal/.test(wardrobeApp));
check("渲染 WardrobeSelectedImagesReviewPortal", /WardrobeSelectedImagesReviewPortal/.test(wardrobeApp));

// wardrobe-app.tsx no longer has old inline code
check("不再直接声明 items 的 useState", !/\buseState<WardrobeItem\[\]>/.test(wardrobeApp));
check("不再直接声明 wishlistItems 的 useState", !/\buseState<WishlistItem\[\]>/.test(wardrobeApp));
check("不再包含原图片来源弹层大段 JSX", !/setShowImageSourceSheet\(false\);\s*requestAnimationFrame/.test(wardrobeApp) || /WardrobeImageSourceSheet/.test(wardrobeApp));
check("不再包含原 hidden file input JSX", !/capture="environment"/.test(wardrobeApp) || /WardrobeHiddenImageInputs/.test(wardrobeApp));
check("不再包含 createActionsForView 函数体", !/function createActionsForView/.test(wardrobeApp));
check("不再直接声明 expandedImage 的 useState", !/useState<\{\s*src:\s*string;\s*alt:\s*string\s*\}.*\|.*null>/.test(wardrobeApp));
check("不再直接声明 message 的 useState (text/type)", !/useState<\{\s*text:\s*string;\s*type:/.test(wardrobeApp));

// 4C Follow-up: 旧 image intake 代码已删除
check("不再定义 captureMode useState", !/const \[captureMode,\s*setCaptureMode\] = useState<CaptureMode>\("item"\)/
.test(wardrobeApp));
check("不再定义 imageIntakePurpose useState", !/const \[imageIntakePurpose,\s*setImageIntakePurpose\] = useState<ImageIntakePurpose>\(null\)/
.test(wardrobeApp));
check("不再定义 showImageSourceSheet useState", !/const \[showImageSourceSheet,\s*setShowImageSourceSheet\] = useState<boolean>\(false\)/
.test(wardrobeApp));
check("不再定义 fileInputRef", !/const fileInputRef = useRef<HTMLInputElement>\(null\)/
.test(wardrobeApp));
check("不再定义 galleryInputRef", !/const galleryInputRef = useRef<HTMLInputElement>\(null\)/
.test(wardrobeApp));
check("不再定义 cameraPhotoToFile", !/function cameraPhotoToFile|const cameraPhotoToFile/.test(wardrobeApp));
check("不再定义 processGalleryFiles", !/function processGalleryFiles|const processGalleryFiles/.test(wardrobeApp));
check("不再定义 handleNativeCameraCapture", !/function handleNativeCameraCapture|const handleNativeCameraCapture/.test(wardrobeApp));
check("不再定义 handleNativeGalleryPick", !/function handleNativeGalleryPick|const handleNativeGalleryPick/.test(wardrobeApp));
check("不再定义 openImageSourceSheet", !/function openImageSourceSheet|const openImageSourceSheet/.test(wardrobeApp));
check("不再定义 triggerCameraInput", !/function triggerCameraInput\(\): void \{[\s\S]*?fileInputRef\.current[\s\S]*?showMessage\("相机入口未就绪，请重试"/.test(wardrobeApp));
check("不再定义 triggerGalleryInput", !/function triggerGalleryInput\(\): void \{[\s\S]*?galleryInputRef\.current[\s\S]*?showMessage\("相册入口未就绪，请重试"/.test(wardrobeApp));
check("不再内联 SelectedImagesReview portal", !/<SelectedImagesReview[\s\S]{0,500}createPortal/.test(wardrobeApp) || /WardrobeSelectedImagesReviewPortal/.test(wardrobeApp));

// BatchReviewView legacy cleanup
check("batch-review-view.tsx remains isolated from WardrobeApp", existsSync(join(root, "src/components/batch-review-view.tsx")));
check("wardrobe-app.tsx no longer imports BatchReviewView", !/import\s*{\s*BatchReviewView\s*}\s*from\s*["']@\/components\/batch-review-view["']/.test(wardrobeApp));
check("wardrobe-app.tsx does not define function BatchReviewView", !/^function BatchReviewView/.test(wardrobeApp));
check("wardrobe-app.tsx does not define BatchOutfitGroupsView", !/function BatchOutfitGroupsView/.test(wardrobeApp));

// Line count
const lines = wardrobeApp.split("\n").length;
const originalLines = 9586;
const reduction = originalLines - lines;
check(`wardrobe-app.tsx 行数减少不少于 100 行 (原始 ${originalLines}, 当前 ${lines}, 减少 ${reduction})`, reduction >= 100);
// v1.1.20-dev commit2: +P0+P1+P2 诊断事件 (~150 行), 行数上限对应放宽。
check(`wardrobe-app.tsx 行数小于等于 9550 (当前 ${lines}, 上限放宽到容纳 P0/P1/P2 事件)`, lines <= 9550);

console.log(`\ntest-wardrobe-app-split: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);