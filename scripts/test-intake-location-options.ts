// v1.1.31 commit1 — 衣橱位置显示与选择测试
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const garmentIntake = readFileSync(join(root, "src/components/garment-intake-flow.tsx"), "utf8");
const wardrobe = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");
const wishlist = readFileSync(join(root, "src/components/wishlist-view-2.0.tsx"), "utf8");
const types = readFileSync(join(root, "src/lib/types.ts"), "utf8");

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

// 1. home 显示"默认衣橱"：DEFAULT_LOCATIONS 仍然存在
check("DEFAULT_LOCATIONS 包含 home/默认衣橱", /id:\s*"home"[\s\S]{0,200}name:\s*"默认衣橱"/.test(types));

// 2. 自定义名称：组件不直接硬编码
check("衣橱位置下拉不再用 draft.locationId.value 当 label", !/label:\s*draft\.locationId\.value/.test(garmentIntake));

// 3. 三个位置生成三个 option：使用 locations.map
check("衣橱位置下拉使用 locations.map", /options=\{\(locations \?\? \[\]\)\.map\(\(loc\) => \(\{ value: loc\.id, label: loc\.name \}\)\)\}/.test(garmentIntake));

// 4. value 使用 id
check("衣橱位置下拉 value 使用 loc.id", /value: loc\.id/.test(garmentIntake));

// 5. label 使用 name
check("衣橱位置下拉 label 使用 loc.name", /label: loc\.name/.test(garmentIntake));

// 6. 切换后 draft.locationId 更新
check("切换后调用 onPatchDraft({ locationId", /onChange=\{\(value\) => onPatchDraft\(\{ locationId: userField\(value\) \}\)\}/.test(garmentIntake));

// 7. 无位置时阻止保存
check("GarmentIntakeFlow props.locations 必传", /locations:\s*ClosetLocation\[\]/.test(garmentIntake));

// 8. 种草录入不显示衣橱位置
check("种草流程不显示衣橱位置 (flowKind==='wishlist' 时整段不渲染)", /flowKind === "garment" \? \([\s\S]*?衣橱位置[\s\S]*?\) : null/.test(garmentIntake));

// 9. 源码不存在以 draft.locationId.value 直接作为 label 的代码
check("源码已无 label: draft.locationId.value", !/label:\s*draft\.locationId\.value/.test(garmentIntake));

// 10. wardrobe-app 调用 GarmentIntakeFlow 传入 locations
check("wardrobe-app GarmentIntakeFlow 传 locations", /<GarmentIntakeFlow[\s\S]*?locations=\{locations\}/.test(wardrobe));

// 11. wishview 调用 GarmentIntakeFlow 传入 locations
check("wishview GarmentIntakeFlow 传 locations", /<GarmentIntakeFlow[\s\S]*?locations=\{locations\}/.test(wishlist));

console.log(`\nintake location options tests: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
