// v1.1.31 commit1 — 单品与种草录入全屏布局测试
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const intakeShell = readFileSync(join(root, "src/components/intake-flow-shell.tsx"), "utf8");
const garmentIntake = readFileSync(join(root, "src/components/garment-intake-flow.tsx"), "utf8");
const wishlist = readFileSync(join(root, "src/components/wishlist-view-2.0.tsx"), "utf8");
const wardrobe = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

check("IntakeFlowShell 引入 createPortal", /import\s*\{[^}]*createPortal[^}]*\}\s*from\s*"react-dom"/.test(intakeShell));
check("IntakeFlowShell Portal 目标为 document.body", /createPortal\([\s\S]*?document\.body/.test(intakeShell));
check("IntakeFlowShell 根节点含 fixed inset-0", /<div className="fixed inset-0/.test(intakeShell));
check("IntakeFlowShell 根节点含 h-[100dvh]", /fixed inset-0 z-\[90\][^"]*h-\[100dvh\]/.test(intakeShell));
check("IntakeFlowShell 根节点锁住自身 overflow", /fixed inset-0 z-\[90\][^"]*overflow-hidden/.test(intakeShell));
check("IntakeFlowShell z-index 高于底部导航 (z-40 nav, z-90 shell)", /z-\[90\]/.test(intakeShell));
check("IntakeFlowShell main 区统一 max-w-md", /<main className="mx-auto [^"]*w-full max-w-md/.test(intakeShell));
check("IntakeFlowShell main 区接管纵向滚动", /<main className="[^"]*flex-1 overflow-y-auto/.test(intakeShell));
check("IntakeFlowShell main 区只保留一层 px-4", /<main className="[^"]* px-4 /.test(intakeShell));
check("IntakeFlowShell 锁定 body overflow = hidden", /document\.body\.style\.overflow\s*=\s*"hidden"/.test(intakeShell));
check("IntakeFlowShell unmount 恢复 body overflow", /document\.body\.style\.overflow\s*=\s*previous/.test(intakeShell));
check("IntakeFlowShell 卸载时 handle.remove() 清理", /handle\?\.remove\(\)/.test(intakeShell));
check("IntakeFlowShell 返回键监听 active 守卫", /if \(!active \|\| removed\)/.test(intakeShell));
check("IntakeFlowShell 支持根步骤优先返回而非退出", /rootBackOverridesExit/.test(intakeShell) && /\(safeIndex > 0 \|\| rootBackOverridesExit\)/.test(intakeShell));
check("IntakeFlowShell main 区预留 safe-area + 104px footer", /pb-\[calc\(env\(safe-area-inset-bottom\)\+104px\)\]/.test(intakeShell));
check("IntakeFlowShell 不存在录入页二次外层 padding", !/min-h-\[100dvh\][^"]*pb-\[calc/.test(intakeShell));
check("GarmentIntakeFlow locations 必传", /locations:\s*ClosetLocation\[\]/.test(garmentIntake));
check("GarmentIntakeFlow 衣橱位置下拉使用 locations", /options=\{\(locations \?\? \[\]\)\.map\(\(loc\)/.test(garmentIntake));
check("wardrobe-app GarmentIntakeFlow 传 locations", /<GarmentIntakeFlow[\s\S]*?locations=\{locations\}/.test(wardrobe));
check("wishview GarmentIntakeFlow 传 locations", /<GarmentIntakeFlow[\s\S]*?locations=\{locations\}/.test(wishlist));
check("intake shell 不再依赖 min-h-[100dvh] 外层", !/<div className="min-h-\[100dvh\]/.test(intakeShell));
check("IntakeStepOneImagePicker 有预览时不渲染大号拍照/图库卡片", /\{!previewNode \? \([\s\S]*grid grid-cols-2 gap-4[\s\S]*min-h-\[144px\][\s\S]*\) : null\}/.test(garmentIntake));
check("GarmentIntakeFlow 已选图预览高度收敛到一屏", /h-\[min\(34dvh,280px\)\]/.test(garmentIntake));
check("GarmentIntakeFlow 裁切页不再使用嵌套 calc 固定高度", !/height:\s*"calc\(100dvh - 280px\)"/.test(garmentIntake));
check("GarmentIntakeFlow 裁切工具栏使用短标签", /自由/.test(garmentIntake) && /3:4/.test(garmentIntake) && /左转90°/.test(garmentIntake) && /右转90°/.test(garmentIntake) && /重置/.test(garmentIntake));
check("GarmentIntakeFlow 裁切页返回键先关闭裁切", /rootBackOverridesExit=\{isCropping\}/.test(garmentIntake) && /backDisabled=\{stepIndex === "select_photo" && !isCropping\}/.test(garmentIntake));

console.log(`\nintake fullscreen layout tests: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
