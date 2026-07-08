#!/usr/bin/env node

import {
  exitWith,
  getRuntime,
  parseArgs,
  printHelp,
  readProjectConfig,
  requireProjectDir,
  runTool,
} from "./wechatide-common.mjs";

const { opts } = parseArgs();

if (opts.help) {
  printHelp(
    "wechatide-open",
    `
Usage:
  node scripts/wechatide-open.mjs --list [--dry-run]
  node scripts/wechatide-open.mjs --import-only [--project apps/wechat-miniprogram] [--dry-run]
  node scripts/wechatide-open.mjs [--project apps/wechat-miniprogram] [--dry-run]

Actions:
  --list          List imported projects.
  --import-only   Import project into DevTools list without opening a window.
  default         Open project window after project.config.json appid precheck.

The default clientName is wardrobe-mini. Upload, deploy and cloud write actions are not exposed here.
`
  );
  process.exit(0);
}

const runtime = getRuntime(opts);

try {
  if (opts.list) {
    process.exit(runTool("project_list", ["--scope", "all"], runtime));
  }

  requireProjectDir(runtime.project, runtime.dryRun);

  if (opts["import-only"]) {
    process.exit(runTool("project_import", ["--project", runtime.project], runtime));
  }

  const config = readProjectConfig(runtime.project);
  if (!config.ok && !runtime.dryRun) {
    throw new Error(`${config.reason}. Fill project.config.json before opening the project window.`);
  }
  if (!config.ok) console.log(`precheck warning: ${config.reason}`);

  process.exit(runTool("project_open_window", ["--project", runtime.project], runtime));
} catch (error) {
  exitWith(error);
}
