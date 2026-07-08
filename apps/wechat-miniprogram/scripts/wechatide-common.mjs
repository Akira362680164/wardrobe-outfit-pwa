#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultProject = path.resolve(scriptDir, "..");
const defaultSkillDir =
  "/Applications/wechatwebdevtools.app/Contents/Resources/app.asar.unpacked/miniprogram-dev-skill";

const blockedTools = [
  /^cloud_db_write_/,
  /^cloud_stor_write$/,
  /^cloud_fn_deploy$/,
  /^miniprogram_upload$/,
  /^project_setting_update$/,
  /^project_remove$/,
  /^quit$/,
];

export function parseArgs(argv = process.argv.slice(2)) {
  const opts = {};
  const positionals = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const withoutPrefix = arg.slice(2);
    if (withoutPrefix.startsWith("no-")) {
      opts[withoutPrefix.slice(3)] = false;
      continue;
    }

    const equalIndex = withoutPrefix.indexOf("=");
    if (equalIndex >= 0) {
      opts[withoutPrefix.slice(0, equalIndex)] = withoutPrefix.slice(equalIndex + 1);
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      opts[withoutPrefix] = next;
      i += 1;
      continue;
    }

    opts[withoutPrefix] = true;
  }

  return { opts, positionals };
}

export function getRuntime(opts = {}) {
  return {
    bin: String(opts.bin || process.env.WECHATIDE_BIN || "wechatide"),
    client: String(opts.client || process.env.WECHATIDE_CLIENT || "wardrobe-mini"),
    project: path.resolve(String(opts.project || process.env.WECHATIDE_PROJECT || defaultProject)),
    dryRun: Boolean(opts["dry-run"]),
  };
}

export function readSkillVersion() {
  const skillDir = process.env.WECHATIDE_SKILL_DIR || defaultSkillDir;
  const skillYaml = path.join(skillDir, "skill.yaml");
  if (!existsSync(skillYaml)) return null;
  const match = readFileSync(skillYaml, "utf8").match(/^version:\s*(.+)\s*$/m);
  return match?.[1]?.trim() || null;
}

export function ensureKnownSafeTool(tool) {
  if (blockedTools.some((pattern) => pattern.test(tool))) {
    throw new Error(`Blocked unsafe wechatide tool: ${tool}`);
  }
}

export function readProjectConfig(project) {
  const file = path.join(project, "project.config.json");
  if (!existsSync(file)) return { ok: false, reason: `missing ${file}` };

  try {
    const config = JSON.parse(readFileSync(file, "utf8"));
    const appid = String(config.appid || "").trim();
    if (!appid || appid === "touristappid" || appid === "请替换为小程序 AppID") {
      return { ok: false, reason: `invalid appid in ${file}` };
    }
    return { ok: true, appid };
  } catch (error) {
    return { ok: false, reason: `invalid JSON in ${file}: ${error.message}` };
  }
}

export function requireProjectDir(project, dryRun) {
  if (!existsSync(project) && !dryRun) {
    throw new Error(`Project path does not exist: ${project}`);
  }
}

export function runTool(tool, toolArgs, runtime) {
  ensureKnownSafeTool(tool);
  const args = ["-c", runtime.client, "-t", tool, ...toolArgs];
  const rendered = [runtime.bin, ...args].map(quoteArg).join(" ");

  console.log(`wechatide bin: ${runtime.bin}`);
  console.log(`clientName: ${runtime.client}`);
  console.log(`toolName: ${tool}`);
  if (runtime.project) console.log(`project: ${runtime.project}`);
  console.log(`command: ${rendered}`);

  if (runtime.dryRun) return 0;

  const result = spawnSync(runtime.bin, args, { shell: false, stdio: "inherit" });
  if (result.error) {
    if (result.error.code === "ENOENT") {
      console.error("wechatide not found. Set WECHATIDE_BIN or add it to PATH.");
      return 127;
    }
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 0;
}

export function exitWith(error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

export function printHelp(title, body) {
  console.log(`${title}\n\n${body.trim()}\n`);
}

function quoteArg(value) {
  const text = String(value);
  return /^[A-Za-z0-9_./:=@-]+$/.test(text) ? text : JSON.stringify(text);
}
