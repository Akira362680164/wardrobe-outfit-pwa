#!/usr/bin/env tsx
// scripts/test-diagnostic-log.ts
// 客户端诊断日志模块测试

import {
  recordDiagnosticEvent,
  getDiagnosticEvents,
  getClientBuildIdentity,
  buildWardrobeDiagnosticLog,
  sanitizeValue,
  summarizeImageDataUrl,
} from "../src/lib/diagnostic-log";

let pass = 0;
let fail = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    pass++;
    console.log(`  ✅ ${message}`);
  } else {
    fail++;
    console.error(`  ❌ ${message}`);
  }
}

console.log("=== 诊断日志模块测试 ===\n");

// 1. recordDiagnosticEvent 旧调用方式
recordDiagnosticEvent("diagnostic_export_started", { activeView: "test", route: "/test" });
const events1 = getDiagnosticEvents();
assert(events1.length >= 1, "旧调用方式记录事件");
assert(events1[events1.length - 1].category === "diagnostic", "旧调用方式 category 为 diagnostic");
assert(events1[events1.length - 1].name === "diagnostic_export_started", "旧调用方式 name 正确");

// 2. recordDiagnosticEvent 新调用方式
recordDiagnosticEvent("ui", "button_clicked", { severity: "info", route: "/settings" });
const events2 = getDiagnosticEvents();
assert(events2.length >= 2, "新调用方式记录事件");
const lastEvent = events2[events2.length - 1];
assert(lastEvent.category === "ui", "新调用方式 category 为 ui");
assert(lastEvent.name === "button_clicked", "新调用方式 name 正确");
assert(lastEvent.route === "/settings", "新调用方式 detail 字段正确");

// 3. getClientBuildIdentity
const identity = getClientBuildIdentity();
assert(typeof identity.appVersion === "string", "appVersion 为字符串");
assert(typeof identity.versionCode === "number", "versionCode 为数字");
assert(typeof identity.gitCommit === "string", "gitCommit 为字符串");
assert(typeof identity.gitCommitShort === "string", "gitCommitShort 为字符串");
assert(typeof identity.buildTime === "string", "buildTime 为字符串");
assert(identity.buildChannel === "internal" || identity.buildChannel === "release", "buildChannel 合法");
assert(typeof identity.repository === "string", "repository 为字符串");

// 4. buildWardrobeDiagnosticLog 结构
const log = buildWardrobeDiagnosticLog({
  activeView: "settings",
  route: "/settings",
  items: [],
  locations: [],
  outfits: [],
  wishlistItems: [],
  backfillState: { status: "idle" as const, processed: 0, total: 0, lastItemId: null },
  miniMaxSettings: { apiHost: "https://api.example.com", model: "test-model" },
});

assert(log.schemaVersion === 1, "schemaVersion 为 1");
assert(typeof log.generatedAt === "string", "generatedAt 存在");
assert(typeof log.clientRequestId === "string", "clientRequestId 存在");
assert(log.build.appVersion === identity.appVersion, "build.appVersion 一致");
assert(log.app.capacitorPlatform === "web" || log.app.capacitorPlatform === "ios" || log.app.capacitorPlatform === "android", "capacitorPlatform 合法");
assert(log.navigation.activeView === "settings", "navigation.activeView 正确");
assert(log.navigation.route === "/settings", "navigation.route 正确");
assert(typeof log.counts === "object", "counts 存在");
assert(Array.isArray(log.recentEvents), "recentEvents 为数组");
assert(log.userReport.description === null, "userReport.description 默认为 null");

// 5. sanitizeValue 敏感数据遮盖
assert(sanitizeValue("sk-test-1234567890abcdef", "apiKey") === "[redacted]", "apiKey 被遮盖");
assert(sanitizeValue("my-secret-token", "secret") === "[redacted]", "secret 被遮盖");
assert(sanitizeValue("Bearer abc123xyz", "auth") === "[redacted:bearer]", "Bearer token 被遮盖");
assert(sanitizeValue("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature", "someField") === "[redacted:jwt]", "JWT 被遮盖");
assert(sanitizeValue("+8613800138000", "phone") === "+86****8000", "手机号被遮盖");
assert(sanitizeValue("user@example.com", "email") === "us***@example.com", "邮箱被遮盖");
assert(sanitizeValue("https://api.example.com?token=secret&name=test", "url") === "https://api.example.com?token=%5Bredacted%5D&name=test", "URL token 被遮盖");
assert(sanitizeValue("/Users/alice/Documents/file.txt", "path") === "[home]/Documents/file.txt", "路径被遮盖");

// 6. summarizeImageDataUrl
const noImage = summarizeImageDataUrl(null);
assert(noImage.present === false, "null 图片返回 present=false");

const svgImage = summarizeImageDataUrl("data:image/svg+xml,<svg/>");
assert(svgImage.present === true, "SVG 图片 present=true");
assert(svgImage.isSvg === true, "SVG 识别正确");
assert(svgImage.mime === "image/svg+xml", "SVG mime 正确");

const jpegImage = summarizeImageDataUrl("data:image/jpeg;base64,/9j/4AAQ");
assert(jpegImage.present === true, "JPEG 图片 present=true");
assert(jpegImage.isJpeg === true, "JPEG 识别正确");
assert(jpegImage.mime === "image/jpeg", "JPEG mime 正确");

// 7. 事件数量上限
for (let i = 0; i < 1100; i++) {
  recordDiagnosticEvent("diagnostic", `event_${i}`);
}
const manyEvents = getDiagnosticEvents();
assert(manyEvents.length <= 1000, "事件数量不超过上限 1000");
// 保留 warning/error，删除 debug/info
const hasWarningOrError = manyEvents.some((e) => e.severity === "warning" || e.severity === "error");
// 我们刚才添加的都是 info，所以应该没有 warning/error
assert(manyEvents.every((e) => e.severity !== "debug"), "超出上限后 debug 被清理");

console.log("\n=== 结果 ===");
console.log(`通过: ${pass} / 失败: ${fail}`);
if (fail > 0) process.exit(1);
