// v2.0.11-test P1-5 + P1-6: 账号管理页清理 + 全局加号白名单
// 验证账号管理/修改密码/退出登录 等页面：
// - 移除「本机衣橱保留在本地」说明卡
// - 移除「MiniMax Key 属于本机」说明卡
// - 移除同步冲突面板 (SyncConflictsPanel)
// - 移除「退出全部设备」按钮
// - 退出登录改为二次确认
// - 全局加号在 settings_home / account_management / change_password 不显示

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const accountViews = readFileSync(join(root, "src/components/auth/account-views.tsx"), "utf8");
const wardrobeApp = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");
const appRoot = readFileSync(join(root, "src/components/app-root.tsx"), "utf8");
const authProvider = readFileSync(join(root, "src/components/auth/auth-provider.tsx"), "utf8");

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; const msg = detail ? `: ${detail}` : ""; failures.push(name + msg); console.log(`  ❌ ${name}${msg}`); }
}

console.log("\n=== 账号管理页：删除冗余 UI ===");
check("账号管理页不再有「本机衣橱保留在本地」", !/本机衣橱保留在本地/.test(accountViews));
check("账号管理页不再有「MiniMax Key 属于本机」", !/MiniMax Key 属于本机/.test(accountViews));
check("账号管理页不再有「同步冲突」面板", !/SyncConflictsPanel/.test(accountViews) && !/function SyncConflictsPanel/.test(accountViews));
check("账号管理页不再有「退出全部设备」按钮", !/退出全部设备/.test(accountViews));
check("账号管理页不再有「退出当前设备」按钮", !/退出当前设备/.test(accountViews));
check("账号管理页有「退出登录」按钮", /退出登录/.test(accountViews));
check("退出登录有二次确认", /确认退出/.test(accountViews) && /确认退出登录？/.test(accountViews));
check("退出登录提供「取消」二次确认", /setConfirmingLogout\(false\)/.test(accountViews));

console.log("\n=== 全局加号白名单（v2.0.12-test: 白名单函数）===");
const appRoute = readFileSync("src/lib/app-route.ts", "utf8");
check("app-route 导出 isGlobalCreateAllowedRoute", /export function isGlobalCreateAllowedRoute/.test(appRoute));
check("app-route 白名单只含 wardrobe_home", /GLOBAL_CREATE_ALLOWED_ROUTE_NAMES[\s\S]{0,300}"wardrobe_home"/.test(appRoute));
check("app-route 白名单只含 outfit_home", /GLOBAL_CREATE_ALLOWED_ROUTE_NAMES[\s\S]{0,300}"outfit_home"/.test(appRoute));
check("app-route 白名单只含 wishlist_home", /GLOBAL_CREATE_ALLOWED_ROUTE_NAMES[\s\S]{0,300}"wishlist_home"/.test(appRoute));
check("app-route 白名单不包含 settings_home", !/GLOBAL_CREATE_ALLOWED_ROUTE_NAMES[\s\S]{0,400}"settings_home"/.test(appRoute));
check("wardrobe-app shouldShowGlobalCreate 调用 isGlobalCreateAllowedRoute", /shouldShowGlobalCreate[\s\S]{0,250}isGlobalCreateAllowedRoute/.test(wardrobeApp));
check("wardrobe-app 不再含 GLOBAL_CREATE_DENIED_ROUTES 黑名单", !/GLOBAL_CREATE_DENIED_ROUTES/.test(wardrobeApp));
check("账号管理页不再显示 deviceId", !/auth\.deviceId/.test(accountViews));
check("账号管理页不再显示 deviceLabel", !/auth\.deviceLabel/.test(accountViews));
console.log(`\naccount management cleanup tests: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error("failures:\n" + failures.join("\n"));
  process.exit(1);
}
