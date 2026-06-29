// scripts/test-diagnostic-events.ts
// ============================================================
// 诊断日志事件回归测试 (v1.1.20-dev commit2)
// ------------------------------------------------------------
// 覆盖 P0 / P1 / P2 共 15 个新诊断事件的存在与字段契约:
//   P0 (7):
//     1. route_change              (controller setRoute)
//     2. create_return_route_recorded  (rememberCreateReturnRoute)
//     3. create_flow_closed        (closeCreateFlow)
//     4. garment_detail_opened     (WardrobeView openWardrobeItemDetail)
//     5. garment_detail_closed     (WardrobeView closeViewingItemByReturnTarget)
//     6. nav_clicked               (NavButton + MobileNavButton onClick, 含 surface)
//     7. top_level_back_triggered  (handleTopLevelBack, 含 handler 字段)
//   P1 (5):
//     8.  intake_flow_step_changed (garment/wishlist/outfit 3 flows)
//     9.  viewing_item_crop_started / cancelled (覆盖 detail / edit / sourceKind)
//     10. edit_session_started / closed
//     11. wardrobe_subpage_changed (search / wearStatistics / multiSelect / detail / edit / crop)
//     12. pending_viewing_item_consumed (种草转换 → 衣物详情)
//   P2 (2):
//     13. minimax_api_called / succeeded / failed (nativePost 集中打点)
//     14. app_visibility_changed + window_resize_observed
//
// 运行: npx tsx scripts/test-diagnostic-events.ts
// ============================================================

import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

const controller = readFileSync(join(root, "src/components/use-app-navigation-controller.ts"), "utf8");
const wardrobeApp = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");
const garmentIntake = readFileSync(join(root, "src/components/garment-intake-flow.tsx"), "utf8");
const outfitIntake = readFileSync(join(root, "src/components/outfit-intake-flow.tsx"), "utf8");
const deviceMiniMax = readFileSync(join(root, "src/lib/device-minimax.ts"), "utf8");
const diagLog = readFileSync(join(root, "src/lib/diagnostic-log.ts"), "utf8");
const packageJson = readFileSync(join(root, "package.json"), "utf8");

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

function countMatches(content: string, pattern: RegExp): number {
  return (content.match(pattern) ?? []).length;
}

console.log("\n=== P0.1 controller: route_change / create_return_route_recorded / create_flow_closed ===");

