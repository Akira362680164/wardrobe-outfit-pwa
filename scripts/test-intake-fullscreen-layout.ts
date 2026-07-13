// v1.1.31 commit1 — 单品与种草录入全屏布局测试
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const intakeShell = readFileSync(join(root, "src/components/intake-flow-shell.tsx"), "utf8");
const garmentIntake = readFileSync(join(root, "src/components/garment-intake-flow.tsx"), "utf8");
const wishlist = readFileSync(join(root, "src/components/wishlist-view-2.0.tsx"), "utf8");
const wardrobe = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");
const androidManifest = readFileSync(join(root, "android/app/src/main/AndroidManifest.xml"), "utf8");
const androidRegression = readFileSync(join(root, "scripts/android-emulator-regression.sh"), "utf8");

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

check("IntakeFlowShell 使用统一 OverlayPortal", /import\s*\{[^}]*OverlayPortal[^}]*useOverlayLayer[^}]*\}\s*from\s*"@\/components\/overlay-root"/.test(intakeShell) && /<OverlayPortal>/.test(intakeShell));
check("IntakeFlowShell 不再直连 document.body Portal", !/createPortal|from\s*"react-dom"/.test(intakeShell));
check("IntakeFlowShell 根节点含 fixed inset-0", /className="[^"]*fixed inset-0/.test(intakeShell));
check("IntakeFlowShell 根节点含 h-[100dvh]", /fixed inset-0 z-\[90\][^"]*h-\[100dvh\]/.test(intakeShell));
check("IntakeFlowShell 根节点锁住自身 overflow", /fixed inset-0 z-\[90\][^"]*overflow-hidden/.test(intakeShell));
check("IntakeFlowShell z-index 高于底部导航 (z-40 nav, z-90 shell)", /z-\[90\]/.test(intakeShell));
check("IntakeFlowShell main 区统一 max-w-md", /mx-auto min-h-0 w-full max-w-md flex-1 px-4 pt-3/.test(intakeShell));
check("IntakeFlowShell main 区支持普通滚动和裁切沉浸模式", /immersiveContent\?/.test(intakeShell) && /overflow-y-auto/.test(intakeShell) && /overflow-hidden pb-3/.test(intakeShell));
check("IntakeFlowShell main 区只保留一层 px-4", /mx-auto min-h-0 w-full max-w-md flex-1 px-4 pt-3/.test(intakeShell));
check("IntakeFlowShell 复用计数式滚动锁", /useScrollLock\(true\)/.test(intakeShell));
check("IntakeFlowShell 注册 fullscreen OverlayLayer", /useOverlayLayer\(\{[\s\S]{0,180}kind:\s*"fullscreen"/.test(intakeShell));
check("IntakeFlowShell busy 时不可 dismiss", /dismissible:\s*!busy/.test(intakeShell) && /onDismissBlocked:\s*handleDismissBlocked/.test(intakeShell));
check("IntakeFlowShell 不再注册私有原生返回键", !/App\.addListener\(|from\s*"@capacitor\/app"/.test(intakeShell));
check("IntakeFlowShell 具备 modal、焦点层和下层 inert 契约", /role="dialog"/.test(intakeShell) && /aria-modal="true"/.test(intakeShell) && /data-overlay-layer=\{overlayId\}/.test(intakeShell) && /inert=\{isTopmost \? undefined : true\}/.test(intakeShell));
check("IntakeFlowShell 退出确认复用 ConfirmActionSheet", /<ConfirmActionSheet[\s\S]{0,260}tone="danger"/.test(intakeShell) && !/bg-black\/35 px-4/.test(intakeShell));
check("IntakeFlowShell 支持根步骤优先返回而非退出", /rootBackOverridesExit/.test(intakeShell) && /\(safeIndex > 0 \|\| rootBackOverridesExit\)/.test(intakeShell));
check("IntakeFlowShell 普通模式预留 safe-area + 104px footer", /pb-\[calc\(env\(safe-area-inset-bottom\)\+104px\)\]/.test(intakeShell));
check("IntakeFlowShell 裁切沉浸模式隐藏上一步下一步底栏", /\{!immersiveContent \?/.test(intakeShell) && /<footer/.test(intakeShell));
check("IntakeFlowShell 不存在录入页二次外层 padding", !/min-h-\[100dvh\][^"]*pb-\[calc/.test(intakeShell));
check("GarmentIntakeFlow locations 必传", /locations:\s*ClosetLocation\[\]/.test(garmentIntake));
check("GarmentIntakeFlow 衣橱位置下拉使用 locations", /options=\{\(locations \?\? \[\]\)\.map\(\(loc\)/.test(garmentIntake));
check("wardrobe-app GarmentIntakeFlow 传 locations", /<GarmentIntakeFlow[\s\S]*?locations=\{locations\}/.test(wardrobe));
check("wishview GarmentIntakeFlow 传 locations", /<GarmentIntakeFlow[\s\S]*?locations=\{locations\}/.test(wishlist));
check("intake shell 不再依赖 min-h-[100dvh] 外层", !/<div className="min-h-\[100dvh\]/.test(intakeShell));
check("IntakeStepOneImagePicker 有预览时不渲染大号拍照/图库卡片", /\{!previewNode \? \([\s\S]*grid grid-cols-2 gap-4[\s\S]*min-h-\[144px\][\s\S]*\) : null\}/.test(garmentIntake));
check("IntakeStepOneImagePicker 拍照/图库入口使用新版圆角矩形", /min-h-\[144px\][^"]*ui-control-radius[^"]*bg-white\/82[^"]*shadow-sm/.test(garmentIntake));
check("GarmentIntakeFlow 已选图预览高度收敛到一屏", /h-\[min\(34dvh,280px\)\]/.test(garmentIntake));
check("GarmentIntakeFlow 裁切页不再使用嵌套 calc 固定高度", !/height:\s*"calc\(100dvh - 280px\)"/.test(garmentIntake));
check("GarmentIntakeFlow 裁切工具栏使用短标签", /自由/.test(garmentIntake) && /3:4/.test(garmentIntake) && /左转90°/.test(garmentIntake) && /右转90°/.test(garmentIntake) && /重置/.test(garmentIntake));
check("GarmentIntakeFlow 裁切页启用沉浸内容模式", /immersiveContent=\{isCropping\}/.test(garmentIntake));
check("GarmentIntakeFlow 裁切页底部是取消和应用", /取消/.test(garmentIntake) && /应用/.test(garmentIntake) && !/保存并下一张/.test(garmentIntake));
check("GarmentIntakeFlow 裁切页返回键先关闭裁切", /rootBackOverridesExit=\{isCropping\}/.test(garmentIntake) && /backDisabled=\{stepIndex === "select_photo" && !isCropping\}/.test(garmentIntake));
check("Android MainActivity 固定竖屏", /android:screenOrientation="portrait"/.test(androidManifest));
check("Android 回归脚本不再主动生成横屏截图", !/landscape\.png|user_rotation 1/.test(androidRegression));

console.log(`\nintake fullscreen layout tests: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
