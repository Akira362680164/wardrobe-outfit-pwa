import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

import { expect, type Page } from "@playwright/test";
import { chromium, type Browser } from "playwright";

import { aiLiveCases as aiLiveWorkerCases } from "./suites/ai-live";
import { criticalSuite as criticalWorkerCases } from "./suites/critical";
import { fullCases as fullWorkerCases } from "./suites/full";
import { smokeCases as smokeWorkerCases } from "./suites/smoke";
import type { AndroidE2EAccount, AndroidE2EApi, AndroidE2ECase, AndroidE2EContext, AndroidE2EFault, ApiRequestOptions, AuthSession, WorkspaceEntity } from "./suites/types";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const PACKAGE_NAME = "com.wardrobe.outfit";
const MODE = readArg("--suite") ?? "smoke";
const CASE_FILTER = readArg("--case");
const RUN_ID = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
const RESULTS_DIR = resolve(process.env.RESULTS_DIR ?? join(ROOT, "test-results", "android-e2e", RUN_ID));

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});

async function main() {
  loadEnvFile(join(ROOT, ".env.e2e.local"));
  mkdirSync(RESULTS_DIR, { recursive: true });

  const cases = selectedCases();
  const apiBaseUrl = requiredApiBaseUrl();
  const apkPath = findApk();
  const device = new AdbDevice(process.env.ANDROID_SERIAL);
  const artifacts = new Artifacts(RESULTS_DIR, device);
  const apk = new ApkVerifier(apkPath);
  const api = new ApiClient(apiBaseUrl);

  apk.verify();
  await artifacts.writeJson("run-config.json", { suite: MODE, case: CASE_FILTER ?? null, apkPath, apiBaseUrl, resultsDir: RESULTS_DIR });
  device.ensureReady();
  device.install(apkPath);
  device.clearApp();
  device.clearLogcat();
  device.launchApp();
  device.assertAppForeground();
  device.assertNoCrash("logcat-after-launch.txt");

  const cdp = new WebViewCdp(device);
  let browser: Browser | undefined;
  let ctx: (AndroidE2EContext & {
    packageName: string;
    verifyLaunch(): Promise<void>;
    assert(condition: unknown, message?: string): void;
  }) | undefined;

  const attachPage = async () => {
    await browser?.close().catch(() => undefined);
    browser = await cdp.connect();
    const nextPage = await firstPage(browser);
    await nextPage.setViewportSize({ width: 390, height: 844 });
    await nextPage.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => undefined);
    if (ctx) ctx.page = nextPage;
    return nextPage;
  };
  const startAppAndAttach = async () => {
    device.launchApp();
    device.assertAppForeground();
    return attachPage();
  };

  try {
    const page = await attachPage();
    ctx = {
      page,
      api,
      device: {
        restartApp: async () => {
          device.forceStop();
          return startAppAndAttach();
        },
        startApp: async () => startAppAndAttach(),
        clearAppData: async () => device.clearApp(),
        forceStop: async () => device.forceStop(),
        pressBack: async () => device.pressBack(),
        screenshot: async (name: string) => device.screenshot(name),
      },
      artifacts,
      expect,
      freshAccount,
      packageName: PACKAGE_NAME,
      verifyLaunch: async () => {
        device.assertAppForeground();
        device.assertNoCrash("logcat-verify-launch.txt");
      },
      assert: (condition: unknown, message?: string) => {
        if (!condition) throw new Error(message ?? "Assertion failed");
      },
    } satisfies AndroidE2EContext & {
      packageName: string;
      verifyLaunch(): Promise<void>;
      assert(condition: unknown, message?: string): void;
    };

    const results: Array<{ id: string; title: string; status: "passed" | "failed"; error?: string }> = [];
    for (const testCase of cases) {
      await artifacts.step(`case:${testCase.id}`);
      try {
        device.clearApp();
        device.clearLogcat();
        await startAppAndAttach();
        await testCase.run(ctx);
        device.assertNoCrash(`logcat-${testCase.id}.txt`);
        results.push({ id: testCase.id, title: testCase.title, status: "passed" });
      } catch (error) {
        await artifacts.screenshot(ctx.page, `${testCase.id}-failure`).catch(() => undefined);
        device.dumpLogcat(`logcat-${testCase.id}-failure.txt`);
        results.push({ id: testCase.id, title: testCase.title, status: "failed", error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    }
    await artifacts.writeJson("summary.json", { status: "passed", results });
    console.log(`Android E2E ${MODE}: passed (${cases.length} case(s))`);
    console.log(`Results: ${RESULTS_DIR}`);
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

function selectedCases(): AndroidE2ECase[] {
  const cases = MODE === "smoke"
    ? smokeCases()
    : MODE === "critical"
      ? criticalCases()
      : MODE === "full"
        ? [...smokeCases(), ...criticalCases(), ...fullWorkerCases()]
        : MODE === "ai-live"
          ? aiLiveWorkerCases()
          : fail(`未知 suite：${MODE}`);
  const selected = CASE_FILTER ? cases.filter((item) => item.id === CASE_FILTER) : cases;
  if (selected.length === 0) fail(`未找到 case：${CASE_FILTER ?? "(empty)"}`);
  return selected;
}

function smokeCases(): AndroidE2ECase[] {
  return smokeWorkerCases.map((testCase) => ({
    id: testCase.name,
    title: testCase.name,
    run: (ctx) => testCase.run(ctx as never),
  }));
}

function criticalCases(): AndroidE2ECase[] {
  return criticalWorkerCases.map((testCase) => ({
    id: testCase.name,
    title: testCase.name,
    run: (ctx) => testCase.run(ctx as never),
  }));
}

async function firstPage(browser: Browser): Promise<Page> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const pages = browser.contexts().flatMap((context) => context.pages());
    const page = pages.find((item) => !item.isClosed());
    if (page) return page;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("无法从 WebView CDP 获取页面");
}

class Artifacts {
  constructor(private readonly dir: string, private readonly device: AdbDevice) {}

  async step(name: string): Promise<void>;
  async step<T>(name: string, action: () => Promise<T>): Promise<T>;
  async step<T>(name: string, action?: () => Promise<T>): Promise<T | void> {
    console.log(`→ ${name}`);
    writeFileSync(join(this.dir, "steps.log"), `${new Date().toISOString()} ${name}\n`, { flag: "a" });
    if (action) return action();
  }

  async screenshot(page: Page, name: string): Promise<void>;
  async screenshot(name: string, page?: Page): Promise<void>;
  async screenshot(pageOrName: Page | string, nameOrPage?: string | Page): Promise<void> {
    const page = typeof pageOrName === "string" ? nameOrPage as Page : pageOrName;
    const name = typeof pageOrName === "string" ? pageOrName : nameOrPage as string;
    await page.screenshot({ path: join(this.dir, `${safeName(name)}.png`), fullPage: true });
  }

  async writeJson(name: string, value: unknown) {
    writeFileSync(join(this.dir, name), `${JSON.stringify(value, null, 2)}\n`);
  }

  async log(message: string) {
    console.log(message);
    writeFileSync(join(this.dir, "steps.log"), `${new Date().toISOString()} ${message}\n`, { flag: "a" });
  }

  dumpLogcat(name: string) {
    this.device.dumpLogcat(name);
  }
}

class AdbDevice {
  serial: string;

  constructor(serial?: string) {
    this.serial = serial || this.selectDevice();
  }

  ensureReady() {
    this.run(["get-state"]);
  }

  install(apkPath: string) {
    this.run(["install", "-r", apkPath], { stdio: "pipe" });
  }

  clearApp() {
    this.shell(["pm", "clear", PACKAGE_NAME]);
  }

  forceStop() {
    this.shell(["am", "force-stop", PACKAGE_NAME]);
  }

  pressBack() {
    this.shell(["input", "keyevent", "KEYCODE_BACK"]);
  }

  screenshot(name: string) {
    const output = execFileSync("adb", ["-s", this.serial, "exec-out", "screencap", "-p"], {
      cwd: ROOT,
      stdio: "pipe",
    });
    writeFileSync(join(RESULTS_DIR, safeName(name)), output);
  }

  launchApp() {
    this.shell(["am", "start", "-W", "-n", `${PACKAGE_NAME}/.MainActivity`]);
  }

  clearLogcat() {
    this.run(["logcat", "-c"]);
  }

  dumpLogcat(name: string) {
    const output = this.run(["logcat", "-d", "-t", "1200"], { encoding: "utf8" });
    writeFileSync(join(RESULTS_DIR, name), output);
  }

  assertNoCrash(name: string) {
    const output = this.run(["logcat", "-d", "-t", "1200"], { encoding: "utf8" });
    writeFileSync(join(RESULTS_DIR, name), output);
    if (/FATAL EXCEPTION|AndroidRuntime|Process: com\.wardrobe\.outfit/.test(output)) {
      throw new Error(`发现 Android 致命日志：${join(RESULTS_DIR, name)}`);
    }
  }

  assertAppForeground() {
    const focus = this.shell(["dumpsys", "window"], { encoding: "utf8" });
    writeFileSync(join(RESULTS_DIR, "window-focus.txt"), focus);
    if (!focus.includes(PACKAGE_NAME)) throw new Error(`前台窗口不是 ${PACKAGE_NAME}`);
  }

  pid() {
    const pid = this.shell(["pidof", PACKAGE_NAME], { encoding: "utf8" }).trim();
    if (!pid) throw new Error("App 进程不存在");
    return pid.split(/\s+/)[0]!;
  }

  forward(localPort: number, remote: string) {
    this.run(["forward", `tcp:${localPort}`, remote]);
  }

  shell(args: string[], options: { encoding?: BufferEncoding } = {}) {
    return this.run(["shell", ...args], options);
  }

  run(args: string[], options: { encoding?: BufferEncoding; stdio?: "pipe" | "inherit" } = {}) {
    const output = execFileSync("adb", ["-s", this.serial, ...args], {
      cwd: ROOT,
      encoding: options.encoding,
      stdio: options.stdio ?? "pipe",
    });
    return typeof output === "string" ? output : output.toString("utf8");
  }

  private selectDevice() {
    const output = execFileSync("adb", ["devices"], { encoding: "utf8" });
    const emulator = output.split("\n").map((line) => line.trim().split(/\s+/)).find(([id, state]) => id?.startsWith("emulator-") && state === "device")?.[0];
    const any = output.split("\n").map((line) => line.trim().split(/\s+/)).find(([id, state]) => Boolean(id) && state === "device")?.[0];
    const selected = emulator ?? any;
    if (!selected) throw new Error("未发现可用 Android 设备；请先启动模拟器或设置 ANDROID_SERIAL");
    return selected;
  }
}

class WebViewCdp {
  constructor(private readonly device: AdbDevice) {}

  async connect() {
    const port = await freePort();
    const pid = this.device.pid();
    this.device.forward(port, `localabstract:webview_devtools_remote_${pid}`);
    await waitForHttp(`http://127.0.0.1:${port}/json/version`, 15_000).catch((error) => {
      throw new Error(`无法连接 APK WebView DevTools。请确认 APK debuggable 且 WebView debugging 可用。${error instanceof Error ? error.message : String(error)}`);
    });
    return chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  }
}

class ApkVerifier {
  private readonly buildTools: string;
  constructor(private readonly apkPath: string) {
    const androidHome = process.env.ANDROID_HOME;
    if (!androidHome) throw new Error("缺少 ANDROID_HOME");
    this.buildTools = execFileSync("bash", ["-lc", `find "${androidHome}/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1`], { encoding: "utf8" }).trim();
  }

  verify() {
    const aapt = join(this.buildTools, "aapt");
    const apksigner = join(this.buildTools, "apksigner");
    const badging = execFileSync(aapt, ["dump", "badging", this.apkPath], { encoding: "utf8" });
    const signature = execFileSync(apksigner, ["verify", "--print-certs", this.apkPath], { encoding: "utf8" });
    writeFileSync(join(RESULTS_DIR, "apk-badging.txt"), badging);
    writeFileSync(join(RESULTS_DIR, "apk-signature.txt"), signature);
    const packageName = badging.match(/package: name='([^']+)'/)?.[1];
    const versionName = badging.match(/versionName='([^']+)'/)?.[1];
    const packageVersion = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
    if (packageName !== PACKAGE_NAME) throw new Error(`APK 包名不匹配：${packageName}`);
    if (versionName !== packageVersion) throw new Error(`APK versionName=${versionName} 与 package.json=${packageVersion} 不一致`);
    const expectedSigner = process.env.APK_EXPECTED_SIGNER_CN;
    if (expectedSigner && !signature.includes(`CN=${expectedSigner}`)) throw new Error(`APK 签名未包含 CN=${expectedSigner}`);
    const sha = spawnSync("shasum", ["-a", "256", this.apkPath], { encoding: "utf8" }).stdout;
    writeFileSync(join(RESULTS_DIR, "apk-sha256.txt"), sha);
  }
}

class ApiClient implements AndroidE2EApi {
  constructor(private readonly baseUrl: string) {}

  async register(account: AndroidE2EAccount, deviceId = freshDeviceId()) {
    const session = await this.requestJson<Omit<AuthSession, "deviceId">>("/api/auth/register", "POST", undefined, {
      phone: account.phone,
      password: account.password,
      deviceId,
      deviceLabel: "Android E2E",
    });
    return { ...session, deviceId };
  }

  async login(account: AndroidE2EAccount, deviceId = freshDeviceId()) {
    const session = await this.requestJson<Omit<AuthSession, "deviceId">>("/api/auth/login", "POST", undefined, {
      phone: account.phone,
      password: account.password,
      deviceId,
      deviceLabel: "Android E2E",
    });
    return { ...session, deviceId };
  }

  async overview(session: AuthSession) {
    return this.requestJson<ReturnType<AndroidE2EApi["overview"]> extends Promise<infer T> ? T : never>("/api/workspace/overview", "GET", session);
  }

  async getWorkspaceOverview(session: AuthSession) {
    return this.overview(session);
  }

  async create(session: AuthSession, resource: string, payload: Record<string, unknown>) {
    return this.requestJson<{ entity: WorkspaceEntity }>(`/api/workspace/${resource}`, "POST", session, {
      clientMutationId: crypto.randomUUID(),
      payload,
      temporaryAssetIds: [],
    });
  }

  async update(session: AuthSession, resource: string, entity: WorkspaceEntity, payload: Record<string, unknown>) {
    return this.requestJson<{ entity: WorkspaceEntity }>(`/api/workspace/${resource}/${entity.id}`, "PUT", session, {
      clientMutationId: crypto.randomUUID(),
      expectedRevision: entity.revision,
      payload,
      temporaryAssetIds: [],
    });
  }

  async remove(session: AuthSession, resource: string, entity: WorkspaceEntity) {
    await this.requestJson(`/api/workspace/${resource}/${entity.id}`, "DELETE", session, {
      clientMutationId: crypto.randomUUID(),
      expectedRevision: entity.revision,
    });
  }

  async post<T>(session: AuthSession, path: string, body: Record<string, unknown>) {
    return this.requestJson<T>(path, "POST", session, body);
  }

  async request<T>(session: AuthSession, path: string, options: ApiRequestOptions = {}) {
    return this.requestJson<T>(path, options.method ?? "GET", session, options.body, options.headers);
  }

  async workspace<T>(session: AuthSession, path: string, options: ApiRequestOptions = {}) {
    return this.request<T>(session, path, options);
  }

  async upload<T>(session: AuthSession, path: string, body: Uint8Array, contentType: string) {
    return this.requestJson<T>(path, "PUT", session, body, { "Content-Type": contentType }, true);
  }

  async setFault(fault: AndroidE2EFault) {
    const token = process.env.E2E_FAULT_TOKEN;
    if (!token) throw new Error("Full E2E network retry requires E2E_FAULT_TOKEN and a test API with WARDROBE_E2E_FAULTS=1 or WARDROBE_ENV=test");
    await this.requestJson("/api/test/faults", "POST", undefined, fault, { "X-E2E-Fault-Token": token });
  }

  async clearFaults() {
    const token = process.env.E2E_FAULT_TOKEN;
    if (!token) return;
    await this.requestJson("/api/test/faults", "DELETE", undefined, undefined, { "X-E2E-Fault-Token": token });
  }

  private async requestJson<T>(
    path: string,
    method: string,
    session?: AuthSession,
    body?: unknown,
    headers: Record<string, string> = {},
    rawBody = false,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(session ? { Authorization: `Bearer ${session.accessToken}`, "X-Wardrobe-Device-Id": session.deviceId } : {}),
        ...(body === undefined || rawBody ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: rawBody ? body as BodyInit : JSON.stringify(body) }),
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(`${method} ${path} failed: ${response.status} ${text}`);
    return data as T;
  }
}

