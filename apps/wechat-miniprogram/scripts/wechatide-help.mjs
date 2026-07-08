#!/usr/bin/env node

import { getRuntime, parseArgs, printHelp, readProjectConfig, readSkillVersion, runTool } from "./wechatide-common.mjs";

const { opts } = parseArgs();
const runtime = getRuntime(opts);

if (opts.help) {
  printHelp(
    "wechatide-help",
    `
Usage:
  node scripts/wechatide-help.mjs [--tool auto_preview] [--dry-run]

Shows project CLI diagnostics and, when --tool is provided, forwards to:
  wechatide -c <clientName> -t <toolName> --help
`
  );
  process.exit(0);
}

const config = readProjectConfig(runtime.project);

console.log(`wechatide bin: ${runtime.bin}`);
console.log(`clientName: ${runtime.client}`);
console.log(`project: ${runtime.project}`);
console.log(`appid: ${config.ok ? config.appid : `unavailable (${config.reason})`}`);
console.log(`skill version: ${readSkillVersion() || "unknown"}`);

if (opts.tool) {
  process.exit(runTool(String(opts.tool), ["--help"], runtime));
}
