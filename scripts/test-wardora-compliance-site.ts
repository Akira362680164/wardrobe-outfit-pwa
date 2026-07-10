import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { siteConfig, siteLinks, siteStatus } from "../src/lib/site-config";
import { getSiteBuildTarget } from "../src/lib/site-build-target";
import { accountDeletionSections, privacySections, termsSections } from "../src/content/legal-content";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

assert.equal(getSiteBuildTarget(), "app", "default build target must remain app");
assert.equal(siteConfig.siteName, "个人内网穿透及衣橱小站");
assert.equal(siteConfig.siteShortName, "衣橱小站");
assert.equal(siteConfig.productName, "衣橱穿搭助手");
assert.equal(siteConfig.domain, "https://zhengfangapps.cloud");
assert.equal(siteStatus.operatorLabel, "方正");
assert.equal(siteStatus.icpLabel, "鲁ICP备2026037404号-1");
assert.equal(siteStatus.icpUrl, "https://beian.miit.gov.cn/");
assert.equal(siteStatus.policeUrl, null, "missing police record must not create an empty link");
assert.match(siteStatus.policeLabel, /办理中/);
assert.ok(siteLinks.every((link) => link.href && link.label));

const publicWebsiteSources = [
  "src/components/site/site-mark.tsx",
  "src/components/site/site-home.tsx",
  "src/components/site/site-footer.tsx",
  "src/components/site/legal-page.tsx",
  "src/app/layout.tsx",
  "src/app/not-found.tsx",
  "src/app/privacy/page.tsx",
  "src/app/terms/page.tsx",
  "src/app/account-deletion/page.tsx",
  "src/app/contact/page.tsx",
  "public/site.webmanifest",
];
for (const path of publicWebsiteSources) {
  assert.doesNotMatch(read(path), /Wardora/i, `${path} must not expose the retired public name`);
}

assert.match(read("src/app/layout.tsx"), /manifest:\s*["']\/site\.webmanifest["']/);
assert.equal(privacySections.length, 15, "privacy policy must contain all 15 required chapters");
assert.equal(termsSections.length, 15, "terms must contain all 15 required chapters");
assert.equal(accountDeletionSections.length, 7, "account deletion guide must contain all 7 required topics");

const legalSource = read("src/content/legal-content.tsx");
assert.doesNotMatch(legalSource, /Wardora/i);
assert.match(legalSource, /siteConfig\.productName/);

const packageJson = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
assert.equal(packageJson.scripts["build:website"], "node scripts/build-website.mjs");
assert.equal(packageJson.scripts["test:logic:website"], "tsx scripts/test-wardora-compliance-site.ts");

assert.match(read("capacitor.config.ts"), /webDir:\s*["']out["']/);
assert.match(read("scripts/build-website.mjs"), /WARDORA_BUILD_TARGET:\s*["']website["']/);

const requiredPaths = [
  "src/app/privacy/page.tsx",
  "src/app/terms/page.tsx",
  "src/app/account-deletion/page.tsx",
  "src/app/contact/page.tsx",
  "src/app/not-found.tsx",
  "src/app/robots.ts",
  "src/app/sitemap.ts",
];

for (const path of requiredPaths) {
  assert.doesNotThrow(() => read(path), `missing public route: ${path}`);
}

for (const path of requiredPaths) {
  const runtimePath = path.replace(/^src\//, "");
  assert.doesNotThrow(() => read(runtimePath), `missing active App Router route: ${runtimePath}`);
}

const allSiteSource = [
  "src/components/site/site-home.tsx",
  "src/content/legal-content.tsx",
  ...requiredPaths,
].map(read).join("\n");

const siteHeader = read("src/components/site/site-header.tsx");
const siteFooter = read("src/components/site/site-footer.tsx");
assert.match(siteHeader, /aria-expanded=/);
assert.match(siteHeader, /aria-controls=/);
assert.match(siteHeader, /aria-current=/);
assert.match(siteHeader, /siteLinks\.map/);
assert.match(siteFooter, /complianceLinks\.map/);

const contactPage = read("src/app/contact/page.tsx");
for (const category of ["账号问题", "数据问题", "隐私问题", "账号注销", "安全问题", "其他反馈"]) {
  assert.match(contactPage, new RegExp(category));
}

for (const phrase of [
  "轻松记录衣物，整理衣橱，规划每日穿搭。",
  "衣物管理",
  "穿搭管理",
  "穿搭计划",
  "购物意向",
  "AI 辅助识别",
  "云端同步",
  "不提供电商交易",
]) {
  assert.match(allSiteSource, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

assert.doesNotMatch(allSiteSource, /设置\s*→\s*账号与安全\s*→\s*注销账号/);
assert.doesNotMatch(allSiteSource, /ICP备案号[：:]\s*[A-Z\u4e00-\u9fa5]+ICP备\d+/);

console.log("Wardora compliance website contracts passed.");
