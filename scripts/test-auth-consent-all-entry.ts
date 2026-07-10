import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const consentError = "请先阅读并同意《用户服务协议》和《隐私政策》";

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function assertGuardBefore(source: string, guard: string, networkCall: string, label: string): void {
  const guardIndex = source.indexOf(guard);
  const networkIndex = source.indexOf(networkCall);
  assert.notEqual(guardIndex, -1, `${label} must guard consent`);
  assert.notEqual(networkIndex, -1, `${label} must keep its network call`);
  assert.ok(guardIndex < networkIndex, `${label} must guard consent before the network call`);
}

function cssBlock(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  assert.ok(match, `${selector} style block must exist`);
  return match[1].replace(/\s+/g, " ").trim();
}

const appGate = read("src/components/auth/auth-gate.tsx");
const appValidation = read("src/lib/auth-form-validation.ts");
const miniLoginTs = read("apps/wechat-miniprogram/pages/login/index.ts");
const miniLoginWxml = read("apps/wechat-miniprogram/pages/login/index.wxml");
const miniLoginWxss = read("apps/wechat-miniprogram/pages/login/index.wxss");
const miniPasswordTs = read("apps/wechat-miniprogram/pages/login/password/index.ts");
const miniPasswordWxml = read("apps/wechat-miniprogram/pages/login/password/index.wxml");
const miniPasswordWxss = read("apps/wechat-miniprogram/pages/login/password/index.wxss");
const miniRegisterTs = read("apps/wechat-miniprogram/pages/login/register-email/index.ts");
const miniRegisterWxml = read("apps/wechat-miniprogram/pages/login/register-email/index.wxml");
const miniRegisterWxss = read("apps/wechat-miniprogram/pages/login/register-email/index.wxss");
const miniAuthStyles = [
  "index.wxss",
  "password/index.wxss",
  "register-email/index.wxss",
  "connect-account/index.wxss",
  "bind-existing/index.wxss",
  "forgot-password/index.wxss",
].map((path) => read(`apps/wechat-miniprogram/pages/login/${path}`)).join("\n");

assert.match(appValidation, /interface LoginFormState[\s\S]*accepted: boolean;/, "App login state must include accepted");
assert.ok(appGate.includes(consentError), "App must use the fixed consent error");
assert.match(appGate, /useState<LoginFormState>\(\{ account: "", password: "", accepted: false \}\)/, "App login consent must default to false");
assert.match(appGate, /id="auth-login-terms-accepted"/, "App login must render a consent checkbox");
assert.match(appGate, /if \(!loginForm\.accepted\)[\s\S]{0,180}setLocalError\(AUTH_CONSENT_ERROR\)/, "App login must block before auth.login");
assert.match(appGate, /const askSendCode = \(\) => \{[\s\S]{0,240}if \(!form\.accepted\)/, "App registration must block email code sending");
assert.match(appGate, /if \(!registerForm\.accepted\)[\s\S]{0,180}setLocalError\(AUTH_CONSENT_ERROR\)/, "App registration must block before auth.register");
assert.match(appGate, /rounded-\[10px\][^"\n]*bg-\[#fef3f2\][^"\n]*p-\[10px\][^"\n]*text-xs[^"\n]*leading-\[18px\][^"\n]*text-\[#b42318\]/, "App and Web auth errors must match the Mini Program consent error style");

for (const [label, ts, wxml] of [
  ["Mini Program WeChat login", miniLoginTs, miniLoginWxml],
  ["Mini Program password login", miniPasswordTs, miniPasswordWxml],
  ["Mini Program email registration", miniRegisterTs, miniRegisterWxml],
] as const) {
  assert.match(ts, /accepted: false/, `${label} consent must default to false`);
  assert.ok(ts.includes(consentError), `${label} must use the fixed consent error`);
  assert.match(ts, /handleAgreementChange/, `${label} must handle explicit checkbox changes`);
  assert.match(wxml, /checkbox-group/, `${label} must render a checkbox group`);
  assert.ok(wxml.includes("《用户服务协议》") && wxml.includes("《隐私政策》"), `${label} must link both legal documents`);
}

assertGuardBefore(miniLoginTs, "if (!this.data.accepted)", "loginWithWechatOpenId()", "Mini Program WeChat login");
assert.match(miniLoginWxss, /\.login-page \{[\s\S]*display: flex;[\s\S]*align-items: center;/, "Mini Program login page must stay vertically centered");
assertGuardBefore(miniPasswordTs, "if (!this.data.accepted)", "loginWithPassword(account, password)", "Mini Program password login");
assertGuardBefore(miniRegisterTs, "if (!this.data.accepted)", "sendEmailCode({", "Mini Program registration code send");
assert.ok(miniRegisterTs.lastIndexOf("if (!this.data.accepted)") < miniRegisterTs.indexOf("registerWithEmail({"), "Mini Program registration submit must guard consent before registration");

const allMiniMarkup = `${miniLoginWxml}\n${miniPasswordWxml}\n${miniRegisterWxml}`;
assert.ok(!allMiniMarkup.includes("继续即代表您已阅读并同意"), "Mini Program must remove automatic continue consent copy");
assert.ok(!allMiniMarkup.includes("登录代表您已阅读并认可"), "Mini Program must remove automatic login consent copy");
assert.ok(!miniAuthStyles.includes("#2f6b4f") && !miniAuthStyles.includes("rgba(47, 107, 79"), "Mini Program auth pages must not retain the legacy green primary color");
assert.equal((allMiniMarkup.match(/color="#355c7d"/g) ?? []).length, 3, "Mini Program auth checkboxes must use the shared blue primary color");
assert.equal(cssBlock(miniLoginWxss, ".login-error"), cssBlock(miniPasswordWxss, ".login-error"), "Mini Program login consent errors must share one visual style");
assert.equal(cssBlock(miniLoginWxss, ".login-error"), cssBlock(miniRegisterWxss, ".auth-error"), "Mini Program registration consent error must match login errors");

console.log("auth consent all-entry checks passed");
