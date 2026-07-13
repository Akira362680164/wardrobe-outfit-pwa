import assert from "node:assert/strict";
import http from "node:http";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function resolveSourcePath(path) {
  for (const suffix of ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"]) {
    const candidate = `${path}${suffix}`;
    if (existsSync(candidate)) return candidate;
  }
  return path;
}

const entry = `
  import React from "react";
  import { createRoot } from "react-dom/client";
  import { NavigationMotion } from "@/components/navigation-motion";
  import { useAppNavigationController } from "@/components/use-app-navigation-controller";

  const tabRoutes = {
    wardrobe: { name: "wardrobe_home" },
    recommend: { name: "outfit_home" },
    shopping: { name: "wishlist_home" },
    settings: { name: "settings_home" },
  };
  const labels = {
    wardrobe_home: "WARDROBE",
    outfit_home: "OUTFITS",
    wishlist_home: "WISHLIST",
    settings_home: "SETTINGS",
    garment_detail: "GARMENT DETAIL",
    intake_single_item: "INTAKE",
  };

  function Harness() {
    const navigation = useAppNavigationController();
    window.__c1 = {
      tab: (tab) => navigation.resetToMainTab(tab),
      pushDetail: () => navigation.openRoute({ name: "garment_detail", itemId: 42, returnTo: "wardrobe_home" }),
      pop: () => navigation.goBack(),
      handoff: () => {
        navigation.rememberCreateReturnRoute();
        const y = window.scrollY;
        document.body.style.position = "fixed";
        document.body.style.top = "-" + y + "px";
        document.body.style.left = "0";
        document.body.style.right = "0";
        navigation.openRoute({ name: "intake_single_item", returnTo: navigation.route.name });
      },
      closeHandoff: () => navigation.closeCreateFlow(),
      releaseLock: () => {
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.left = "";
        document.body.style.right = "";
      },
      route: navigation.route,
      transition: navigation.transition,
    };

    return <>
      <nav id="tabs">
        {Object.keys(tabRoutes).map((tab) => (
          <button key={tab} data-tab={tab} onClick={() => navigation.resetToMainTab(tab)}>{tab}</button>
        ))}
        <button id="push" onClick={() => navigation.openRoute({ name: "garment_detail", itemId: 42, returnTo: "wardrobe_home" })}>push</button>
        <button id="pop" onClick={() => navigation.goBack()}>pop</button>
      </nav>
      <NavigationMotion transition={navigation.transition}>
        <main className={"page page-" + navigation.route.name} data-route={navigation.route.name}>
          <h1>{labels[navigation.route.name]}</h1>
          <p>{navigation.transition.source} / {navigation.transition.direction}</p>
          <div className="marker">scroll continuity marker</div>
        </main>
      </NavigationMotion>
    </>;
  }

  createRoot(document.getElementById("root")).render(<Harness />);
`;

