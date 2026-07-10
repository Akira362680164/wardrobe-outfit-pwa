import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { ensureDir, writeJson } from "../lib/fs";
import { commandText, runCommand } from "../lib/process";

interface RuntimeAuth {
  phone: string;
  password: string;
}

interface NetworkEvidence {
  startedAt: string;
  method: string;
  url: string;
  status?: number;
  durationMs?: number;
  failure?: string;
}

async function adbBinary(serial: string, args: string[]): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    execFile("adb", ["-s", serial, ...args], { encoding: "buffer", maxBuffer: 20 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout as Buffer);
    });
  });
}

async function connectWebView(serial: string): Promise<{ browser: Browser; page: Page; forwardPort: string }> {
  const pid = await commandText("adb", ["-s", serial, "shell", "pidof", "com.wardrobe.outfit"]);
  if (!pid) throw new Error("APP process is not running");
  const sockets = await commandText("adb", ["-s", serial, "shell", "cat", "/proc/net/unix"]);
  const socket = sockets.split("\n").map((line) => line.match(/@(webview_devtools_remote_\d+)$/u)?.[1]).find((name) => name?.endsWith(`_${pid}`));
  if (!socket) throw new Error(`WebView devtools socket not found for pid ${pid}`);
  const forwardPort = await commandText("adb", ["-s", serial, "forward", "tcp:0", `localabstract:${socket}`]);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${forwardPort}`);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const page = browser.contexts().flatMap((context) => context.pages()).find((candidate) => !candidate.isClosed());
    if (page) return { browser, page, forwardPort };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await browser.close();
  throw new Error("No WebView page available over CDP");
}

async function uiTree(page: Page): Promise<unknown[]> {
  return await page.evaluate(() => {
    const selectors = ["button", "input", "textarea", "select", "a", "[role]", "[data-parity-id]", "[data-testid]"];
    return [...document.querySelectorAll<HTMLElement>(selectors.join(","))]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          tag: element.tagName.toLowerCase(),
          role: element.getAttribute("role"),
          text: (element.innerText || element.getAttribute("aria-label") || "").trim().slice(0, 300),
          ariaLabel: element.getAttribute("aria-label"),
          parityId: element.getAttribute("data-parity-id"),
          testId: element.getAttribute("data-testid"),
          disabled: "disabled" in element ? Boolean((element as HTMLButtonElement).disabled) : false,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          style: {
            color: style.color,
            backgroundColor: style.backgroundColor,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            borderRadius: style.borderRadius,
            boxShadow: style.boxShadow,
            backdropFilter: style.backdropFilter,
          },
        };
      });
  });
}

async function waitForStable(page: Page): Promise<void> {
  let lastHash = "";
  let stableFrames = 0;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const snapshot = JSON.stringify(await uiTree(page));
    const hash = createHash("sha256").update(snapshot).digest("hex");
    if (hash === lastHash) stableFrames += 1;
    else stableFrames = 0;
    if (stableFrames >= 2) return;
    lastHash = hash;
    await page.waitForTimeout(250);
  }
  throw new Error("PAGE_NOT_STABLE: APP UI tree did not stabilize");
}

async function ensureLoggedIn(page: Page, auth: RuntimeAuth): Promise<void> {
  const loginHeading = page.getByText("登录衣橱账号", { exact: true });
  if (!await loginHeading.isVisible().catch(() => false)) return;
  await page.getByLabel("邮箱或手机号").fill(auth.phone);
  await page.getByLabel("密码", { exact: true }).fill(auth.password);
  const agreement = page.locator("#auth-login-terms-accepted");
  if (!await agreement.isChecked()) {
    await page.locator('label[for="auth-login-terms-accepted"]').click();
    await agreement.waitFor({ state: "attached" });
    if (!await agreement.isChecked()) {
      throw new Error("登录协议勾选后未进入选中状态");
    }
  }
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByText("全部衣橱", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await waitForStable(page);
}

async function saveCheckpoint(options: {
  page: Page;
  serial: string;
  directory: string;
  name: string;
}): Promise<void> {
  await ensureDir(options.directory);
  const screenshot = await adbBinary(options.serial, ["exec-out", "screencap", "-p"]);
  await fs.writeFile(path.join(options.directory, `${options.name}.png`), screenshot);
  await fs.writeFile(path.join(options.directory, `${options.name}-device.png`), screenshot);
  await writeJson(path.join(options.directory, `${options.name}-ui-tree.json`), await uiTree(options.page));
  await writeJson(path.join(options.directory, `${options.name}-route.json`), await options.page.evaluate(() => ({
    href: location.href,
    historyLength: history.length,
    historyState: history.state,
    title: document.title,
  })));
}

export async function captureAppGarmentDetailSample(options: {
  cwd: string;
  runRoot: string;
  runId: string;
  serial: string;
  runtimeSessionFile: string;
}): Promise<{ evidenceRoot: string; requests: number }> {
  const auth = JSON.parse(await fs.readFile(options.runtimeSessionFile, "utf8")) as RuntimeAuth;
  await runCommand("adb", ["-s", options.serial, "shell", "monkey", "-p", "com.wardrobe.outfit", "-c", "android.intent.category.LAUNCHER", "1"]);
  const { browser, page, forwardPort } = await connectWebView(options.serial);
  const network: NetworkEvidence[] = [];
  const started = new Map<string, number>();
  page.on("request", (request) => {
    started.set(request.url(), Date.now());
    network.push({ startedAt: new Date().toISOString(), method: request.method(), url: request.url() });
  });
  page.on("response", (response) => {
    const entry = [...network].reverse().find((candidate) => candidate.url === response.url() && candidate.status === undefined);
    if (entry) {
      entry.status = response.status();
      entry.durationMs = Date.now() - (started.get(response.url()) ?? Date.now());
    }
  });
  page.on("requestfailed", (request) => {
    const entry = [...network].reverse().find((candidate) => candidate.url === request.url() && candidate.failure === undefined);
    if (entry) entry.failure = request.failure()?.errorText ?? "request failed";
  });
  const evidenceRoot = path.join(options.runRoot, "wardrobe", "wardrobe.garment.detail", "garment.complete", "garment.detail.more", "app");
  try {
    await ensureLoggedIn(page, auth);
    const fixtureName = `${options.runId}-garment-complete`;
    const detailHeading = page.getByRole("heading", { name: fixtureName, exact: true });
    if (!await detailHeading.isVisible().catch(() => false)) {
      const card = page.getByRole("button", { name: new RegExp(fixtureName) }).first();
      await card.waitFor({ state: "visible", timeout: 30_000 });
      await card.click();
    }
    await detailHeading.waitFor({ state: "visible", timeout: 20_000 });
    await waitForStable(page);
    await saveCheckpoint({ page, serial: options.serial, directory: evidenceRoot, name: "00-before-raw" });

    const more = page.getByRole("button", { name: "更多操作" });
    await more.evaluate((element) => { element.style.outline = "3px solid #ef4444"; element.style.outlineOffset = "2px"; });
    await saveCheckpoint({ page, serial: options.serial, directory: evidenceRoot, name: "00-before-annotated" });
    await more.evaluate((element) => { element.style.outline = ""; element.style.outlineOffset = ""; });
    await more.click();
    await saveCheckpoint({ page, serial: options.serial, directory: evidenceRoot, name: "01-immediate" });
    await waitForStable(page);
    await saveCheckpoint({ page, serial: options.serial, directory: evidenceRoot, name: "02-settled" });
    await runCommand("adb", ["-s", options.serial, "shell", "input", "keyevent", "KEYCODE_BACK"]);
    await waitForStable(page);
    await saveCheckpoint({ page, serial: options.serial, directory: evidenceRoot, name: "03-return-or-close" });
    await writeJson(path.join(evidenceRoot, "network.json"), network.map((entry) => ({ ...entry, url: entry.url.replace(/([?&](?:token|key|code)=)[^&]+/giu, "$1***") })));
    await writeJson(path.join(evidenceRoot, "execution.json"), {
      schemaVersion: 1,
      platform: "app",
      screenId: "wardrobe.garment.detail",
      stateId: "info.top",
      actionId: "garment.detail.more",
      status: "PASS",
      transition: "overlay-open",
      returnPath: "system-back",
      forwardPort,
      evidenceFiles: ["00-before-raw.png", "00-before-annotated.png", "01-immediate.png", "02-settled.png", "03-return-or-close.png"],
    });
    return { evidenceRoot, requests: network.length };
  } finally {
    await browser.close();
    await runCommand("adb", ["-s", options.serial, "forward", "--remove", `tcp:${forwardPort}`], { allowFailure: true });
  }
}
