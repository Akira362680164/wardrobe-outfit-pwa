#!/usr/bin/env tsx
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const wardrobeApp = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");
const motionCommon = readFileSync(join(root, "src/components/motion-common.tsx"), "utf8");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

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

const handlerMatch = /const handleTopLevelBack = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[/.exec(wardrobeApp);
const handler = handlerMatch?.[1] ?? "";
check("WardrobeApp 定义 handleTopLevelBack", Boolean(handlerMatch));

const expandedIdx = handler.indexOf("if (expandedImage)");
const createIdx = handler.indexOf("if (showCreateSheet)");
const imageSourceIdx = handler.indexOf("if (showImageSourceSheet)");
const cropIdx = handler.indexOf("if (captureCropJob)");
const subPageIdx = handler.indexOf("if (wardrobeSubPageActive || outfitSubPageActive || shoppingSubPageActive)");
const routeIdx = handler.indexOf("if (isDetailRoute(route))");

check("back handler 优先处理 expandedImage", expandedIdx >= 0 && expandedIdx < createIdx);
check("back handler 优先处理 showCreateSheet", createIdx >= 0 && createIdx < imageSourceIdx);
check("back handler 优先处理 showImageSourceSheet", imageSourceIdx >= 0 && imageSourceIdx < cropIdx);
check("back handler 在路由返回前处理顶层浮层", cropIdx >= 0 && cropIdx < routeIdx);
check("back handler 在详情路由返回前让子页先处理", subPageIdx >= 0 && subPageIdx < routeIdx);

check("关闭全局 create sheet 时清理 pendingCreateAction", /if \(showCreateSheet\)[\s\S]*setShowCreateSheet\(false\);[\s\S]*setPendingCreateAction\(null\);/.test(handler));
check("关闭图片来源 sheet 时清理 pendingCreateAction", /if \(showImageSourceSheet\)[\s\S]*setShowImageSourceSheet\(false\);[\s\S]*setPendingCreateAction\(null\);/.test(handler));

check("Android backButton 复用 handleTopLevelBack", /App\.addListener\("backButton"[\s\S]*handleTopLevelBack\(\)/.test(wardrobeApp));
check("浏览器 Escape 复用 handleTopLevelBack", /const handleEscape = \(event: KeyboardEvent\) => \{[\s\S]*handleTopLevelBack\(\);[\s\S]*document\.addEventListener\("keydown", handleEscape, true\)/.test(wardrobeApp));
check("Escape 不处理输入框普通输入", /target\.tagName === "INPUT"[\s\S]*target\.tagName === "TEXTAREA"[\s\S]*target\.isContentEditable/.test(wardrobeApp));
check("全局 create sheet onClose 清理 pendingCreateAction", /<MotionSheet open=\{showCreateSheet\} onClose=\{\(\) => \{[\s\S]*setShowCreateSheet\(false\);[\s\S]*setPendingCreateAction\(null\);/.test(wardrobeApp));

const editBackStart = wardrobeApp.indexOf("if (!editingItem) {");
const editBackEnd = wardrobeApp.indexOf("// v1.1.20-dev (Bug 2 修复): closeViewingItemByReturnTarget", editBackStart);
const editBackBlock = wardrobeApp.slice(editBackStart, editBackEnd);
const detailBackStart = wardrobeApp.indexOf("if (!viewingItem || editingItem || isSearchOpen) {");
const detailBackEnd = wardrobeApp.indexOf("function applySearch", detailBackStart);
const detailBackBlock = wardrobeApp.slice(detailBackStart, detailBackEnd);
check("编辑页 Android back listener 防止异步注册后旧监听残留", /let removed = false[\s\S]*if \(removed\) \{[\s\S]*h\.remove\(\);[\s\S]*removed = true/.test(editBackBlock));
check("详情页 Android back listener 防止异步注册后旧监听残留", /let removed = false[\s\S]*if \(removed\) return;[\s\S]*if \(removed\) \{[\s\S]*h\.remove\(\);[\s\S]*removed = true/.test(detailBackBlock));

check("MotionPopoverMenu 注册 pointerdown 空白关闭", /document\.addEventListener\("pointerdown", handleDocPointerDown, true\)/.test(motionCommon));
check("MotionPopoverMenu 注册 Escape 关闭逻辑", /handleDocKeyDown[\s\S]*e\.key !== "Escape"[\s\S]*onClose\(\)/.test(motionCommon));
check("MotionPopoverMenu 清理 keydown 监听", /document\.removeEventListener\("keydown", handleDocKeyDown, true\)/.test(motionCommon));

check("package.json version uses semver", /^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/.test(String(packageJson.version ?? "")));
check("package.json 包含 test:logic:back-priority-regression", "test:logic:back-priority-regression" in (packageJson.scripts ?? {}));
check("test:logic:all 包含 back-priority-regression", String(packageJson.scripts?.["test:logic:all"] ?? "").includes("test:logic:back-priority-regression"));

console.log(`\nback priority regression tests: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
