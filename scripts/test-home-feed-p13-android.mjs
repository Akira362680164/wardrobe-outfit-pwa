import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

const serial = process.env.ANDROID_SERIAL ?? "emulator-5554";
const packageName = "com.wardrobe.outfit";
const evidenceDir = process.env.HOME_FEED_ANDROID_EVIDENCE ?? "test-results/home-feed-p13-android/20260718";
const fixtureOrigin = process.env.HOME_FEED_FIXTURE_ORIGIN ?? "http://127.0.0.1:4174";

function adb(args, encoding = "utf8") {
  return execFileSync("adb", ["-s", serial, ...args], { encoding, maxBuffer: 20 * 1024 * 1024 });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(condition, message, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await sleep(120);
  }
  throw new Error(message);
}

async function fixtureRequest(path, options) {
  const response = await fetch(`${fixtureOrigin}${path}`, options);
  assert(response.ok, `Fixture request failed: ${path} ${response.status}`);
  return response.json();
}

async function traceEntries() {
  return (await fixtureRequest("/__fixture/trace")).entries;
}

async function waitForTrace(method, path, statuses, offset = 0) {
  await waitFor(async () => {
    const entries = (await traceEntries()).filter((entry) => entry.method === method && entry.path === path).slice(offset);
    return statuses.every((status, index) => entries[index]?.status === status);
  }, `Fixture trace missing ${method} ${path} ${statuses.join("→")}`, 30_000);
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
    const result = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "Runtime.evaluate failed");
    return result.result.value;
  }

  close() {
    this.ws?.close();
  }
}

async function screenshot(name) {
  await writeFile(`${evidenceDir}/${name}.png`, adb(["exec-out", "screencap", "-p"], "buffer"));
}

