#!/usr/bin/env node

import { exitWith, getRuntime, parseArgs, printHelp, requireProjectDir, runTool } from "./wechatide-common.mjs";

const { opts } = parseArgs();

if (opts.help) {
  printHelp(
    "wechatide-compile",
    `
Usage:
  node scripts/wechatide-compile.mjs --refresh [--dry-run]
  node scripts/wechatide-compile.mjs --file pages/index/index.ts [--dry-run]
  node scripts/wechatide-compile.mjs --js pages/index/index.ts
  node scripts/wechatide-compile.mjs --wxml pages/index/index.wxml
  node scripts/wechatide-compile.mjs --wxss pages/index/index.wxss

Notes:
  --refresh triggers simulator_refresh. Its success only means refresh was triggered.
  File checks call compile_js, compile_wxml or compile_wxss by extension or explicit flag.
  buildnpm is intentionally not included because it writes generated files.
`
  );
  process.exit(0);
}

const runtime = getRuntime(opts);

try {
  requireProjectDir(runtime.project, runtime.dryRun);

  const filePath = opts.file || opts.js || opts.wxml || opts.wxss;
  if (!filePath || opts.refresh) {
    process.exit(runTool("simulator_refresh", ["--project", runtime.project], runtime));
  }

  const tool =
    opts.wxml || String(filePath).endsWith(".wxml")
      ? "compile_wxml"
      : opts.wxss || String(filePath).endsWith(".wxss")
        ? "compile_wxss"
        : "compile_js";

  process.exit(runTool(tool, ["--project", runtime.project, "--file-path", String(filePath)], runtime));
} catch (error) {
  exitWith(error);
}
