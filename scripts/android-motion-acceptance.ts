#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Phase = "frozen" | "final";
type ApkProvenance = "pre-wave-control" | "final-wave6";
type Status = "passed" | "failed" | "not-run" | "main-agent-final-retest";

interface CliOptions {
  phase: Phase;
  resultsDir: string;
  apkPath?: string;
  apkProvenance: ApkProvenance;
  signingRoot: string;
  serial?: string;
  runSourceMatrix: boolean;
  runDeviceControlPlane: boolean;
}

interface CommandResult {
  status: "passed" | "failed";
  exitCode: number;
  durationMs: number;
  log: string;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_NAME = "com.wardrobe.outfit";
const EXPECTED_SIGNER_CN = "fangzheng";
const VIEWPORT = { width: 390, height: 844, orientation: "portrait" as const };
const options = parseArgs(process.argv.slice(2));

const SOURCE_MATRIX = [
  {
    id: "overlay-back-store",
    requirement: "浮层 Back",
    executable: join(ROOT, "node_modules", ".bin", "tsx"),
    args: [join(ROOT, "scripts", "test-back-priority-regression.ts")],
  },
  {
    id: "overlay-back-contract",
    requirement: "浮层 Back",
    executable: join(ROOT, "node_modules", ".bin", "tsx"),
    args: [join(ROOT, "scripts", "test-ui-overlay-contract.ts")],
  },
  {
    id: "image-reversal-takeover",
    requirement: "图片反向接管 / reduced-motion",
    executable: process.execPath,
    args: [join(ROOT, "scripts", "test-carousel-gestures-browser.mjs")],
  },
  {
    id: "detail-lightbox-takeover",
    requirement: "图片反向接管 / reduced-motion",
    executable: process.execPath,
    args: [join(ROOT, "scripts", "test-detail-continuity-browser.mjs")],
  },
  {
    id: "calendar-diagonal-intent",
    requirement: "日历斜滑",
    executable: join(ROOT, "node_modules", ".bin", "tsx"),
    args: [join(ROOT, "scripts", "test-outfit-calendar.ts")],
  },
  {
    id: "slider-vertical-scroll",
    requirement: "滑条纵向滚动",
    executable: join(ROOT, "node_modules", ".bin", "tsx"),
    args: [join(ROOT, "scripts", "test-intake-gesture-harness.ts")],
  },
  {
    id: "route-interruption",
    requirement: "路由中断 / reduced-motion",
    executable: process.execPath,
    args: [join(ROOT, "scripts", "test-navigation-motion-browser.mjs")],
  },
  {
    id: "outfit-deep-route-interruption",
    requirement: "路由中断 / reduced-motion",
    executable: process.execPath,
    args: [join(ROOT, "scripts", "test-outfit-deep-flow-motion-browser.mjs")],
  },
  {
    id: "settings-deep-route-interruption",
    requirement: "路由中断 / reduced-motion",
    executable: process.execPath,
    args: [join(ROOT, "scripts", "test-settings-account-c3-browser.mjs")],
  },
  {
    id: "wishlist-deep-route-interruption",
    requirement: "路由中断 / busy Back",
    executable: join(ROOT, "node_modules", ".bin", "tsx"),
    args: [join(ROOT, "scripts", "test-wishlist-deep-flow-harness.ts")],
  },
] as const;

function parseArgs(args: string[]): CliOptions {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--help" || token === "-h") {
      printHelp();
      process.exit(0);
    }
    if (!token.startsWith("--")) throw new Error(`未知参数：${token}`);
    const equalIndex = token.indexOf("=");
    if (equalIndex >= 0) {
      values.set(token.slice(2, equalIndex), token.slice(equalIndex + 1));
      continue;
    }
    const key = token.slice(2);
    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      values.set(key, next);
      index += 1;
    } else {
      flags.add(key);
    }
  }

  const phaseValue = values.get("phase") ?? "frozen";
  if (phaseValue !== "frozen" && phaseValue !== "final") {
    throw new Error(`--phase 只支持 frozen 或 final，收到：${phaseValue}`);
  }
  const phase = phaseValue as Phase;
  const provenanceValue = values.get("apk-provenance")
    ?? (phase === "final" ? "final-wave6" : "pre-wave-control");
  if (provenanceValue !== "pre-wave-control" && provenanceValue !== "final-wave6") {
    throw new Error(`--apk-provenance 无效：${provenanceValue}`);
  }
  if (phase === "final" && provenanceValue !== "final-wave6") {
    throw new Error("final 阶段不得把 pre-wave-control APK 标作最终集成产物");
  }

  const stamp = new Date().toISOString().replace(/[-:]/gu, "").replace(/\..+$/u, "");
  return {
    phase,
    resultsDir: resolve(values.get("results-dir") ?? join(ROOT, "test-results", "motion-repair-android", stamp)),
    apkPath: values.has("apk") ? resolve(values.get("apk")!) : undefined,
    apkProvenance: provenanceValue as ApkProvenance,
    signingRoot: resolve(values.get("signing-root") ?? ROOT),
    serial: values.get("serial"),
    runSourceMatrix: !flags.has("skip-source-matrix"),
    runDeviceControlPlane: flags.has("run-device-control-plane"),
  };
}