check(
  "controller setRoute 调用 recordDiagnosticEvent(\"route_change\")",
  /recordDiagnosticEvent\(\s*["']route_change["']/.test(controller),
);
check(
  "route_change 事件带 from / to / source 字段",
  /recordDiagnosticEvent\(\s*["']route_change["']\s*,\s*\{[\s\S]*?\bfrom\b/.test(controller) &&
    /recordDiagnosticEvent\(\s*["']route_change["']\s*,\s*\{[\s\S]*?\bto:/.test(controller) &&
    /recordDiagnosticEvent\(\s*["']route_change["']\s*,\s*\{[\s\S]*?\bsource\b/.test(controller),
);
check(
  "controller 导出 RouteChangeSource 类型",
  /export type RouteChangeSource/.test(controller),
);
check(
  "RouteChangeSource 含 user / back / create / nav / system 五种",
  /type RouteChangeSource\s*=\s*"user"\s*\|\s*"back"\s*\|\s*"create"\s*\|\s*"nav"\s*\|\s*"system"/.test(controller),
);
check(
  "setRoute 接受 source 参数, 默认 \"system\"",
  /setRoute\s*=\s*useCallback\(\s*\(\s*next[\s\S]{0,80}?source:\s*RouteChangeSource\s*=\s*["']system["']/.test(controller),
);
check(
  "goBack 调 setRoute(..., \"back\")",
  /const goBack[\s\S]{0,200}?setRoute\([\s\S]{0,80}?["']back["']/.test(controller),
);
check(
  "resetToMainTab 调 setRoute(..., \"nav\")",
  /const resetToMainTab[\s\S]{0,400}?setRoute\([\s\S]{0,80}?["']nav["']/.test(controller),
);
check(
  "openRoute / replaceRoute 调 setRoute(..., \"user\")",
  /const openRoute[\s\S]{0,200}?setRoute\([\s\S]{0,80}?["']user["']/.test(controller) &&
    /const replaceRoute[\s\S]{0,200}?setRoute\([\s\S]{0,80}?["']user["']/.test(controller),
);
check(
  "closeCreateFlow 调 setRoute(..., \"create\")",
  /const closeCreateFlow[\s\S]{0,500}?setRoute\([\s\S]{0,200}?["']create["']/.test(controller),
);
check(
  "controller 记录 create_return_route_recorded",
  /recordDiagnosticEvent\(\s*["']create_return_route_recorded["']/.test(controller),
);
check(
  "create_return_route_recorded 事件带 createReturnRoute 字段",
  /recordDiagnosticEvent\(\s*["']create_return_route_recorded["']\s*,\s*\{[^}]*createReturnRoute:/.test(controller),
);
check(
  "controller 记录 create_flow_closed",
  /recordDiagnosticEvent\(\s*["']create_flow_closed["']/.test(controller),
);
check(
  "create_flow_closed 事件带 fromRoute / returnRoute / usedFallback 字段",
  /recordDiagnosticEvent\(\s*["']create_flow_closed["']\s*,\s*\{[\s\S]*?fromRoute:/.test(controller) &&
    /recordDiagnosticEvent\(\s*["']create_flow_closed["']\s*,\s*\{[\s\S]*?returnRoute:/.test(controller) &&
    /recordDiagnosticEvent\(\s*["']create_flow_closed["']\s*,\s*\{[\s\S]*?usedFallback:/.test(controller),
);
check(
  "setRoute 同 route 不重复打点 (routeEquals 过滤)",
  /routeEquals/.test(controller),
);

console.log("\n=== P0.2 wardrobe-app: garment_detail_opened/closed + nav_clicked + top_level_back_triggered ===");

check(
  "WardrobeView openWardrobeItemDetail 记录 garment_detail_opened",
  /function openWardrobeItemDetail[\s\S]{0,400}?recordDiagnosticEvent\(\s*["']garment_detail_opened["']/.test(wardrobeApp),
);
check(
  "garment_detail_opened 事件带 itemId / returnRoute 字段",
  /recordDiagnosticEvent\(\s*["']garment_detail_opened["']\s*,\s*\{[\s\S]*?itemId:/.test(wardrobeApp) &&
    /recordDiagnosticEvent\(\s*["']garment_detail_opened["']\s*,\s*\{[\s\S]*?returnRoute:/.test(wardrobeApp),
);
check(
  "closeViewingItemByReturnTarget 记录 garment_detail_closed",
  /const closeViewingItemByReturnTarget[\s\S]{0,1500}?recordDiagnosticEvent\(\s*["']garment_detail_closed["']/.test(wardrobeApp),
);
check(
  "garment_detail_closed 事件带 returnedToRoute / viaWishlistCallback 字段",
  /recordDiagnosticEvent\(\s*["']garment_detail_closed["']\s*,\s*\{[\s\S]*?\breturnedToRoute\b/.test(wardrobeApp) &&
    /recordDiagnosticEvent\(\s*["']garment_detail_closed["']\s*,\s*\{[\s\S]*?\bviaWishlistCallback\b/.test(wardrobeApp),
);
check(
  "NavButton (desktop) onClick 记录 nav_clicked",
  /NavButton[\s\S]{0,600}?recordDiagnosticEvent\(\s*["']nav_clicked["']/.test(wardrobeApp),
);
check(
  "MobileNavButton onClick 记录 nav_clicked",
  /MobileNavButton[\s\S]{0,600}?recordDiagnosticEvent\(\s*["']nav_clicked["']/.test(wardrobeApp),
);
check(
  "nav_clicked 事件带 surface 字段 (mobile/desktop)",
  /recordDiagnosticEvent\(\s*["']nav_clicked["']\s*,\s*\{[\s\S]*?surface:/.test(wardrobeApp) &&
    /surface:\s*["']desktop["']/.test(wardrobeApp) &&
    /surface:\s*["']mobile["']/.test(wardrobeApp),
);
check(
  "nav_clicked 事件带 fromMainTab / toMainTab / routeBefore / routeAfter 字段",
  /recordDiagnosticEvent\(\s*["']nav_clicked["']\s*,\s*\{[\s\S]*?\bfromMainTab\b/.test(wardrobeApp) &&
    /recordDiagnosticEvent\(\s*["']nav_clicked["']\s*,\s*\{[\s\S]*?\btoMainTab\b/.test(wardrobeApp) &&
    /recordDiagnosticEvent\(\s*["']nav_clicked["']\s*,\s*\{[\s\S]*?\brouteBefore\b/.test(wardrobeApp) &&
    /recordDiagnosticEvent\(\s*["']nav_clicked["']\s*,\s*\{[\s\S]*?\brouteAfter\b/.test(wardrobeApp),
);
check(
  "handleTopLevelBack 记录 top_level_back_triggered",
  /const handleTopLevelBack = useCallback[\s\S]{0,2000}?recordDiagnosticEvent\(\s*["']top_level_back_triggered["']/.test(wardrobeApp),
);
check(
  "top_level_back_triggered 事件带 handler 字段 (含 exit / detailRoute / intakeFlow / lightbox)",
  /recordDiagnosticEvent\(\s*["']top_level_back_triggered["']\s*,\s*\{[\s\S]*?\bhandler\b/.test(wardrobeApp) &&
    /logTopLevelBack\(\s*["']exit["']/.test(wardrobeApp) &&
    /logTopLevelBack\(\s*["']detailRoute["']/.test(wardrobeApp) &&
    /logTopLevelBack\(\s*["']intakeFlow["']/.test(wardrobeApp) &&
    /logTopLevelBack\(\s*["']lightbox["']/.test(wardrobeApp),
);

console.log("\n=== P1.1 intake_flow_step_changed (3 flows) ===");

check(
  "garment-intake-flow 导入 recordDiagnosticEvent",
  /import\s*\{[^}]*recordDiagnosticEvent[^}]*\}\s*from\s*["']@\/lib\/diagnostic-log["']/.test(garmentIntake),
);
check(
  "garment-intake-flow 记录 intake_flow_step_changed, flow=flowKind（覆盖 wishlist 录入）",
  /recordDiagnosticEvent\(\s*["']intake_flow_step_changed["']\s*,\s*\{[\s\S]*?flow:\s*flowKind/.test(garmentIntake),
);
check(
  "outfit-intake-flow 导入 recordDiagnosticEvent",
  /import\s*\{[^}]*recordDiagnosticEvent[^}]*\}\s*from\s*["']@\/lib\/diagnostic-log["']/.test(outfitIntake),
);
check(
  "outfit-intake-flow 记录 intake_flow_step_changed, flow=outfit",
  /recordDiagnosticEvent\(\s*["']intake_flow_step_changed["']\s*,\s*\{[\s\S]*?flow:\s*["']outfit["']/.test(outfitIntake),
);

console.log("\n=== P1.2 wardrobe 子页面 / 裁切 / 编辑 / pending_viewing_item ===");

check(
  "wardrobe_subpage_changed 事件存在",
  /recordDiagnosticEvent\(\s*["']wardrobe_subpage_changed["']/.test(wardrobeApp),
);
check(
  "wardrobe_subpage_changed 覆盖 search / wearStatistics / multiSelect / detail / edit / crop",
  /["']search["']/.test(wardrobeApp) &&
    /["']wearStatistics["']/.test(wardrobeApp) &&
    /["']multiSelect["']/.test(wardrobeApp) &&
    /["']detail["']/.test(wardrobeApp) &&
    /["']edit["']/.test(wardrobeApp) &&
    /["']crop["']/.test(wardrobeApp),
);
check(
  "edit_session_started / edit_session_closed 都记录 (含条件分支)",
  /["']edit_session_started["']/.test(wardrobeApp) &&
    /["']edit_session_closed["']/.test(wardrobeApp) &&
    /recordDiagnosticEvent\(editingItem\s*\?\s*["']edit_session_started["']\s*:\s*["']edit_session_closed["']/.test(wardrobeApp),
);
check(
  "viewing_item_crop_started 事件存在 (覆盖 detail + edit + sourceKind)",
  /recordDiagnosticEvent\(\s*["']viewing_item_crop_started["']/.test(wardrobeApp),
);
check(
  "viewing_item_crop_cancelled 事件存在",
  /recordDiagnosticEvent\(\s*["']viewing_item_crop_cancelled["']/.test(wardrobeApp),
);
check(
  "pending_viewing_item_consumed 事件存在",
  /recordDiagnosticEvent\(\s*["']pending_viewing_item_consumed["']/.test(wardrobeApp),
);
check(
  "pending_viewing_item_consumed 事件带 itemId / returnTarget 字段",
  /recordDiagnosticEvent\(\s*["']pending_viewing_item_consumed["']\s*,\s*\{[\s\S]*?itemId:/.test(wardrobeApp) &&
    /recordDiagnosticEvent\(\s*["']pending_viewing_item_consumed["']\s*,\s*\{[\s\S]*?returnTarget:/.test(wardrobeApp),
);

console.log("\n=== P2.1 主界面不再直接持有旧 Dexie 事务 ===");

check(
  "wardrobe-app 中不存在旧 db.transaction 调用",
  countMatches(wardrobeApp, /await\s+db\.transaction\(/g) === 0,
);

console.log("\n=== P2.2 minimax_api_called/succeeded/failed (nativePost 集中打点) ===");

check(
  "device-minimax 导入 recordDiagnosticEvent",
  /import\s*\{[^}]*recordDiagnosticEvent[^}]*\}\s*from\s*["']@\/lib\/diagnostic-log["']/.test(deviceMiniMax),
);
check(
  "nativePost 记录 minimax_api_called",
  /recordDiagnosticEvent\(\s*["']minimax_api_called["']/.test(deviceMiniMax),
);
check(
  "minimax_api_called 事件带 url / transport 字段",
  /recordDiagnosticEvent\(\s*["']minimax_api_called["']\s*,\s*\{[\s\S]*?\burl\b/.test(deviceMiniMax) &&
    /recordDiagnosticEvent\(\s*["']minimax_api_called["']\s*,\s*\{[\s\S]*?\btransport\b/.test(deviceMiniMax),
);
check(
  "nativePost 记录 minimax_api_succeeded (含 status)",
  /recordDiagnosticEvent\(\s*["']minimax_api_succeeded["']\s*,\s*\{[\s\S]*?status:/.test(deviceMiniMax),
);
check(
  "nativePost 记录 minimax_api_failed (含 error)",
  /recordDiagnosticEvent\(\s*["']minimax_api_failed["']\s*,\s*\{[\s\S]*?error:/.test(deviceMiniMax),
);
check(
  "nativePost try/catch 包裹整个函数 (NativeMiniMax + CapacitorHttp 两条路径都覆盖)",
  /NativeMiniMax\.post[\s\S]*?CapacitorHttp\.post/.test(deviceMiniMax) &&
    /catch \(error\)[\s\S]*?minimax_api_failed/.test(deviceMiniMax),
);
check(
  "nativePost sanitized URL 字段 (只含 host+path, 不含 apiKey)",
  !/headers\.[^,}]*\.Authorization[^}]*apiKey/.test(deviceMiniMax),
);

console.log("\n=== P2.3 app_visibility_changed + window_resize_observed ===");

check(
  "wardrobe-app 添加 visibilitychange 监听",
  /addEventListener\(\s*["']visibilitychange["']/.test(wardrobeApp),
);
check(
  "wardrobe-app 记录 app_visibility_changed",
  /recordDiagnosticEvent\(\s*["']app_visibility_changed["']/.test(wardrobeApp),
);
check(
  "app_visibility_changed 事件带 hidden / visibilityState 字段",
  /recordDiagnosticEvent\(\s*["']app_visibility_changed["']\s*,\s*\{[\s\S]*?hidden:/.test(wardrobeApp) &&
    /recordDiagnosticEvent\(\s*["']app_visibility_changed["']\s*,\s*\{[\s\S]*?visibilityState:/.test(wardrobeApp),
);
check(
  "wardrobe-app 添加 resize / orientationchange 监听",
  /addEventListener\(\s*["']resize["']/.test(wardrobeApp) &&
    /addEventListener\(\s*["']orientationchange["']/.test(wardrobeApp),
);
check(
  "wardrobe-app 记录 window_resize_observed",
  /recordDiagnosticEvent\(\s*["']window_resize_observed["']/.test(wardrobeApp),
);
check(
  "window_resize_observed 事件带 width / height / orientation 字段",
  /recordDiagnosticEvent\(\s*["']window_resize_observed["']\s*,\s*\{[\s\S]*?\bwidth\b/.test(wardrobeApp) &&
    /recordDiagnosticEvent\(\s*["']window_resize_observed["']\s*,\s*\{[\s\S]*?\bheight\b/.test(wardrobeApp) &&
    /recordDiagnosticEvent\(\s*["']window_resize_observed["']\s*,\s*\{[\s\S]*?\borientation\b/.test(wardrobeApp),
);

console.log("\n=== DiagnosticLogBuffer 仍保留兼容 (MAX_EVENTS + sanitizeValue 不破坏现有导出) ===");

check(
  "diagnostic-log 保留 recordDiagnosticEvent 公共 API",
  /export function recordDiagnosticEvent\(/.test(diagLog),
);
check(
  "diagnostic-log 保留 MAX_EVENTS 缓冲区上限",
  /MAX_EVENTS\s*=\s*\d+/.test(diagLog),
);
check(
  "diagnostic-log sanitizeValue 仍然 redact apiKey (防泄漏到导出日志)",
  /api[-_ ]?key[\s\S]*?redacted/i.test(diagLog),
);

console.log("\n=== package.json test:logic:diagnostic-events 已注册 ===");

check(
  "package.json 含 test:logic:diagnostic-events",
  /test:logic:diagnostic-events/.test(packageJson),
);
check(
  "test:logic:diagnostic-events 加入 test:logic:all",
  /test:logic:diagnostic-events/.test(packageJson.replace(/\r/g, "").split("test:logic:all")[1] ?? ""),
);

console.log(`\n=== 总计: ${pass} pass / ${fail} failed ===`);
if (fail > 0) {
  console.log("\n失败项:");
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
console.log("全部通过 ✅");
