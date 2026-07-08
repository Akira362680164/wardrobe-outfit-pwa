#!/usr/bin/env node

import { exitWith, getRuntime, parseArgs, printHelp, requireProjectDir, runTool } from "./wechatide-common.mjs";

const { opts } = parseArgs();

if (opts.help) {
  printHelp(
    "wechatide-page",
    `
Usage:
  node scripts/wechatide-page.mjs --page pages/home/index [--query "id=1"] [--scene 1001] [--dry-run]

Compiles and opens a page in the DevTools simulator with simulator_open_page.
`
  );
  process.exit(0);
}

const runtime = getRuntime(opts);

try {
  requireProjectDir(runtime.project, runtime.dryRun);
  if (!opts.page) throw new Error("--page is required, for example pages/home/index");

  const args = ["--project", runtime.project, "--page", String(opts.page)];
  if (opts.query) args.push("--query", String(opts.query));
  if (opts.scene) args.push("--scene", String(opts.scene));

  process.exit(runTool("simulator_open_page", args, runtime));
} catch (error) {
  exitWith(error);
}