async function connectCdp() {
  const pid = adb(["shell", "pidof", packageName]).trim().split(/\s+/)[0];
  assert(pid, "App process missing");
  const socket = adb(["shell", "cat", "/proc/net/unix"]).split("\n")
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

const visible = `(element) => { if (!element) return false; const r=element.getBoundingClientRect(); const s=getComputedStyle(element); return r.width>0&&r.height>0&&s.display!=="none"&&s.visibility!=="hidden"; }`;
const testId = (id) => `document.querySelector(${JSON.stringify(`[data-testid="${id}"]`)})`;

async function hasTestId(cdp, id) {
  return cdp.value(`Boolean(${testId(id)} && (${visible})(${testId(id)}))`);
}

async function clickTestId(cdp, id) {
  return cdp.value(`(() => { const e=${testId(id)}; if(!e||!(${visible})(e)) return false; e.click(); return true; })()`);
}

async function clickText(cdp, text, last = false) {
  return cdp.value(`(() => { const visible=${visible}; const es=[...document.querySelectorAll("button,a,[role=button],span,p")].filter(e=>visible(e)&&e.textContent.trim()===${JSON.stringify(text)}); const e=es[${last ? "es.length-1" : "0"}]; if(!e)return false; e.click(); return true; })()`);
}

async function clickAria(cdp, label) {
  return cdp.value(`(() => { const e=document.querySelector(${JSON.stringify(`[aria-label="${label}"]`)}); if(!e)return false; e.click(); return true; })()`);
}

async function textOf(cdp, selector) {
  return cdp.value(`document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() ?? ""`);
}

async function textOfTestId(cdp, id) {
  return textOf(cdp, `[data-testid="${id}"]`);
}

async function settleVisual(cdp, delayMs = 180) {
  await cdp.value(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, ${delayMs}))))`);
}

async function assertHumanError(cdp, selector, expected, label) {
  const text = await textOf(cdp, selector);
  assert(expected.test(text), `${label} missing human-readable message: ${text}`);
  assert(!/Zod|schema|fallback modes cannot expose weather values|invalid_type|\{\s*"/i.test(text), `${label} exposed raw schema text: ${text}`);
  return text;
}

async function criticalViewportState(cdp) {
  return cdp.value(`(() => {
    const visible=${visible};
    const exact=(text)=>[...document.querySelectorAll("h1,button,[role=tab],span")].find(e=>visible(e)&&e.textContent.trim()===text);
    const contains=(text)=>[...document.querySelectorAll("h1,button,[role=tab],span")].find(e=>visible(e)&&e.textContent.includes(text));
    const items={
      title: contains("好，今天穿得"),
      location: document.querySelector('[data-testid="home-location-entry"]'),
      today: exact("今天")?.closest("button"),
      recommendationTab: document.querySelector('[role="tab"][aria-controls="home-recommendation-panel"]'),
      wardrobeTab: document.querySelector('[role="tab"][aria-controls="home-wardrobe-panel"]'),
    };
    return Object.fromEntries(Object.entries(items).map(([key, element])=>{
      if(!element) return [key,{exists:false}];
      const r=element.getBoundingClientRect();
      return [key,{exists:true,visible:visible(element),within:r.top>=-1&&r.left>=-1&&r.bottom<=innerHeight+1&&r.right<=innerWidth+1,rect:r.toJSON()}];
    }));
  })()`);
}

await mkdir(evidenceDir, { recursive: true });
await fixtureRequest("/__fixture/trace");
adb(["shell", "pm", "clear", packageName]);
adb(["logcat", "-c"]);
adb(["shell", "am", "start", "-W", "-n", `${packageName}/.MainActivity`]);

let cdp;
let forwardPort;
const runtimeExceptions = [];
const loadingFailures = [];
const cdpRequests = new Map();
const cdpResponses = { profileGets: [], profileDeletes: [] };

try {
  ({ cdp, port: forwardPort } = await connectCdp());
  cdp.on("Runtime.exceptionThrown", (event) => runtimeExceptions.push({
    text: event.exceptionDetails?.text ?? "unknown",
    description: event.exceptionDetails?.exception?.description ?? null,
    url: event.exceptionDetails?.url ?? null,
    lineNumber: event.exceptionDetails?.lineNumber ?? null,
    columnNumber: event.exceptionDetails?.columnNumber ?? null,
  }));
  cdp.on("Network.requestWillBeSent", (event) => cdpRequests.set(event.requestId, { method: event.request.method, url: event.request.url }));
  cdp.on("Network.responseReceived", (event) => {
    const request = cdpRequests.get(event.requestId);
    if (!request?.url.includes("/api/settings/location-profile")) return;
    if (request.method === "GET") cdpResponses.profileGets.push(event.response.status);
    if (request.method === "DELETE") cdpResponses.profileDeletes.push(event.response.status);
  });
  cdp.on("Network.loadingFailed", (event) => {
    if (!event.canceled) loadingFailures.push(event.errorText ?? "unknown");
  });
  await Promise.all(["Runtime.enable", "Network.enable", "Page.enable", "Log.enable"].map((method) => cdp.send(method)));

  await waitFor(() => cdp.value(`document.querySelectorAll("input").length >= 3`), "Login form missing");
  const profileTraceOffset = (await traceEntries()).filter((entry) => entry.method === "GET" && entry.path === "/api/settings/location-profile").length;
  await fixtureRequest("/__fixture/control", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "fail-next-profile-get", count: 2 }),
  });
  await cdp.value(`(() => { const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set; const inputs=[...document.querySelectorAll("input")]; const email=inputs.find(e=>e.type==="text"||e.type==="email"); const password=inputs.find(e=>e.type==="password"); set.call(email,"fixture111@example.test"); email.dispatchEvent(new Event("input",{bubbles:true})); set.call(password,"FixturePassword123!"); password.dispatchEvent(new Event("input",{bubbles:true})); const check=inputs.find(e=>e.type==="checkbox"); if(!check.checked) check.click(); return true; })()`);
  assert(await clickText(cdp, "登录"), "Login button missing");
  await waitFor(() => clickText(cdp, "设置", true), "Settings tab missing", 25_000);
  if (await cdp.value(`Boolean(document.querySelector('[aria-label="关闭提示"]'))`)) await clickAria(cdp, "关闭提示");
  await waitFor(() => hasTestId(cdp, "open-home-feed-preview"), "Home preview entry missing");
  assert(await clickTestId(cdp, "open-home-feed-preview"), "Home preview click failed");
  await waitFor(() => hasTestId(cdp, "wardora-home-feed"), "Home feed missing");
  await waitForTrace("GET", "/api/settings/location-profile", [503], profileTraceOffset);
  assert(await clickTestId(cdp, "home-location-entry"), "Location entry click failed");
  await waitFor(() => hasTestId(cdp, "home-city-sheet"), "City sheet missing");
  await waitFor(() => cdp.value(`Boolean(document.querySelector('[data-testid="home-city-sheet"] [role="alert"]'))`), "Location failure alert missing");
  const locationFailureText = await assertHumanError(cdp, '[data-testid="home-city-sheet"] [role="alert"]', /地点|服务|重试/, "Location failure");
  await settleVisual(cdp);
  await screenshot("00-location-read-failure");

  assert(await clickText(cdp, "重试"), "Retry button missing");
  await waitForTrace("GET", "/api/settings/location-profile", [503, 503, 200], profileTraceOffset);
  await waitFor(async () => (await textOfTestId(cdp, "home-location-entry")).includes("上海"), "Shanghai not restored");
  await waitFor(() => cdp.value(`!document.querySelector('[data-testid="home-city-sheet"] [role="alert"]')`), "Location alert remained after retry");
  await settleVisual(cdp);
  await screenshot("01-location-retry-success");
  assert(await clickAria(cdp, "关闭城市选择"), "City sheet close missing");
  await waitFor(async () => !(await hasTestId(cdp, "home-city-sheet")), "City sheet did not close");

  await cdp.value(`document.documentElement.style.fontSize="20.8px"; window.scrollTo(0,0)`);
  await settleVisual(cdp, 220);
  const homeOverflow = await cdp.value(`document.documentElement.scrollWidth-document.documentElement.clientWidth`);
  assert(homeOverflow <= 1, `Home overflow ${homeOverflow}`);
  const criticalElements = await criticalViewportState(cdp);
  for (const [label, state] of Object.entries(criticalElements)) {
    assert(state.exists && state.visible && state.within, `130% critical element clipped: ${label} ${JSON.stringify(state)}`);
  }
  await screenshot("02-home-font130");

  assert(await clickText(cdp, "设置", true), "Settings tab missing after home");
  await waitFor(() => clickText(cdp, "天气地点"), "Weather location entry missing");
  await waitFor(() => hasTestId(cdp, "weather-location-settings"), "Weather settings missing");
  await settleVisual(cdp);
  const settingsOverflow = await cdp.value(`document.documentElement.scrollWidth-document.documentElement.clientWidth`);
  assert(settingsOverflow <= 1, `Settings overflow ${settingsOverflow}`);

  const deleteTraceOffset = (await traceEntries()).filter((entry) => entry.method === "DELETE" && entry.path === "/api/settings/location-profile").length;
  assert(await clickTestId(cdp, "request-clear-home-city"), "Clear request missing");
  await waitFor(() => cdp.value(`Boolean(document.querySelector('[role="alertdialog"]'))`), "Clear dialog missing");
  assert(await clickTestId(cdp, "confirm-clear-home-city"), "Confirm clear missing");
  await waitFor(() => cdp.value(`Boolean(document.querySelector('[role="alertdialog"] p[role="status"]'))`), "Pending marker missing");
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  await sleep(550);
  assert(await cdp.value(`Boolean(document.querySelector('[role="alertdialog"]') && document.querySelector('[role="alertdialog"] p[role="status"]'))`), "System Back changed or closed pending dialog");
  await cdp.value(`document.elementFromPoint(8,8)?.click()`);
  await sleep(550);
  assert(await cdp.value(`Boolean(document.querySelector('[role="alertdialog"]') && document.querySelector('[role="alertdialog"] p[role="status"]'))`), "Backdrop tap changed or closed pending dialog");
  await waitForTrace("DELETE", "/api/settings/location-profile", [503], deleteTraceOffset);
  await waitFor(() => cdp.value(`Boolean(document.querySelector('[role="alertdialog"] [role="alert"]'))`), "Clear network error missing");
  const networkFailureText = await assertHumanError(cdp, '[role="alertdialog"] [role="alert"]', /网络|失败|重试/, "Clear network failure");
  await settleVisual(cdp);
  await screenshot("03-clear-network-failure");

  await waitFor(() => cdp.value(`!document.querySelector('[data-testid="confirm-clear-home-city"]')?.disabled`), "Retry after network failure stayed disabled");
  assert(await clickTestId(cdp, "confirm-clear-home-city"), "Retry after network failure missing");
  await waitForTrace("DELETE", "/api/settings/location-profile", [503, 409], deleteTraceOffset);
  await waitFor(() => cdp.value(`document.querySelector('[role="alertdialog"] [role="alert"]')?.getAttribute('data-conflict') === 'true'`), "409 conflict marker missing");
  const conflictText = await assertHumanError(cdp, '[role="alertdialog"] [role="alert"]', /冲突|其他设备|更新/, "Clear conflict");
  assert(await cdp.value(`!document.querySelector('[data-testid="confirm-clear-home-city"]')?.disabled`), "409 retry disabled");
  await settleVisual(cdp);
  await screenshot("04-clear-conflict");

  assert(await clickTestId(cdp, "confirm-clear-home-city"), "Retry after 409 missing");
  await waitForTrace("DELETE", "/api/settings/location-profile", [503, 409, 200], deleteTraceOffset);
  await waitFor(() => cdp.value(`!document.querySelector('[role="alertdialog"]')`), "Clear dialog did not close");
  assert(await clickAria(cdp, "返回设置"), "Return to settings button missing after clear");
  await waitFor(async () => !(await hasTestId(cdp, "weather-location-settings")), "Weather settings did not exit after clear");
  await waitFor(() => hasTestId(cdp, "open-home-feed-preview"), "Preview entry missing after clear");
  assert(await clickTestId(cdp, "open-home-feed-preview"), "Preview entry click failed after clear");
  await waitFor(async () => (await textOfTestId(cdp, "home-location-entry")).includes("未设置城市"), "Unset city readback missing");
  await waitFor(async () => (await textOfTestId(cdp, "home-weather-module")).includes("设置地点后可查看天气"), "Locationless weather module missing");
  await waitFor(() => cdp.value(`(() => { const visible=${visible}; return ![...document.querySelectorAll("h2,span")].some(e=>visible(e)&&e.textContent.trim()==="账号与服务") && !document.querySelector('[data-overlay-layer]'); })()`), "Old settings transition or overlay remained visible");
  const locationlessWeatherText = await textOfTestId(cdp, "home-weather-module");
  assert(!/\d+°/.test(locationlessWeatherText), `Locationless weather leaked a fake temperature: ${locationlessWeatherText}`);
  assert(!/Zod|schema|fallback modes cannot expose weather values|invalid_type|\{\s*"/i.test(locationlessWeatherText), `Locationless weather exposed raw schema text: ${locationlessWeatherText}`);
  await cdp.value(`window.scrollTo(0,0)`);
  await settleVisual(cdp, 1200);
  await screenshot("05-clear-success-readback");

  adb(["shell", "input", "keyevent", "KEYCODE_HOME"]);
  await sleep(500);
  adb(["shell", "am", "start", "-W", "-n", `${packageName}/.MainActivity`]);
  await sleep(800);
  assert((await textOfTestId(cdp, "home-location-entry")).includes("未设置城市"), "Foreground restore lost cleared state");
  await settleVisual(cdp);
  await screenshot("06-foreground-restore");

  const trace = await traceEntries();
  const responses = {
    profileGets: trace.filter((entry) => entry.method === "GET" && entry.path === "/api/settings/location-profile").map((entry) => entry.status),
    profileDeletes: trace.filter((entry) => entry.method === "DELETE" && entry.path === "/api/settings/location-profile").map((entry) => entry.status),
    weatherOverviews: trace.filter((entry) => entry.method === "GET" && entry.path === "/api/weather/overview").map((entry) => entry.status),
  };
  assert(JSON.stringify(responses.profileDeletes.slice(deleteTraceOffset)) === JSON.stringify([503, 409, 200]), `Real DELETE sequence mismatch: ${responses.profileDeletes.join(",")}`);
  assert(JSON.stringify(responses.profileGets.slice(profileTraceOffset, profileTraceOffset + 3)) === JSON.stringify([503, 503, 200]), `Real location retry sequence mismatch: ${responses.profileGets.join(",")}`);

  const logcat = adb(["logcat", "-d", "-t", "1800"]);
  await writeFile(`${evidenceDir}/logcat.txt`, logcat);
  const fatalMatches = logcat.match(/FATAL EXCEPTION|Process: com\.wardrobe\.outfit|AndroidRuntime: FATAL/g) ?? [];
  const packageDump = adb(["shell", "dumpsys", "package", packageName]);
  const manifest = {
    scenario: "home-feed-p13-android-webview-adb-cdp",
    serial,
    androidRelease: adb(["shell", "getprop", "ro.build.version.release"]).trim(),
    androidSdk: adb(["shell", "getprop", "ro.build.version.sdk"]).trim(),
    packageName,
    installedVersionName: packageDump.match(/versionName=([^\s]+)/)?.[1] ?? null,
    installedVersionCode: Number(packageDump.match(/versionCode=(\d+)/)?.[1] ?? 0),
    responses,
    fixtureTrace: trace,
    cdpObservedResponses: cdpResponses,
    checks: {
      locationRetryObservedInThisRun: true,
      locationFailureText,
      systemBackBlockedWhilePendingAfterMs: 550,
      backdropBlockedWhilePendingAfterMs: 550,
      networkFailureRetainedSheet: true,
      networkFailureText,
      conflictRetainedSheetAndRetry: true,
      conflictText,
      successClosedAndReadBackUnset: true,
      locationlessWeatherText,
      foregroundRestore: true,
      fontScalePercent: 130,
      homeOverflow,
      settingsOverflow,
      criticalElements,
    },
    runtimeExceptions,
    loadingFailures,
    fatalCount: fatalMatches.length,
  };
  assert(runtimeExceptions.length === 0, `Runtime exceptions: ${JSON.stringify(runtimeExceptions)}`);
  assert(loadingFailures.length === 0, `Network loading failures: ${loadingFailures.join(" | ")}`);
  assert(fatalMatches.length === 0, `Fatal log entries: ${fatalMatches.length}`);
  await writeFile(`${evidenceDir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest));
} finally {
  cdp?.close();
  if (forwardPort) adb(["forward", "--remove", `tcp:${forwardPort}`]);
}
