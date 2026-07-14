import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

import { isGlobalCreateAllowedRoute, type AppRouteName } from "../src/lib/app-route";

const account = readFileSync("src/components/auth/account-views.tsx", "utf8");
const authGate = readFileSync("src/components/auth/auth-gate.tsx", "utf8");
const accountDeletion = readFileSync("src/components/auth/account-deletion-view.tsx", "utf8");
const wardrobe = readFileSync("src/components/wardrobe-app.tsx", "utf8");

for (const text of [
  "同步冲突",
  "MiniMax Key 属于本机",
  "退出当前设备",
  "退出全部设备",
  "保留本机",
  "采用云端",
]) {
  assert.equal(account.includes(text), false, `账号页不得显示：${text}`);
}
assert.equal(account.includes("{auth.deviceId}"), false, "账号页不得渲染完整 deviceId");
assert.match(account, /退出登录？/);
assert.match(account, /退出后将清空当前登录会话；重新登录后会从服务器读取衣橱数据/);
assert.match(account, /useStableBackHandler\(/, "账号和改密子页必须登记统一 Back handler");
assert.match(account, /auth\.isBusy \|\| editSaving \|\| editSending/, "账号资料保存期间必须拒绝返回");
assert.match(account, /auth\.isBusy \|\| sendingCode \|\| submitting/, "改密提交期间必须拒绝返回");
assert.ok(!authGate.includes('className="fixed inset-0'), "Auth 不得保留私有 fixed 对话框壳");
assert.ok(!authGate.includes('App.addListener("backButton"'), "Auth 不得保留私有原生 Back listener");
assert.match(authGate, /function ConfirmEmailDialog[\s\S]*?<MotionSheet/, "邮箱确认必须复用 MotionSheet");
assert.match(authGate, /function ExitDialog[\s\S]*?<MotionSheet/, "登录壳退出确认必须复用 MotionSheet");
assert.match(authGate, /function ExitDialog[\s\S]*?panelClassName="!max-w-xs !rounded-\[var\(--ui-radius-card\)\] px-5 py-5"/, "退出应用确认框必须使用一级卡片圆角 token");
assert.match(authGate, /dismissible=\{!busy\}/, "邮箱请求 busy 时必须拒绝协调关闭");
assert.match(accountDeletion, /variant="destructive"[\s\S]{0,220}dismissible=\{!busy\}/, "注销最终确认 busy 时必须保持栈顶");

const settingsStart = wardrobe.indexOf("function SettingsView");
const settingsEnd = wardrobe.indexOf("function clampNumber", settingsStart);
const settingsRuntime = wardrobe.slice(settingsStart, settingsEnd);
assert.ok(!settingsRuntime.includes('className="fixed inset-0'), "设置与诊断不得保留私有 fixed 对话框壳");
assert.ok(!settingsRuntime.includes('App.addListener("backButton"'), "设置与设置子页不得保留私有原生 Back listener");
assert.match(settingsRuntime, /ariaLabel="补充诊断问题描述"/, "诊断描述必须使用可访问命名 Sheet");
assert.match(settingsRuntime, /ariaLabel="诊断数据上传成功"/, "诊断成功必须使用可访问命名 Sheet");
assert.match(settingsRuntime, /ariaLabel="诊断数据上传失败"/, "诊断失败必须使用可访问命名 Sheet");
assert.match(settingsRuntime, /dismissible=\{wardrobeMutation === null\}/, "衣橱写入 busy 时必须拒绝协调关闭");

for (const route of ["wardrobe_home", "outfit_home", "wishlist_home"] as AppRouteName[]) {
  assert.equal(isGlobalCreateAllowedRoute(route), true, `${route} 应显示全局加号`);
}
for (const route of ["settings_home", "account_management", "change_password", "garment_detail", "outfit_detail", "outfit_calendar", "wishlist_purchased", "wishlist_rejected", "wishlist_archived", "intake_single_item", "intake_outfit", "intake_wishlist"] as AppRouteName[]) {
  assert.equal(isGlobalCreateAllowedRoute(route), false, `${route} 应隐藏全局加号`);
}

assert.equal((wardrobe.match(/<ClosetNameField/g) ?? []).length, 2, "添加和编辑衣橱必须复用同一字段组件");
assert.match(wardrobe, /function ClosetNameField/);
assert.match(wardrobe, /aria-required="true"/);
assert.match(wardrobe, /required/);

console.log("account management + create route + closet field: passed");
