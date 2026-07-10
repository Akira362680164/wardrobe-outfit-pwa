#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const generatedWebsiteOutput = join(root, ".next-website");
const websiteOutput = join(root, "out-website");

if (existsSync(generatedWebsiteOutput)) rmSync(generatedWebsiteOutput, { recursive: true, force: true });

execFileSync(process.execPath, ["scripts/build-web-with-info.mjs"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, WARDORA_BUILD_TARGET: "website", BUILD_CHANNEL: "website" },
});

if (!existsSync(generatedWebsiteOutput)) {
  throw new Error(`官网构建未生成预期目录: ${generatedWebsiteOutput}`);
}
if (existsSync(websiteOutput)) rmSync(websiteOutput, { recursive: true, force: true });
renameSync(generatedWebsiteOutput, websiteOutput);

console.log("✅ Wardora 官网静态产物:", websiteOutput);
