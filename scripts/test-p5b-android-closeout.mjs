import { execFileSync, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

const serial = process.env.ANDROID_SERIAL ?? "emulator-5554";
const packageName = "com.wardrobe.outfit";
const adbBin = process.env.ADB_BIN
  ?? "/Users/fangzheng/Library/Android/sdk/platform-tools/adb";
const evidenceDir = process.env.P5B_ANDROID_EVIDENCE
  ?? "/Users/fangzheng/Downloads/Wardora_P5B_Closeout_20260728/android";

function adb(args, encoding = "utf8") {
  return execFileSync(adbBin, ["-s", serial, ...args], {
    encoding,
    maxBuffer: 32 * 1024 * 1024,
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(condition, message, timeout = 25_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await sleep(80);
  }
  throw new Error(message);
}

class Cdp {
  constructor(url) {
    this.url = url;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const callback = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) callback?.reject(new Error(message.error.message));
        else callback?.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params);
    };
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async value(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description
        ?? result.exceptionDetails.text
        ?? "Runtime.evaluate failed");
    }
    return result.result.value;
  }

  close() {
    this.ws?.close();
  }
}

async function connectCdp() {
  const pid = adb(["shell", "pidof", packageName]).trim().split(/\s+/)[0];
  assert(pid, "App process missing");
  const socket = adb(["shell", "cat", "/proc/net/unix"])
    .split("\n")
    .map((line) => line.match(/@(webview_devtools_remote_\d+)$/u)?.[1])
    .find((name) => name?.endsWith(`_${pid}`));
  assert(socket, `WebView devtools socket missing for ${pid}`);
  const port = adb(["forward", "tcp:0", `localabstract:${socket}`]).trim();
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const target = targets.find((item) => item.type === "page");
  assert(target, "WebView page target missing");
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.connect();
  return { cdp, port };
}

async function screenshot(name) {
  await writeFile(`${evidenceDir}/${name}.png`, adb(["exec-out", "screencap", "-p"], "buffer"));
}

async function clickText(cdp, text, { last = false } = {}) {
  return cdp.value(`(() => {
    const elements = [...document.querySelectorAll("button,a,[role=button]")]
      .filter((element) => element.textContent.trim() === ${JSON.stringify(text)});
    const element = elements[${last ? "elements.length - 1" : "0"}];
    if (!element) return false;
    element.click();
    return true;
  })()`);
}

