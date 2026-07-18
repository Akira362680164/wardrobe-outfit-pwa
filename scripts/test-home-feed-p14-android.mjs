import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

const serial = process.env.ANDROID_SERIAL ?? "emulator-5554";
const packageName = "com.wardrobe.outfit";
const evidenceDir = process.env.HOME_FEED_ANDROID_EVIDENCE ?? "test-results/home-feed-p14-android/20260718";
const fixtureOrigin = process.env.HOME_FEED_FIXTURE_ORIGIN ?? "http://127.0.0.1:4184";

function adb(args, encoding = "utf8") {
  return execFileSync("adb", ["-s", serial, ...args], { encoding, maxBuffer: 20 * 1024 * 1024 });
}

function assert(condition, message) { if (!condition) throw new Error(message); }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(condition, message, timeout = 25_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await sleep(140);
  }
  throw new Error(message);
}

class Cdp {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.listeners = new Map(); }
  async connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const callback = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) callback?.reject(new Error(message.error.message)); else callback?.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params);
    };
    await new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
  }
  on(method, listener) { const listeners = this.listeners.get(method) ?? []; listeners.push(listener); this.listeners.set(method, listeners); }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async value(expression) {
    const result = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "Runtime.evaluate failed");
    return result.result.value;
  }
  close() { this.ws?.close(); }
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

