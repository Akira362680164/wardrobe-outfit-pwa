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
    "wechatide-preview",
    `
Usage:
  node scripts/wechatide-preview.mjs [--qrcode] [--qr-format window] [--qr-output path] [--info-output path]
  node scripts/wechatide-preview.mjs --auto

Defaults to create_preview_qrcode with qr-format=window.
Use --auto only when you want DevTools to push preview directly to the developer WeChat.
`
  );
  process.exit(0);
}

const runtime = getRuntime(opts);

try {
  requireProjectDir(runtime.project, runtime.dryRun);
  const config = readProjectConfig(runtime.project);
  if (!config.ok && !runtime.dryRun) throw new Error(config.reason);
  if (!config.ok) console.log(`precheck warning: ${config.reason}`);

  if (opts.auto) {
    process.exit(runTool("auto_preview", ["--project", runtime.project], runtime));
  }

  const args = ["--project", runtime.project, "--qr-format", String(opts["qr-format"] || "window")];
  if (opts["qr-output"]) args.push("--qr-output", String(opts["qr-output"]));
  if (opts["info-output"]) args.push("--info-output", String(opts["info-output"]));

  process.exit(runTool("create_preview_qrcode", args, runtime));
} catch (error) {
  exitWith(error);
}