async function clickSelector(cdp, selector) {
  return cdp.value(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    element.click();
    return true;
  })()`);
}

async function waitForStableRoute(cdp, routeName) {
  await waitFor(() => cdp.value(`(() => {
    const route = document.querySelector('[data-navigation-to="${routeName}"]');
    return Boolean(
      route
      && route.querySelectorAll('[data-navigation-presence="current"]').length === 1
      && route.querySelectorAll('[data-navigation-presence="exiting"]').length === 0
    );
  })()`), `${routeName} did not settle to a single current route`);
}

async function collectGeometry(cdp, selectors) {
  return cdp.value(`(() => {
    const result = {};
    const selectors = ${JSON.stringify(selectors)};
    for (const [name, selector] of Object.entries(selectors)) {
      const element = document.querySelector(selector);
      if (!element) {
        result[name] = null;
        continue;
      }
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const icon = element.querySelector("svg");
      const iconRect = icon?.getBoundingClientRect();
      result[name] = {
        x: Number(rect.x.toFixed(2)),
        y: Number(rect.y.toFixed(2)),
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
        radius: style.borderRadius,
        display: style.display,
        alignItems: style.alignItems,
        justifyContent: style.justifyContent,
        iconCenterDelta: iconRect ? {
          x: Number((iconRect.x + iconRect.width / 2 - (rect.x + rect.width / 2)).toFixed(2)),
          y: Number((iconRect.y + iconRect.height / 2 - (rect.y + rect.height / 2)).toFixed(2)),
        } : null,
        text: element.textContent.trim(),
      };
    }
    return result;
  })()`);
}

async function collectTextGeometry(cdp, labels) {
  return cdp.value(`(() => {
    const result = {};
    const labels = ${JSON.stringify(labels)};
    for (const [name, label] of Object.entries(labels)) {
      const element = [...document.querySelectorAll("button")]
        .find((candidate) => candidate.textContent.trim() === label);
      if (!element) {
        result[name] = null;
        continue;
      }
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const icon = element.querySelector("svg");
      const iconRect = icon?.getBoundingClientRect();
      result[name] = {
        x: Number(rect.x.toFixed(2)),
        y: Number(rect.y.toFixed(2)),
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
        radius: style.borderRadius,
        display: style.display,
        alignItems: style.alignItems,
        justifyContent: style.justifyContent,
        iconCenterDelta: iconRect ? {
          x: Number((iconRect.x + iconRect.width / 2 - (rect.x + rect.width / 2)).toFixed(2)),
          y: Number((iconRect.y + iconRect.height / 2 - (rect.y + rect.height / 2)).toFixed(2)),
        } : null,
        text: element.textContent.trim(),
      };
    }
    return result;
  })()`);
}

async function recordTransition(cdp, name, reducedMotion) {
  const remotePath = `/sdcard/${name}-${Date.now()}.mp4`;
  const localPath = `${evidenceDir}/${name}.mp4`;
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{
      name: "prefers-reduced-motion",
      value: reducedMotion ? "reduce" : "no-preference",
    }],
  });
  assert(
    await cdp.value(`matchMedia("(prefers-reduced-motion: reduce)").matches`)
      === reducedMotion,
    `${name}: reduced-motion emulation mismatch`,
  );

  const recorder = spawn(adbBin, [
    "-s", serial,
    "shell", "screenrecord",
    "--bit-rate", "8000000",
    "--time-limit", "20",
    remotePath,
  ], { stdio: "ignore" });
  assert(recorder.pid, `${name}: local adb screenrecord process missing`);
  await sleep(600);

  const trace = [];
  let tracing = true;
  const sample = async () => {
    while (tracing) {
      trace.push(await cdp.value(`(() => ({
        at: performance.now(),
        from: document.querySelector("[data-navigation-from]")?.getAttribute("data-navigation-from"),
        to: document.querySelector("[data-navigation-to]")?.getAttribute("data-navigation-to"),
        current: [...document.querySelectorAll('[data-navigation-presence="current"]')].map((element) => element.textContent.slice(0, 36)),
        exiting: [...document.querySelectorAll('[data-navigation-presence="exiting"]')].map((element) => element.textContent.slice(0, 36)),
        homeHeading: Boolean([...document.querySelectorAll("h1,h2")].find((element) => /今天穿得/.test(element.textContent))),
        settingsHeading: Boolean([...document.querySelectorAll("h1,h2")].find((element) => element.textContent.trim() === "设置")),
      }))()`));
      await sleep(16);
    }
  };
  const tracePromise = sample();

  assert(await clickText(cdp, "设置", { last: true }), `${name}: settings Tab missing`);
  await waitForStableRoute(cdp, "settings_home");
  await sleep(350);
  assert(await clickText(cdp, "首页", { last: true }), `${name}: home Tab missing`);
  await waitForStableRoute(cdp, "home_feed");
  await sleep(350);
  assert(await clickText(cdp, "设置", { last: true }), `${name}: second settings Tab missing`);
  await waitForStableRoute(cdp, "settings_home");
  await sleep(350);
  assert(await clickText(cdp, "首页", { last: true }), `${name}: second home Tab missing`);
  await waitForStableRoute(cdp, "home_feed");
  await sleep(350);

  tracing = false;
  await tracePromise;
  recorder.kill("SIGINT");
  await Promise.race([
    new Promise((resolve) => recorder.once("exit", resolve)),
    sleep(3_000),
  ]);
  await sleep(500);
  adb(["pull", remotePath, localPath]);
  await writeFile(`${evidenceDir}/${name}-route-trace.json`, `${JSON.stringify(trace, null, 2)}\n`);
  return {
    name,
    reducedMotion,
    framesWithBothHeadings: trace.filter((entry) => entry.homeHeading && entry.settingsHeading).length,
    maxExitingCount: Math.max(...trace.map((entry) => entry.exiting.length), 0),
    traceSamples: trace.length,
  };
}

await mkdir(evidenceDir, { recursive: true });
adb(["shell", "input", "keyevent", "KEYCODE_WAKEUP"]);
adb(["shell", "wm", "dismiss-keyguard"]);
adb(["shell", "am", "force-stop", packageName]);
adb(["logcat", "-c"]);
adb(["shell", "am", "start", "-W", "-n", `${packageName}/.MainActivity`]);
await sleep(1_200);

let cdp;
let forwardPort;
const runtimeExceptions = [];
const loadingFailures = [];
const geometry = {};
try {
  ({ cdp, port: forwardPort } = await connectCdp());
  cdp.on("Runtime.exceptionThrown", (event) => {
    runtimeExceptions.push(event.exceptionDetails?.exception?.description
      ?? event.exceptionDetails?.text
      ?? "unknown");
  });
  cdp.on("Network.loadingFailed", (event) => {
    if (!event.canceled) loadingFailures.push(event.errorText ?? "unknown");
  });
  await Promise.all(["Runtime.enable", "Network.enable", "Page.enable"].map((method) => cdp.send(method)));

  await waitFor(() => cdp.value(`Boolean(document.querySelector('[data-testid="wardora-home-feed"]'))`), "Logged-in home feed missing");
  await waitForStableRoute(cdp, "home_feed");
  assert(await clickText(cdp, "衣橱"), "Home wardrobe Tab missing");
  await waitFor(() => cdp.value(`document.querySelectorAll("button.ui-card[aria-label]").length >= 1`), "Wardrobe cards missing");
  const firstGarmentLabel = await cdp.value(`document.querySelector("button.ui-card[aria-label]")?.getAttribute("aria-label")`);
  assert(firstGarmentLabel, "First wardrobe garment label missing");
  assert(await clickSelector(cdp, "button.ui-card[aria-label]"), "First wardrobe garment did not open");
  await waitForStableRoute(cdp, "garment_detail");
  await waitFor(() => cdp.value(`Boolean(document.querySelector('[aria-label="返回"]') && document.querySelector('[aria-label*="更多"]'))`), "Garment detail controls missing");
  assert(
    await cdp.value(`!document.querySelector('[data-testid="wardora-home-feed"]')`),
    "Garment detail is still embedded inside the home feed",
  );
  await sleep(320);
  geometry.garmentDetail = await collectGeometry(cdp, {
    backHit: '[aria-label="返回"]',
    backVisual: '[aria-label="返回"] > span',
    moreHit: '[aria-label*="更多"]',
    moreVisual: '[aria-label*="更多"] > span',
  });
  assert(geometry.garmentDetail.backHit?.height >= 47.5, "Garment detail Back hit target is below 48dp");
  assert(geometry.garmentDetail.moreHit?.height >= 47.5, "Garment detail More hit target is below 48dp");
  assert(
    Math.abs(geometry.garmentDetail.backHit?.iconCenterDelta?.x ?? 999) <= 0.5
      && Math.abs(geometry.garmentDetail.backHit?.iconCenterDelta?.y ?? 999) <= 0.5,
    "Garment detail Back icon is not centered",
  );
  assert(
    Math.abs(geometry.garmentDetail.moreHit?.iconCenterDelta?.x ?? 999) <= 0.5
      && Math.abs(geometry.garmentDetail.moreHit?.iconCenterDelta?.y ?? 999) <= 0.5,
    "Garment detail More icon is not centered",
  );
  await screenshot("01-garment-detail-stable");
  assert(await clickSelector(cdp, '[aria-label="返回"]'), "Garment detail Back missing");
  await waitFor(() => cdp.value(`Boolean(document.querySelector("button.ui-card[aria-label]"))`), "Wardrobe did not return from garment detail");

  assert(await clickText(cdp, "推荐"), "Recommendation Tab missing");
  assert(await clickSelector(cdp, '[data-testid="home-location-entry"]'), "Location entry missing");
  await waitFor(() => cdp.value(`Boolean(document.querySelector('[data-testid="home-city-sheet"]'))`), "City Sheet missing");
  assert(await clickSelector(cdp, '[data-testid="home-use-current-location"]'), "Use-current-location button missing");
  await waitFor(() => cdp.value(`Boolean([...document.querySelectorAll('[role="dialog"]')].find((element) => element.textContent.includes("用大致位置找城市")))`), "Location purpose Sheet missing");
  await sleep(240);
  geometry.locationPurpose = await collectTextGeometry(cdp, {
    continue: "继续使用大致位置",
    cancel: "暂不使用",
  });
  assert(geometry.locationPurpose.continue?.height >= 47.5, "Location continue button is below 48dp");
  assert(geometry.locationPurpose.cancel?.height >= 47.5, "Location cancel button is below 48dp");
  await screenshot("02-location-purpose-stable");
  assert(await clickText(cdp, "暂不使用"), "Location purpose cancel missing");
  assert(await clickSelector(cdp, '[aria-label="关闭城市选择"]'), "City Sheet close missing");
  await waitFor(() => cdp.value(`!document.querySelector('[data-testid="home-city-sheet"]')`), "City Sheet did not close");

  assert(await clickText(cdp, "设置", { last: true }), "Settings Tab missing");
  await waitForStableRoute(cdp, "settings_home");
  await sleep(320);
  await screenshot("03-settings-stable");

  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  await waitFor(() => cdp.value(`Boolean([...document.querySelectorAll('[role="dialog"]')].find((element) => element.textContent.includes("是否退出应用")))`), "Root Back exit confirmation missing");
  await sleep(240);
  geometry.exitConfirmation = await collectGeometry(cdp, {
    cancel: 'button[data-parity-id$="09e65fa5b3"]',
    exit: 'button[data-parity-id$="7cb1f8a008"]',
  });
  assert(geometry.exitConfirmation.cancel?.height >= 47.5, "Exit cancel button is below 48dp");
  assert(geometry.exitConfirmation.exit?.height >= 47.5, "Exit confirm button is below 48dp");
  await screenshot("04-root-back-exit-confirmation-stable");
  assert(await clickText(cdp, "取消"), "Exit confirmation cancel missing");

  assert(await clickText(cdp, "首页", { last: true }), "Home Tab missing before foreground test");
  await waitForStableRoute(cdp, "home_feed");
  adb(["shell", "input", "keyevent", "KEYCODE_HOME"]);
  await sleep(500);
  adb(["shell", "am", "start", "-W", "-n", `${packageName}/.MainActivity`]);
  await waitFor(() => cdp.value(`Boolean(document.querySelector('[data-testid="wardora-home-feed"]'))`), "Foreground restore lost Wardora home");
  await waitForStableRoute(cdp, "home_feed");
  await sleep(300);
  await screenshot("05-foreground-restore-stable");

  const normalTransition = await recordTransition(cdp, "06-home-settings-normal-motion", false);
  const reducedTransition = await recordTransition(cdp, "07-home-settings-reduced-motion", true);
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
  });

  const packageDump = adb(["shell", "dumpsys", "package", packageName]);
  const logcat = adb(["logcat", "-d", "-t", "1800"]);
  await writeFile(`${evidenceDir}/logcat.txt`, logcat);
  const fatalMatches = logcat.match(/FATAL EXCEPTION|AndroidRuntime: FATAL/g) ?? [];
  const manifest = {
    scenario: "wardora-p5b-android-closeout",
    baseCommit: "fa72503e51fbbe5c7ee0e068a5af540b2cd51b8e",
    serial,
    androidRelease: adb(["shell", "getprop", "ro.build.version.release"]).trim(),
    androidSdk: Number(adb(["shell", "getprop", "ro.build.version.sdk"]).trim()),
    packageName,
    installedVersionName: packageDump.match(/versionName=([^\s]+)/)?.[1] ?? null,
    installedVersionCode: Number(packageDump.match(/versionCode=(\d+)/)?.[1] ?? 0),
    firstGarmentLabel,
    screenshots: [
      "01-garment-detail-stable.png",
      "02-location-purpose-stable.png",
      "03-settings-stable.png",
      "04-root-back-exit-confirmation-stable.png",
      "05-foreground-restore-stable.png",
    ],
    transitions: [normalTransition, reducedTransition],
    geometry,
    runtimeExceptions,
    loadingFailures,
    fatalCount: fatalMatches.length,
  };
  assert(runtimeExceptions.length === 0, `Runtime exceptions: ${runtimeExceptions.join(" | ")}`);
  assert(fatalMatches.length === 0, `Android fatal count: ${fatalMatches.length}`);
  await writeFile(`${evidenceDir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
} finally {
  cdp?.close();
  if (forwardPort) {
    try {
      adb(["forward", "--remove", `tcp:${forwardPort}`]);
    } catch {}
  }
}
