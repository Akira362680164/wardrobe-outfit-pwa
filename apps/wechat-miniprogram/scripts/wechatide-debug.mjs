#!/usr/bin/env node

import { exitWith, getRuntime, parseArgs, printHelp, requireProjectDir, runTool } from "./wechatide-common.mjs";

const { opts } = parseArgs();

if (opts.help) {
  printHelp(
    "wechatide-debug",
    `
Usage:
  node scripts/wechatide-debug.mjs --runtime currentPage [--dry-run]
  node scripts/wechatide-debug.mjs --console "grep -i error" [--dry-run]
  node scripts/wechatide-debug.mjs --network "grep -n ." [--dry-run]

Defaults:
  --console without a value uses "grep -i error".
  --network without a value uses "grep -n .".
  --runtime without a value uses currentPage.
`
  );
  process.exit(0);
}

const runtime = getRuntime(opts);

function grepCommand(value, fallback) {
  const command = value === true ? fallback : String(value || fallback);
  if (!command.trim().startsWith("grep ")) {
    throw new Error(`Only grep commands are accepted for DevTools buffers: ${command}`);
  }
  return command;
}

try {
  requireProjectDir(runtime.project, runtime.dryRun);

  if (opts.console) {
    process.exit(
      runTool("get_app_console_content", ["--project", runtime.project, "--command", grepCommand(opts.console, "grep -i error")], runtime)
    );
  }

  if (opts.network) {
    process.exit(
      runTool("get_app_network_content", ["--project", runtime.project, "--command", grepCommand(opts.network, "grep -n .")], runtime)
    );
  }

  const action = opts.runtime === true ? "currentPage" : String(opts.runtime || "currentPage");
  process.exit(runTool("automation_runtime_info", ["--project", runtime.project, "--action", action], runtime));
} catch (error) {
  exitWith(error);
}