const testId = (id) => `document.querySelector(${JSON.stringify(`[data-testid="${id}"]`)})`;
async function hasTestId(cdp, id) { return cdp.value(`Boolean(${testId(id)} && getComputedStyle(${testId(id)}).display!=="none")`); }
async function clickTestId(cdp, id) { return cdp.value(`(() => { const e=${testId(id)}; if(!e)return false; e.click(); return true; })()`); }
async function clickText(cdp, text, last = false) { return cdp.value(`(() => { const es=[...document.querySelectorAll("button,a,[role=button]")].filter(e=>e.textContent.trim()===${JSON.stringify(text)}); const e=es[${last ? "es.length-1" : "0"}]; if(!e)return false; e.click(); return true; })()`); }
async function settle(cdp, ms = 220) { await cdp.value(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,${ms}))))`); }
async function screenshot(name) { await writeFile(`${evidenceDir}/${name}.png`, adb(["exec-out", "screencap", "-p"], "buffer")); }
async function setFixtureMode(mode) {
  const response = await fetch(`${fixtureOrigin}/__fixture/control`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "set-p14-mode", mode }) });
  assert(response.ok, `Fixture mode ${mode} failed`);
}

await mkdir(evidenceDir, { recursive: true });
adb(["shell", "pm", "clear", packageName]);
adb(["logcat", "-c"]);
adb(["shell", "am", "start", "-W", "-n", `${packageName}/.MainActivity`]);

let cdp;
let forwardPort;
const runtimeExceptions = [];
const loadingFailures = [];
try {
  ({ cdp, port: forwardPort } = await connectCdp());
  cdp.on("Runtime.exceptionThrown", (event) => runtimeExceptions.push(event.exceptionDetails?.text ?? "unknown"));
  cdp.on("Network.loadingFailed", (event) => { if (!event.canceled) loadingFailures.push(event.errorText ?? "unknown"); });
  await Promise.all(["Runtime.enable", "Network.enable", "Page.enable", "Log.enable"].map((method) => cdp.send(method)));

  await waitFor(() => cdp.value(`document.querySelectorAll("input").length>=3`), "Login form missing");
  await cdp.value(`(() => { const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set; const inputs=[...document.querySelectorAll("input")]; const email=inputs.find(e=>e.type==="text"||e.type==="email"); const password=inputs.find(e=>e.type==="password"); set.call(email,"fixture111@example.test"); email.dispatchEvent(new Event("input",{bubbles:true})); set.call(password,"FixturePassword123!"); password.dispatchEvent(new Event("input",{bubbles:true})); const check=inputs.find(e=>e.type==="checkbox"); if(check&&!check.checked)check.click(); })()`);
  assert(await clickText(cdp, "登录"), "Login button missing");
  await waitFor(() => clickText(cdp, "设置", true), "Settings tab missing");
  await waitFor(() => hasTestId(cdp, "open-home-feed-preview"), "Home preview entry missing");
  assert(await clickTestId(cdp, "open-home-feed-preview"), "Home preview click failed");
  await waitFor(() => hasTestId(cdp, "home-recommendation-card"), "Ready recommendation card missing");
  await waitFor(() => cdp.value(`document.querySelectorAll('[data-testid="home-recommendation-card"] img').length>=9`), "Real recommendation thumbnails missing");
  await settle(cdp, 600);

  const viewport = await cdp.value(`({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})`);
  assert(viewport.width >= 360 && viewport.width <= 430, `Unexpected Android equivalent width ${JSON.stringify(viewport)}`);
  const initial = await cdp.value(`(() => ({
    overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth,
    greeting: document.querySelector('h1')?.textContent,
    location: ${testId("home-location-entry")}?.textContent,
    cards: document.querySelectorAll('[data-testid="home-recommendation-card"]').length,
    images: [...document.querySelectorAll('[data-testid="home-recommendation-card"] img')].filter(i=>i.naturalWidth>0).length,
    touchAction: getComputedStyle(${testId("home-recommendation-rail")}).touchAction
  }))()`);
  assert(initial.overflow <= 1, `Android page overflow ${initial.overflow}`);
  assert(/早上好|中午好|下午好|晚上好/.test(initial.greeting ?? ""), "Time-semantic greeting missing");
  assert(initial.location.includes("上海 · 常驻"), "Authoritative location missing");
  assert(initial.cards === 3 && initial.images >= 9, `Ready candidates/images invalid ${JSON.stringify(initial)}`);
  assert(initial.touchAction.includes("pan-y"), `Vertical pan contract missing: ${initial.touchAction}`);
  await screenshot("00-ready-standard");

  assert(await clickTestId(cdp, "home-weather-tomorrow"), "Tomorrow weather card missing");
  await waitFor(() => cdp.value(`${testId("home-date-strip")}?.querySelector('[aria-pressed="true"]')?.textContent.includes("明天")`), "Tomorrow date did not select");
  await settle(cdp, 900);
  const tomorrowScrollTop = await cdp.value(`Math.max(document.scrollingElement.scrollTop,...[...document.querySelectorAll('*')].map(e=>e.scrollTop||0))`);
  assert(tomorrowScrollTop > 0, "Tomorrow switch did not scroll recommendation area into view");
  await screenshot("01-tomorrow-switch-scroll");

  await cdp.value(`(() => { const rail=${testId("home-recommendation-rail")}; rail.scrollLeft=rail.scrollWidth; return rail.scrollLeft; })()`);
  const horizontalScrollLeft = await cdp.value(`${testId("home-recommendation-rail")}.scrollLeft`);
  assert(horizontalScrollLeft > 0, "Native recommendation rail did not scroll horizontally");
  await cdp.value(`(() => { const roots=[document.scrollingElement,...document.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight+5); const root=roots.sort((a,b)=>(b.scrollHeight-b.clientHeight)-(a.scrollHeight-a.clientHeight))[0]; root.scrollTop+=180; })()`);
  const verticalScrollTop = await cdp.value(`Math.max(document.scrollingElement.scrollTop,...[...document.querySelectorAll('*')].map(e=>e.scrollTop||0))`);
  assert(verticalScrollTop >= tomorrowScrollTop, "Vertical page scroll was not preserved");
  await screenshot("02-horizontal-and-vertical-scroll");

  await cdp.value(`[document.scrollingElement,...document.querySelectorAll('*')].forEach(e=>e.scrollTop=0); ${testId("home-recommendation-rail")}.scrollLeft=0`);
  assert(await clickTestId(cdp, "home-location-entry"), "Location entry missing");
  await waitFor(() => hasTestId(cdp, "home-city-sheet"), "Location Sheet missing");
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  await waitFor(async () => !(await hasTestId(cdp, "home-city-sheet")), "System Back did not close location Sheet first");
  await screenshot("03-location-sheet-back");

  await cdp.value(`document.documentElement.style.fontSize="20.8px"; document.scrollingElement.scrollTop=0`);
  await settle(cdp, 400);
  const font130 = await cdp.value(`(() => { const t=${testId("home-weather-tomorrow")}; const r=t.getBoundingClientRect(); return {overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,tomorrowText:t.textContent,tomorrowWithin:r.left>=0&&r.right<=innerWidth}; })()`);
  assert(font130.overflow <= 1 && font130.tomorrowWithin && /\d+°\/\d+°/.test(font130.tomorrowText), `130% layout invalid ${JSON.stringify(font130)}`);
  await screenshot("04-ready-font130");

  adb(["shell", "input", "keyevent", "KEYCODE_HOME"]);
  await sleep(650);
  adb(["shell", "am", "start", "-W", "-n", `${packageName}/.MainActivity`]);
  await sleep(900);
  assert(await hasTestId(cdp, "wardora-home-feed"), "Foreground restore lost home feed");
  await screenshot("05-foreground-restore");

  async function reloadHomeFor(mode) {
    await setFixtureMode(mode);
    await cdp.value("location.reload()");
    await waitFor(() => clickText(cdp, "设置", true), `${mode}: Settings tab missing`);
    await waitFor(() => hasTestId(cdp, "open-home-feed-preview"), `${mode}: Home preview entry missing`);
    assert(await clickTestId(cdp, "open-home-feed-preview"), `${mode}: Home preview click failed`);
    await waitFor(() => hasTestId(cdp, "wardora-home-feed"), `${mode}: Home feed missing`);
    await settle(cdp, 1200);
  }

  await reloadHomeFor("travel");
  const travel = await cdp.value(`({location:${testId("home-location-entry")}.textContent,source:${testId("home-recommendation-source")}?.textContent,state:${testId("wardora-home-feed")}.dataset.homeState,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth})`);
  assert(travel.location.includes("北京 · 行程") && travel.source.includes("北京 · 行程") && travel.state === "home-ready-forecast" && travel.overflow <= 1, `Travel state invalid ${JSON.stringify(travel)}`);
  await screenshot("06-travel-authority");

  await reloadHomeFor("stale");
  await cdp.value('document.documentElement.style.fontSize="20.8px"');
  await settle(cdp, 300);
  const stale = await cdp.value(`({attribution:${testId("home-weather-attribution")}?.textContent,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth})`);
  assert(stale.attribution.includes("QWeather") && stale.attribution.includes("缓存") && stale.overflow <= 1, `Stale attribution invalid ${JSON.stringify(stale)}`);
  await screenshot("07-stale-font130");
  await cdp.value('document.documentElement.style.fontSize="16px"');

  await reloadHomeFor("protected-plan-with-date-strip");
  const protectedPlan = await cdp.value(`({plan:Boolean(${testId("home-protected-plan")}),risk:${testId("home-plan-availability-risk")}?.textContent,dateStrip:Boolean(${testId("home-plan-date-strip")}),snapshot:${testId("home-protected-plan")}?.textContent,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth})`);
  assert(protectedPlan.plan && protectedPlan.dateStrip && protectedPlan.risk && protectedPlan.snapshot.includes("已删除的旅行外套") && protectedPlan.overflow <= 1, `Protected plan state invalid ${JSON.stringify(protectedPlan)}`);
  await screenshot("08-protected-plan-date-strip");
  assert(await cdp.value(`(() => { const b=${testId("home-date-strip")}.querySelectorAll("button")[2]; b.click(); return true; })()`), "Third-day date button missing");
  await waitFor(() => cdp.value(`${testId("home-date-strip")}.querySelectorAll("button")[2].getAttribute("aria-pressed")==="true"`), "Third-day selection failed after protected plan");

  await reloadHomeFor("partial-weather-error");
  const partialWeather = await cdp.value(`({today:${testId("home-weather-today")}?.textContent,tomorrow:${testId("home-weather-tomorrow")}?.textContent,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth})`);
  assert(partialWeather.today.includes("31°") && partialWeather.tomorrow.includes("重试") && partialWeather.overflow <= 1, `Partial weather state invalid ${JSON.stringify(partialWeather)}`);
  await screenshot("09-partial-weather-error");
  assert(await cdp.value(`(() => { const b=${testId("home-weather-tomorrow")}?.querySelector("button"); if(!b)return false; b.click(); return true; })()`), "Tomorrow retry button missing");
  await waitFor(() => cdp.value(`${testId("home-weather-tomorrow")}?.textContent.includes("30°/22°")`), "Tomorrow retry did not recover");
  const partialWeatherRecovered = await cdp.value(`({today:${testId("home-weather-today")}?.textContent,tomorrow:${testId("home-weather-tomorrow")}?.textContent})`);
  assert(partialWeatherRecovered.today === partialWeather.today && partialWeatherRecovered.tomorrow.includes("30°/22°"), `Directed Android retry changed the wrong day ${JSON.stringify(partialWeatherRecovered)}`);
  await screenshot("10-partial-weather-recovered");

  const packageDump = adb(["shell", "dumpsys", "package", packageName]);
  const logcat = adb(["logcat", "-d", "-t", "1800"]);
  await writeFile(`${evidenceDir}/logcat.txt`, logcat);
  const fatalMatches = logcat.match(/FATAL EXCEPTION|AndroidRuntime: FATAL/g) ?? [];
  assert(runtimeExceptions.length === 0, `Runtime exceptions: ${runtimeExceptions.join(" | ")}`);
  assert(loadingFailures.length === 0, `Loading failures: ${loadingFailures.join(" | ")}`);
  assert(fatalMatches.length === 0, `Fatal entries: ${fatalMatches.length}`);
  const manifest = {
    scenario: "home-feed-p14-android-webview-adb-cdp",
    serial,
    androidRelease: adb(["shell", "getprop", "ro.build.version.release"]).trim(),
    androidSdk: adb(["shell", "getprop", "ro.build.version.sdk"]).trim(),
    packageName,
    installedVersionName: packageDump.match(/versionName=([^\s]+)/)?.[1] ?? null,
    installedVersionCode: Number(packageDump.match(/versionCode=(\d+)/)?.[1] ?? 0),
    viewport,
    initial,
    checks: { todayTomorrowSwitchAndScroll: true, horizontalScrollLeft, verticalScrollTop, locationSheetSystemBack: true, fontScalePercent: 130, font130, foregroundRestore: true, targetedP141: { travel, stale, protectedPlan, partialWeather, partialWeatherRecovered, thirdDayAfterProtectedPlan: true } },
    runtimeExceptions,
    loadingFailures,
    fatalCount: fatalMatches.length
  };
  await writeFile(`${evidenceDir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest));
} finally {
  cdp?.close();
  if (forwardPort) adb(["forward", "--remove", `tcp:${forwardPort}`]);
}
