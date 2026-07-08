#!/usr/bin/env node

import { getRuntime, parseArgs, printHelp, readSkillVersion, runTool } from "./wechatide-common.mjs";

const { opts } = parseArgs();

if (opts.help) {
  printHelp(
    "wechatide-status",
    `
Usage:
  node scripts/wechatide-status.mjs [--dry-run] [--client wardrobe-mini] [--bin wechatide]

Read-only checks:
  1. check_devtools_status with the local skill version.
  2. project_list --scope all unless --no-projects is passed.

Environment:
  WECHATIDE_BIN       Override the wechatide binary.
  WECHATIDE_CLIENT    Override clientName, default wardrobe-mini.
  WECHATIDE_SKILL_DIR Override miniprogram-dev-skill path.
`
  );
  process.exit(0);
}

const runtime = getRuntime(opts);
const skillVersion = readSkillVersion();
const statusArgs = skillVersion ? ["--skill-version", skillVersion] : [];

let code = runTool("check_devtools_status", statusArgs, runtime);
if (code === 0 && opts.projects !== false) {
  code = runTool("project_list", ["--scope", "all"], runtime);
}

process.exit(code);