function findApk() {
  if (process.env.APK_PATH) return resolve(process.env.APK_PATH);
  const output = execFileSync("bash", ["-lc", `find "${ROOT}" \\( -path "${ROOT}/apk-local/*.apk" -o -path "${ROOT}/衣橱穿搭助手-v*.apk" \\) -type f 2>/dev/null | sort | tail -1`], { encoding: "utf8" }).trim();
  if (!output) throw new Error("未找到 APK，请设置 APK_PATH");
  return output;
}

function requiredApiBaseUrl() {
  const value = (process.env.ANDROID_E2E_API_BASE_URL ?? process.env.E2E_API_BASE_URL ?? process.env.TEST_API_URL ?? "").replace(/\/$/, "");
  if (!value) throw new Error("缺少 ANDROID_E2E_API_BASE_URL（应指向测试 API，不要指向生产）");
  const host = new URL(value).host;
  if ((host.includes("api.zhengfangapps.cloud") || value.includes("111.231.98.86")) && process.env.ANDROID_E2E_ALLOW_PRODUCTION !== "1") {
    throw new Error("拒绝对生产 API 跑 Android E2E；如确认是测试隔离环境，显式设置 ANDROID_E2E_ALLOW_PRODUCTION=1");
  }
  return value;
}

function freshAccount(): AndroidE2EAccount {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.replace(/\D/g, "").slice(-8).padStart(8, "0");
  return { phone: `139${suffix}`, password: "E2eTest123!" };
}

function freshDeviceId() {
  return `android-e2e-${crypto.randomUUID()}`;
}

function readArg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function loadEnvFile(path: string) {
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index < 0) continue;
      const key = trimmed.slice(0, index);
      const value = trimmed.slice(index + 1).replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

function safeName(name: string) {
  return name.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
}

async function freePort() {
  return new Promise<number>((resolvePromise, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => typeof address === "object" && address ? resolvePromise(address.port) : reject(new Error("无法分配本地端口")));
    });
    server.on("error", reject);
  });
}

async function waitForHttp(url: string, timeoutMs: number) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error(`等待超时：${url}`);
}

function fail(message: string): never {
  throw new Error(message);
}