function printHelp(): void {
  console.log(`Android motion acceptance evidence runner

Usage:
  npx tsx scripts/android-motion-acceptance.ts --phase frozen \\
    --signing-root <official-main-worktree> \\
    --apk <pre-wave-control.apk> --apk-provenance pre-wave-control

  npx tsx scripts/android-motion-acceptance.ts --phase final \\
    --signing-root <integration-worktree> \\
    --apk <wave6.apk> --apk-provenance final-wave6 \\
    --serial emulator-5554 --run-device-control-plane

Safety:
  --run-device-control-plane only accepts an explicit emulator-* serial. It never
  selects or installs to a physical device, and it does not claim that the six
  manual motion rows have passed.
`);
}

function runCapture(executable: string, args: string[], env?: NodeJS.ProcessEnv) {
  return spawnSync(executable, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function ensureExecutable(path: string, label: string): void {
  if (!existsSync(path)) throw new Error(`${label} 不存在：${path}`);
}

function latestBuildTools(androidHome: string): string {
  const root = join(androidHome, "build-tools");
  if (!existsSync(root)) throw new Error(`找不到 Android build-tools：${root}`);
  const versions = readdirSync(root)
    .filter((entry) => statSync(join(root, entry)).isDirectory())
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const latest = versions.at(-1);
  if (!latest) throw new Error("Android build-tools 目录为空");
  return join(root, latest);
}

function parseAdbDeviceCounts(output: string) {
  const entries = output.split(/\r?\n/gu)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/u))
    .filter((parts) => parts.length >= 2);
  return {
    readyEmulators: entries.filter(([serial, state]) => serial.startsWith("emulator-") && state === "device").length,
    readyPhysicalDevices: entries.filter(([serial, state]) => !serial.startsWith("emulator-") && state === "device").length,
    unavailableDevices: entries.filter(([, state]) => state !== "device").length,
  };
}

function verifyApk(apkPath: string, buildTools: string, expectedVersion: string) {
  ensureExecutable(apkPath, "APK");
  const aapt = join(buildTools, "aapt");
  const apksigner = join(buildTools, "apksigner");
  ensureExecutable(aapt, "aapt");
  ensureExecutable(apksigner, "apksigner");

  const badging = runCapture(aapt, ["dump", "badging", apkPath]);
  if (badging.status !== 0) throw new Error(`aapt 读取 APK 失败：${badging.stderr}`);
  const packageLine = badging.stdout.match(/^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'/mu);
  if (!packageLine) throw new Error("无法解析 APK package/version 元数据");
  const [, packageName, versionCode, versionName] = packageLine;

  const signature = runCapture(apksigner, ["verify", "--print-certs", apkPath]);
  if (signature.status !== 0) throw new Error(`apksigner 校验失败：${signature.stderr}`);
  const signerMatches = signature.stdout.includes(`CN=${EXPECTED_SIGNER_CN}`);
  const sha256 = createHash("sha256").update(readFileSync(apkPath)).digest("hex");

  return {
    packageName,
    versionCode,
    versionName,
    versionMatchesPackageJson: versionName === expectedVersion,
    signerMatchesExpectedCn: signerMatches,
    sha256,
    provenance: options.apkProvenance,
    motionCodeAcceptance: options.apkProvenance === "final-wave6" ? "eligible-for-final-retest" : "control-plane-only",
  };
}

function runSourceCase(testCase: (typeof SOURCE_MATRIX)[number]): CommandResult {
  const logsDir = join(options.resultsDir, "logs");
  mkdirSync(logsDir, { recursive: true });
  const logPath = join(logsDir, `${testCase.id}.log`);
  const startedAt = Date.now();
  const result = runCapture(testCase.executable, [...testCase.args]);
  const durationMs = Date.now() - startedAt;
  writeFileSync(logPath, [result.stdout, result.stderr].filter(Boolean).join("\n"));
  const exitCode = result.status ?? 1;
  return {
    status: exitCode === 0 ? "passed" : "failed",
    exitCode,
    durationMs,
    log: relative(options.resultsDir, logPath),
  };
}

function runDeviceControlPlane(apkPath: string, serial: string, adbPath: string): CommandResult {
  if (!serial.startsWith("emulator-")) {
    throw new Error("安全门禁：设备控制面验证只允许显式 emulator-* serial，不安装到物理设备");
  }
  const adb = runCapture(adbPath, ["-s", serial, "get-state"]);
  if (adb.status !== 0 || adb.stdout.trim() !== "device") {
    throw new Error(`模拟器不可用：${serial}`);
  }
  const script = join(ROOT, "scripts", "android-emulator-regression.sh");
  ensureExecutable(script, "Android emulator regression entry");
  const startedAt = Date.now();
  const result = runCapture(script, ["interaction"], {
    APK_PATH: apkPath,
    ANDROID_SERIAL: serial,
    APK_EXPECTED_SIGNER_CN: EXPECTED_SIGNER_CN,
    RESULTS_DIR: join(options.resultsDir, "android-control-plane"),
  });
  const durationMs = Date.now() - startedAt;
  const logPath = join(options.resultsDir, "device-control-plane.log");
  writeFileSync(logPath, [result.stdout, result.stderr].filter(Boolean).join("\n"));
  const exitCode = result.status ?? 1;
  return {
    status: exitCode === 0 ? "passed" : "failed",
    exitCode,
    durationMs,
    log: relative(options.resultsDir, logPath),
  };
}

function markdownTable(rows: Array<Record<string, string>>, columns: string[]): string {
  const header = `| ${columns.join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${columns.map((column) => row[column] ?? "").join(" | ")} |`);
  return [header, divider, ...body].join("\n");
}

