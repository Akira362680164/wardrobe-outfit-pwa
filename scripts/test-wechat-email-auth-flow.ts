import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const loginWxml = read("apps/wechat-miniprogram/pages/login/index.wxml");
const loginTs = read("apps/wechat-miniprogram/pages/login/index.ts");
const authService = read("apps/wechat-miniprogram/services/auth.ts");
const registerTs = read("apps/wechat-miniprogram/pages/login/register-email/index.ts");
const registerWxml = read("apps/wechat-miniprogram/pages/login/register-email/index.wxml");
const forgotPasswordTs = read("apps/wechat-miniprogram/pages/login/forgot-password/index.ts");
const accountTs = read("apps/wechat-miniprogram/pages/settings/account/index.ts");
const changePasswordTs = read("apps/wechat-miniprogram/pages/settings/change-password/index.ts");
const changePasswordWxml = read("apps/wechat-miniprogram/pages/settings/change-password/index.wxml");
const appJson = read("apps/wechat-miniprogram/app.json");

assert(loginWxml.includes("微信登录/注册"), "login page must expose WeChat login/register");
assert(loginWxml.includes("邮箱/手机号登录"), "login page must expose email/phone login");
assert(loginWxml.includes("通过邮箱注册"), "login page must expose email registration");
assert(!loginWxml.includes("open-type=\"getPhoneNumber\""), "login page must not use getPhoneNumber");
assert(!loginWxml.includes("bindgetphonenumber"), "login page must not bind getPhoneNumber");
assert(!authService.includes("/api/auth/wechat/phone-login"), "auth service must not call WeChat phone login");
assert(authService.includes("/api/auth/wechat/login"), "auth service must call OpenID login");
assert(loginTs.includes("pages/login/connect-account/index"), "WeChat login must branch to account connection");
assert(loginTs.includes("result.bindingTicket"), "WeChat login must pass the binding ticket to the connection page");
assert(appJson.includes("pages/login/connect-account/index"), "connect-account page must be registered");
assert(appJson.includes("pages/login/register-email/index"), "email register page must be registered");
assert(appJson.includes("pages/settings/change-password/index"), "change-password page must be registered");
assert(registerTs.includes("wx.showModal"), "email register must confirm before sending code");
assert(registerTs.includes("startCountdown(response.cooldownSeconds)"), "email register must use the server cooldown");
assert(forgotPasswordTs.includes("startCountdown(response.cooldownSeconds)"), "password reset must use the server cooldown");
assert(changePasswordTs.includes("startCountdown(response.cooldownSeconds)"), "change password must use the server cooldown");
assert(!registerTs.includes("startCountdown(30)") && !forgotPasswordTs.includes("startCountdown(30)") && !changePasswordTs.includes("startCountdown(30)"), "mini program email countdown must not hard-code 30 seconds");
assert(registerWxml.includes("手机号（选填）"), "email register must label phone as optional");
assert(registerWxml.includes("手机号暂不验证，仅作为手机号+密码登录名使用。"), "email register must explain phone is only a login name");
assert(accountTs.includes("/pages/settings/change-password/index"), "account security page must open change password");
assert(changePasswordTs.includes("requestPasswordChangeCode"), "mini program change-password page must request code from current session");
assert(changePasswordTs.includes("changePasswordWithEmailCode"), "mini program change-password page must save with email code");
assert(changePasswordWxml.includes("当前密码") && changePasswordWxml.includes("邮箱验证码"), "mini program change-password page must expose both modes");

console.log("wechat email auth flow checks passed");
