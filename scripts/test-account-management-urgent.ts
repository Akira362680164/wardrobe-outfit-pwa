import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

import { isGlobalCreateAllowedRoute, type AppRouteName } from "../src/lib/app-route";

const account = readFileSync("src/components/auth/account-views.tsx", "utf8");
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
assert.match(account, /退出后本机衣橱数据不会删除/);

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
