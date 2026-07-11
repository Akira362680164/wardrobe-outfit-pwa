import { promises as fs } from "node:fs";
import path from "node:path";
import { pathExists, sha256File, writeJson } from "./lib/fs";
import { commandText, runCommand } from "./lib/process";
import type { BaselineLock, DeviceProfile } from "./types";

async function gitText(root: string, ...args: string[]): Promise<string> {
  return await commandText("git", args, root);
}

async function worktreeDirty(root: string): Promise<boolean> {
  return (await gitText(root, "status", "--porcelain")).length > 0;
}

async function firstAndroidSerial(): Promise<string> {
  if (process.env.ANDROID_SERIAL) return process.env.ANDROID_SERIAL;
  const result = await runCommand("adb", ["devices"], { allowFailure: true });
  const match = result.stdout.split("\n").map((line) => line.trim()).find((line) => /\tdevice$/u.test(line));
  return match?.split(/\s+/u)[0] ?? "";
}

async function adbText(serial: string, ...args: string[]): Promise<string> {
  if (!serial) return "";
  const result = await runCommand("adb", ["-s", serial, ...args], { allowFailure: true });
  return result.code === 0 ? result.stdout.trim() : "";
}

function numericSetting(value: string, fallback: number): number {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function deviceProfile(): Promise<DeviceProfile> {
  const serial = await firstAndroidSerial();
  const size = await adbText(serial, "shell", "wm", "size");
  const sizeMatch = size.match(/(?:Physical size|Override size):\s*(\d+)x(\d+)/u);
  const densityText = await adbText(serial, "shell", "wm", "density");
  const densityMatch = densityText.match(/(?:Physical density|Override density):\s*(\d+)/u);
  return {
    serial,
    model: await adbText(serial, "shell", "getprop", "ro.product.model"),
    androidVersion: await adbText(serial, "shell", "getprop", "ro.build.version.release"),
    sdk: await adbText(serial, "shell", "getprop", "ro.build.version.sdk"),
    screenWidth: Number(sizeMatch?.[1] ?? 0),
    screenHeight: Number(sizeMatch?.[2] ?? 0),
    density: Number(densityMatch?.[1] ?? 0),
    locale: await adbText(serial, "shell", "getprop", "persist.sys.locale") || "zh-CN",
    fontScale: numericSetting(await adbText(serial, "shell", "settings", "get", "system", "font_scale"), 1),
    theme: await adbText(serial, "shell", "cmd", "uimode", "night") || "unknown",
    timezone: await adbText(serial, "shell", "getprop", "persist.sys.timezone"),
    frozenTime: process.env.PARITY_FROZEN_TIME ?? "",
  };
}

async function detectedWechatideVersion(): Promise<string> {
  const result = await runCommand("wechatide", ["--version"], { allowFailure: true });
  const match = `${result.stdout}\n${result.stderr}`.match(/\bv(\d+\.\d+\.\d+)\b/u);
  return match?.[1] ?? "";
}

async function minimaxKeyAvailable(): Promise<boolean> {
  if (Boolean(process.env.MINIMAX_API_KEY)) return true;
  const launchctl = await runCommand("launchctl", ["getenv", "MINIMAX_API_KEY"], { allowFailure: true });
  if (launchctl.stdout.trim().length > 0) return true;
  const keychain = await runCommand("security", ["find-generic-password", "-s", "MINIMAX_API_KEY"], { allowFailure: true });
  return keychain.code === 0;
}

async function lockfileHashes(roots: string[]): Promise<Record<string, string>> {
  const output: Record<string, string> = {};
  for (const root of roots) {
    for (const filename of ["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock"]) {
      const target = path.join(root, filename);
      if (await pathExists(target)) output[`${root}:${filename}`] = await sha256File(target);
    }
  }
  return output;
}

export async function createBaselineLock(options: {
  cwd: string;
  runId: string;
  runKind: BaselineLock["runKind"];
  appRef: string;
  miniRef: string;
  appRoot: string;
  miniRoot: string;
  outputRoot: string;
  previewMiniSha?: string;
}): Promise<{ lock: BaselineLock; outputFile: string }> {
  const [appSha, miniSha, appTreeHash, miniTreeHash] = await Promise.all([
    gitText(options.cwd, "rev-parse", "--verify", `${options.appRef}^{commit}`),
    gitText(options.cwd, "rev-parse", "--verify", `${options.miniRef}^{commit}`),
    gitText(options.cwd, "rev-parse", "--verify", `${options.appRef}^{tree}`),
    gitText(options.cwd, "rev-parse", "--verify", `${options.miniRef}^{tree}`),
  ]);
  const npmVersion = await commandText("npm", ["--version"]);
  const profile = await deviceProfile();
  const backendBaseUrl = process.env.ANDROID_E2E_API_BASE_URL || process.env.TEST_API_URL || "";
  const lock: BaselineLock = {
    schemaVersion: 1,
    runId: options.runId,
    runKind: options.runKind,
    source: "local-branch-head",
    remoteFetched: false,
    createdAt: new Date().toISOString(),
    appRef: options.appRef,
    appSha,
    appTreeHash,
    miniRef: options.miniRef,
    miniSha,
    miniTreeHash,
    rootWorktreeDirty: await worktreeDirty(options.appRoot),
    miniWorktreeDirty: await worktreeDirty(options.miniRoot),
    nodeVersion: process.version,
    packageManagerVersion: npmVersion,
    lockfileHashes: await lockfileHashes([options.appRoot, options.miniRoot]),
    backendBaseUrl,
    backendVersion: process.env.PARITY_BACKEND_VERSION ?? "",
    androidBuildHash: process.env.PARITY_ANDROID_BUILD_HASH ?? "",
    wechatDevToolsVersion: await detectedWechatideVersion(),
    wechatClientVersion: process.env.PARITY_WECHAT_CLIENT_VERSION ?? "",
    previewMiniSha: options.previewMiniSha ?? miniSha,
    testApiConfigured: backendBaseUrl.length > 0,
    fixtureResetConfigured: Boolean(process.env.PARITY_FIXTURE_RESET_URL),
    e2eFaultTokenAvailable: Boolean(process.env.E2E_FAULT_TOKEN),
    minimaxKeyAvailable: await minimaxKeyAvailable(),
    liveAiEnabled: process.env.ALLOW_LIVE_AI_TEST === "true" && process.env.E2E_AI_MODE === "live",
    deviceProfile: profile,
  };
  const outputFile = path.join(options.outputRoot, options.runId, "baseline-lock.json");
  await writeJson(outputFile, lock);
  await writeJson(path.join(options.outputRoot, options.runId, "progress.json"), {
    schemaVersion: 1,
    runId: options.runId,
    updatedAt: new Date().toISOString(),
    completedStages: ["lock"],
    activeStage: "inventory",
    completedCases: [],
  });
  return { lock, outputFile };
}

export async function assertBaselineUnchanged(lock: BaselineLock, cwd: string): Promise<void> {
  const values = await Promise.all([
    gitText(cwd, "rev-parse", "--verify", `${lock.appRef}^{commit}`),
    gitText(cwd, "rev-parse", "--verify", `${lock.miniRef}^{commit}`),
    gitText(cwd, "rev-parse", "--verify", `${lock.appRef}^{tree}`),
    gitText(cwd, "rev-parse", "--verify", `${lock.miniRef}^{tree}`),
  ]);
  const actual = values.join(":");
  const expected = [lock.appSha, lock.miniSha, lock.appTreeHash, lock.miniTreeHash].join(":");
  if (actual !== expected) throw new Error(`BASELINE_CHANGED\nexpected=${expected}\nactual=${actual}`);
}