async function main(): Promise<void> {
  const ignoredResultsRoot = join(ROOT, "test-results");
  const resultsRelativePath = relative(ignoredResultsRoot, options.resultsDir);
  if (isAbsolute(resultsRelativePath) || resultsRelativePath === ".." || resultsRelativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
    throw new Error("--results-dir 必须位于仓库已忽略的 test-results/ 下，避免把原始设备证据写入 Git");
  }
  mkdirSync(options.resultsDir, { recursive: true });
  const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };
  const git = runCapture("git", ["rev-parse", "HEAD"]);
  if (git.status !== 0) throw new Error("无法读取冻结 Git HEAD");
  const gitHead = git.stdout.trim();

  const androidHome = process.env.ANDROID_HOME;
  if (!androidHome) throw new Error("缺少 ANDROID_HOME；请显式指向 Android SDK");
  const adbPath = join(androidHome, "platform-tools", "adb");
  const emulatorPath = join(androidHome, "emulator", "emulator");
  ensureExecutable(adbPath, "adb");
  ensureExecutable(emulatorPath, "emulator");
  const buildTools = latestBuildTools(androidHome);

  const devices = runCapture(adbPath, ["devices", "-l"]);
  if (devices.status !== 0) throw new Error(`adb devices 失败：${devices.stderr}`);
  const avds = runCapture(emulatorPath, ["-list-avds"]);
  if (avds.status !== 0) throw new Error(`AVD 列表读取失败：${avds.stderr}`);

  const signingJks = join(options.signingRoot, "android", "signing", "wardrobe-fixed.jks");
  const signingProperties = join(options.signingRoot, "android", "signing", "wardrobe-signing.properties");
  const gradle = readFileSync(join(ROOT, "android", "app", "build.gradle"), "utf8");
  const fixedSigning = {
    keyStorePresent: existsSync(signingJks),
    propertiesPresent: existsSync(signingProperties),
    gradleRejectsMissingProperties: gradle.includes("固定 APK 签名配置缺失"),
    debugUsesFixedSigning: /debug\s*\{[^}]*signingConfig signingConfigs\.wardrobeFixed/u.test(gradle),
    releaseUsesFixedSigning: /release\s*\{[^}]*signingConfig signingConfigs\.wardrobeFixed/u.test(gradle),
  };
  const regressionEntryPresent = existsSync(join(ROOT, "scripts", "android-emulator-regression.sh"));
  const missingSigningGates = Object.entries(fixedSigning)
    .filter(([, passed]) => !passed)
    .map(([gate]) => gate);
  if (missingSigningGates.length > 0) {
    throw new Error(`固定签名门禁不完整：${missingSigningGates.join(", ")}`);
  }
  if (!regressionEntryPresent) throw new Error("Android emulator regression 入口缺失");

  const apk = options.apkPath ? verifyApk(options.apkPath, buildTools, packageJson.version) : null;
  if (options.phase === "final" && !apk) throw new Error("final 阶段必须通过 --apk 提供 Wave 6 集成 APK");
  if (apk && (apk.packageName !== PACKAGE_NAME || !apk.versionMatchesPackageJson || !apk.signerMatchesExpectedCn)) {
    throw new Error("APK 包名、版本或固定签名门禁不通过");
  }

  const sourceMatrix = options.runSourceMatrix
    ? SOURCE_MATRIX.map((testCase) => ({
      id: testCase.id,
      requirement: testCase.requirement,
      ...runSourceCase(testCase),
    }))
    : SOURCE_MATRIX.map((testCase) => ({
      id: testCase.id,
      requirement: testCase.requirement,
      status: "not-run" as const,
      exitCode: -1,
      durationMs: 0,
      log: "",
    }));

  let deviceControlPlane: CommandResult | { status: "not-run"; reason: string } = {
    status: "not-run",
    reason: "Use an explicit emulator serial plus --run-device-control-plane.",
  };
  if (options.runDeviceControlPlane) {
    if (!options.apkPath) throw new Error("设备控制面验证必须通过 --apk 提供 APK");
    if (!options.serial) throw new Error("设备控制面验证必须通过 --serial 显式指定 emulator-* 设备");
    deviceControlPlane = runDeviceControlPlane(options.apkPath, options.serial, adbPath);
  }

  const finalDeviceMatrix: Array<{ id: string; status: Status; pass: string }> = [
    { id: "overlay-back", status: "main-agent-final-retest", pass: "一次 Back 只关闭或拒绝顶层浮层，不穿透页面" },
    { id: "image-reversal-takeover", status: "main-agent-final-retest", pass: "拖动/收口中反向接管无跳帧、无旧目标回弹" },
    { id: "calendar-diagonal-swipe", status: "main-agent-final-retest", pass: "纵向占优斜滑滚页且不切月，横向斜滑只切一页" },
    { id: "slider-vertical-scroll", status: "main-agent-final-retest", pass: "从 knob 纵滑滚页，数值与 change 计数不变" },
    { id: "route-interruption", status: "main-agent-final-retest", pass: "快速 push/pop/tab 后仅一个 current page，方向与滚动正确" },
    { id: "reduced-motion", status: "main-agent-final-retest", pass: "WebView media query 为 reduce，大位移与 spring 归零" },
  ];

  const report = {
    schemaVersion: 1,
    phase: options.phase,
    finalAcceptanceClaimed: false,
    gitHead,
    packageVersion: packageJson.version,
    viewport: VIEWPORT,
    preflight: {
      adbAvailable: true,
      emulatorAvailable: true,
      deviceCounts: parseAdbDeviceCounts(devices.stdout),
      avds: avds.stdout.split(/\r?\n/gu).map((entry) => entry.trim()).filter(Boolean),
      fixedSigning,
      regressionEntryPresent,
    },
    apk,
    sourceMatrix,
    deviceControlPlane,
    finalDeviceMatrix,
    privacy: {
      serialsPersistedInCommittedIndex: false,
      rawDeviceArtifactsGitIgnored: true,
      userDataCaptured: false,
      apkCommitted: false,
    },
  };
  writeFileSync(join(options.resultsDir, "summary.json"), `${JSON.stringify(report, null, 2)}\n`);

  const sourceRows = sourceMatrix.map((item) => ({
    Requirement: item.requirement,
    Check: item.id,
    Status: item.status,
    Evidence: item.log || "—",
  }));
  const finalRows = finalDeviceMatrix.map((item) => ({
    Check: item.id,
    Status: item.status,
    Criterion: item.pass,
  }));
  const summary = `# Android Motion Acceptance Run\n\n`
    + `- Phase: ${options.phase}\n`
    + `- Frozen head: ${gitHead}\n`
    + `- Package version: ${packageJson.version}\n`
    + `- Viewport: ${VIEWPORT.width} x ${VIEWPORT.height} ${VIEWPORT.orientation}\n`
    + `- Final acceptance claimed: **no**\n`
    + `- APK provenance: ${apk?.provenance ?? "not provided"}\n\n`
    + `## Frozen-source evidence\n\n${markdownTable(sourceRows, ["Requirement", "Check", "Status", "Evidence"])}\n\n`
    + `## Wave 6 integrated APK device matrix\n\n${markdownTable(finalRows, ["Check", "Status", "Criterion"])}\n\n`
    + `The six device rows remain **主 Agent 最终复测** until they are repeated on the final Wave 6 APK.\n`;
  writeFileSync(join(options.resultsDir, "summary.md"), summary);

  const failed = sourceMatrix.filter((item) => item.status === "failed");
  if (deviceControlPlane.status === "failed") failed.push({
    id: "device-control-plane",
    requirement: "Android control plane",
    status: "failed",
    exitCode: deviceControlPlane.exitCode,
    durationMs: deviceControlPlane.durationMs,
    log: deviceControlPlane.log,
  });
  console.log(`Evidence runner checks: ${failed.length === 0 ? "passed" : "failed"}`);
  console.log(`Results: ${options.resultsDir}`);
  console.log("Final Wave 6 device matrix: 主 Agent 最终复测 (not claimed by this run)");
  if (failed.length > 0) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
