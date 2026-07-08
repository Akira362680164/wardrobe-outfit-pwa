#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  exitWith,
  getRuntime,
  parseArgs,
  printHelp,
  readProjectConfig,
  requireProjectDir,
} from "./wechatide-common.mjs";

const { opts } = parseArgs();

if (opts.help) {
  printHelp(
    "wechatide-upload",
    `
Usage:
  node scripts/wechatide-upload.mjs --version 0.1.0 --desc "initial preview" --confirm-upload

This publishes a WeChat experience build with miniprogram_upload.
It refuses to run unless --confirm-upload is present.
`
  );
  process.exit(0);
}

const runtime = getRuntime(opts);

function quoteArg(value) {
  const text = String(value);
  return /^[A-Za-z0-9_./:=@-]+$/.test(text) ? text : JSON.stringify(text);
}

try {
  requireProjectDir(runtime.project, runtime.dryRun);

  if (!opts["confirm-upload"]) {
    throw new Error("Refusing to upload experience build. Re-run with --confirm-upload after user approval.");
  }

  const version = opts["upload-version"] || opts.version;
  if (!version) throw new Error("--version or --upload-version is required");

  const config = readProjectConfig(runtime.project);
  if (!config.ok && !runtime.dryRun) throw new Error(config.reason);
  if (!config.ok) console.log(`precheck warning: ${config.reason}`);

  const toolArgs = [
    "-c",
    runtime.client,
    "-t",
    "miniprogram_upload",
    "--project",
    runtime.project,
    "--upload-version",
    String(version),
  ];
  if (opts.desc) toolArgs.push("--desc", String(opts.desc));

  const rendered = [runtime.bin, ...toolArgs].map(quoteArg).join(" ");
  console.log(`wechatide bin: ${runtime.bin}`);
  console.log(`clientName: ${runtime.client}`);
  console.log("toolName: miniprogram_upload");
  console.log(`project: ${runtime.project}`);
  console.log(`appid: ${config.ok ? config.appid : "unknown"}`);
  console.log(`command: ${rendered}`);

  if (runtime.dryRun) process.exit(0);

  const result = spawnSync(runtime.bin, toolArgs, { shell: false, stdio: "inherit" });
  if (result.error) {
    if (result.error.code === "ENOENT") {
      console.error("wechatide not found. Set WECHATIDE_BIN or add it to PATH.");
      process.exit(127);
    }
    throw result.error;
  }
  process.exit(result.status ?? 0);
} catch (error) {
  exitWith(error);
}
