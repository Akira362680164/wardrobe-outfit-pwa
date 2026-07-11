import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const appJson = JSON.parse(read("apps/wechat-miniprogram/app.json")) as { pages: string[] };
const accountWxml = read("apps/wechat-miniprogram/pages/settings/account/index.wxml");
const accountWxss = read("apps/wechat-miniprogram/pages/settings/account/index.wxss");
const pageTs = read("apps/wechat-miniprogram/pages/settings/account-deletion/index.ts");
const pageWxml = read("apps/wechat-miniprogram/pages/settings/account-deletion/index.wxml");
const authService = read("apps/wechat-miniprogram/services/auth.ts");

assert(appJson.pages.includes("pages/settings/account-deletion/index"), "注销页必须注册到 app.json");
assert.match(accountWxml, /class="delete-account-entry"[\s\S]*>\s*<text>注销账号<\/text>/, "账号页必须用文字入口展示注销账号");
assert.match(accountWxss, /\.delete-account-entry[\s\S]*color:\s*#b42318[\s\S]*text-decoration:\s*underline/, "注销入口必须是红色下划线文字");
assert.doesNotMatch(accountWxml, /<button[^>]*>\s*注销账号\s*<\/button>/, "注销入口不能使用可见按钮");

for (const label of ["使用微信身份验证", "使用邮箱验证码验证", "使用当前密码验证"]) {
  assert(pageWxml.includes(label), `身份验证页缺少方式：${label}`);
}
assert.match(pageWxml, /stage === 'notice'/, "第一次确认必须是风险告知");
assert.match(pageWxml, /stage === 'choice'/, "第二次确认必须选择已有身份方式");
assert.match(pageWxml, /stage === 'final'/, "第三次确认必须是永久注销确认");
assert.match(pageWxml, /我确认不再需要此账号及其中的数据/, "最终确认必须显式勾选不可恢复授权");
assert.match(pageWxml, /disabled="\{\{loading \|\| !finalConfirmed\}\}"/, "未勾选时不得提交永久注销");

assert.match(authService, /await getLoginCode\(\)/, "微信注销核验必须实时调用 wx.login 获取 code");
assert.match(authService, /method:\s*"wechat"[\s\S]*appId:\s*WECHAT_MINIPROGRAM_APP_ID/, "微信 code 必须提交当前小程序 AppID");
for (const endpoint of [
  "/api/auth/account-deletion/email/request",
  "/api/auth/account-deletion/verify",
  "/api/auth/account-deletion/confirm",
  "/api/auth/account-deletion/status/",
]) {
  assert(authService.includes(endpoint), `缺少注销接口：${endpoint}`);
}
assert.match(pageTs, /clearMiniMaxSettings\(\);[\s\S]*clearSession\(\);/, "最终确认后必须清除小程序敏感设置和会话");
assert.match(pageTs, /result\.status === "completed" \? "completed" : "processing"/, "客户端不得在服务端完成前误报注销成功");

console.log("mini-program account deletion contract: ok");