const bundle = await build({
  stdin: { contents: entry, loader: "tsx", resolveDir: root },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: "chrome120",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{
    name: "navigation-c1-aliases",
    setup(buildApi) {
      buildApi.onResolve({ filter: /^@\/lib\/diagnostic-log$/ }, (args) => ({ path: args.path, namespace: "c1-stub" }));
      buildApi.onResolve({ filter: /^@\// }, (args) => ({ path: resolveSourcePath(join(root, "src", args.path.slice(2))) }));
      buildApi.onLoad({ filter: /.*/, namespace: "c1-stub" }, () => ({
        contents: "export function recordDiagnosticEvent() {}",
        loader: "js",
      }));
    },
  }],
});

const js = bundle.outputFiles[0]?.text ?? "";
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 100%; min-height: 100%; font: 16px system-ui, sans-serif; background: #f4f1ea; }
  .grid { display: grid; }
  .relative { position: relative; }
  .min-w-0 { min-width: 0; }
  #tabs { position: fixed; inset: 12px 10px auto; z-index: 20; display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; padding: 6px; border-radius: 16px; background: rgba(255,255,255,.94); box-shadow: 0 8px 30px rgba(24,30,40,.15); }
  button { min-width: 0; height: 42px; border: 0; border-radius: 11px; background: #e2e8f0; color: #24384c; font-size: 10px; }
  .page { min-height: 1800px; padding: 90px 22px 30px; color: white; }
  .page h1 { margin: 0; font-size: 34px; letter-spacing: -.04em; }
  .page p { margin-top: 8px; opacity: .75; }
  .marker { margin-top: 520px; height: 180px; padding: 24px; border: 2px solid rgba(255,255,255,.8); border-radius: 22px; }
  .page-wardrobe_home { background: linear-gradient(180deg,#355c7d,#183249); }
  .page-outfit_home { background: linear-gradient(180deg,#7a5672,#442d43); }
  .page-wishlist_home { background: linear-gradient(180deg,#8b6247,#4e3424); }
  .page-settings_home { background: linear-gradient(180deg,#537160,#294236); }
  .page-garment_detail { background: linear-gradient(180deg,#2d6a72,#163b40); }
  .page-intake_single_item { background: linear-gradient(180deg,#755f2f,#3f3014); }
</style></head><body><div id="root"></div><script>${js}</script></body></html>`;

const server = http.createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address === "object");
const url = `http://127.0.0.1:${address.port}`;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

try {
  await page.goto(url);
  await page.locator('[data-navigation-presence="current"] [data-route="wardrobe_home"]').waitFor();

  await page.evaluate(() => window.scrollTo(0, 412));
  await page.locator('[data-tab="recommend"]').click();
  await page.locator('[data-navigation-presence="current"] [data-route="outfit_home"]').waitFor();
  assert.equal(await page.locator("[data-navigation-direction]").getAttribute("data-navigation-direction"), "tab");
  assert.equal(await page.evaluate(() => window.scrollY), 0);

  await page.evaluate(() => window.scrollTo(0, 188));
  await page.locator('[data-tab="shopping"]').click();
  await page.evaluate(() => window.scrollTo(0, 96));
  await page.locator('[data-tab="settings"]').click();
  await page.evaluate(() => window.scrollTo(0, 64));
  await page.locator('[data-tab="wardrobe"]').click();
  assert.equal(await page.evaluate(() => window.scrollY), 412);

  await page.evaluate(() => {
    window.__c1.tab("recommend");
    window.__c1.tab("shopping");
    window.__c1.tab("settings");
    window.__c1.tab("wardrobe");
  });
  await page.locator('[data-navigation-presence="current"] [data-route="wardrobe_home"]').waitFor();
  assert.equal(await page.locator('[data-navigation-presence="current"]').count(), 1);
  assert.equal(await page.evaluate(() => window.scrollY), 412);

  await page.evaluate(() => window.scrollTo(0, 520));
  await page.locator("#push").click();
  await page.locator('[data-navigation-presence="current"] [data-route="garment_detail"]').waitFor();
  assert.equal(await page.locator("[data-navigation-direction]").getAttribute("data-navigation-direction"), "push");
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  await page.evaluate(() => window.scrollTo(0, 75));
  await page.locator("#pop").click();
  await page.locator('[data-navigation-presence="current"] [data-route="wardrobe_home"]').waitFor();
  assert.equal(await page.locator("[data-navigation-direction]").getAttribute("data-navigation-direction"), "pop");
  assert.equal(await page.evaluate(() => window.scrollY), 520);

  await page.evaluate(() => {
    window.scrollTo(0, 620);
    window.__c1.handoff();
  });
  await page.locator('[data-navigation-presence="current"] [data-route="intake_single_item"]').waitFor();
  assert.match(await page.evaluate(() => document.body.style.top), /^-?0px$/);
  await page.evaluate(() => window.__c1.closeHandoff());
  await page.locator('[data-navigation-presence="current"] [data-route="wardrobe_home"]').waitFor();
  assert.equal(await page.evaluate(() => document.body.style.top), "-620px");
  await page.evaluate(() => window.__c1.releaseLock());
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(() => window.scrollY), 620);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.locator('[data-navigation-presence="current"] [data-route="wardrobe_home"]').waitFor();
  await page.evaluate(() => window.__c1.pushDetail());
  await page.locator('[data-navigation-presence="current"] [data-route="garment_detail"]').waitFor();
  const reducedTransform = await page.locator('[data-navigation-presence="current"]').evaluate((node) => getComputedStyle(node).transform);
  assert.ok(
    reducedTransform === "none" || reducedTransform === "matrix(1, 0, 0, 1, 0, 0)",
    `reduced-motion transform must be identity, got ${reducedTransform}`,
  );

  await page.screenshot({ path: "/tmp/wardrobe-c1-navigation-390.png", fullPage: false });
  await page.waitForTimeout(450);
  assert.equal(await page.locator('[data-navigation-presence="current"]').count(), 1);
  assert.deepEqual(consoleErrors, []);
  console.log("✅ C1 390x844 browser motion/scroll verification passed");
  console.log("   screenshot: /tmp/wardrobe-c1-navigation-390.png");
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
