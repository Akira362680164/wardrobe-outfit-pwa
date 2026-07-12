import assert from "node:assert/strict";
import fs from "node:fs";

const app = JSON.parse(fs.readFileSync("apps/wechat-miniprogram/app.json", "utf8"));
const settings = fs.readFileSync("apps/wechat-miniprogram/pages/settings/index/index.wxml", "utf8");
const about = fs.readFileSync("apps/wechat-miniprogram/pages/settings/about/index.ts", "utf8");
const profile = fs.readFileSync("apps/wechat-miniprogram/pages/settings/profile/index.ts", "utf8");
const photos = fs.readFileSync("apps/wechat-miniprogram/pages/settings/tryon-photos/index.ts", "utf8");
const legal = fs.readFileSync("apps/wechat-miniprogram/generated/legal-copy.ts", "utf8");
const appLegal = fs.readFileSync("src/content/legal-content.tsx", "utf8");

assert.doesNotMatch(settings, /后续接入|业务接入开发|预览仍未开放|后续单独接/);
for (const page of ["pages/settings/profile/index", "pages/settings/tryon-photos/index"]) assert.ok(app.pages.includes(page));
assert.match(about, /APP_BUILD_VERSION/);
for (const field of ["fitGender", "heightCm", "bodyType", "shoulderWidth", "legRatio", "hairDescription", "skinToneDescription", "styleNote"]) assert.match(profile, new RegExp(field));
assert.match(profile, /statusCode\s*===\s*409/);
assert.match(photos, /pages\/intake\/crop\/index/);
assert.match(photos, /uploadPreparedImageAssets/);
assert.match(photos, /kind:\s*"remove"/);
for (const phrase of ["设置 → 账号安全", "数据库与文件", "MiniMax Key"]) {
  assert.ok(legal.includes(phrase));
  assert.ok(appLegal.includes(phrase) || phrase === "数据库与文件");
}
assert.match(legal, /正式业务数据和图片以服务器返回为准/);
assert.match(appLegal, /正式衣橱数据和图片以.*服务器返回为准/);
assert.match(legal, /2026年7月10日/);
console.log("mini settings regression passed");
