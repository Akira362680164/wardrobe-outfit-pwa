import assert from "node:assert/strict";
import http from "node:http";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function resolveSourcePath(path) {
  for (const suffix of [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", ""]) {
    const candidate = `${path}${suffix}`;
    if (existsSync(candidate)) return candidate;
  }
  return path;
}

const entry = `
  import React, { useRef, useState } from "react";
  import { createRoot } from "react-dom/client";
  import {
    OutfitDeepFlowMotion,
    resolveOutfitSubPageBackTarget,
  } from "@/components/outfit-list-view";

  const zeroScroll = Object.freeze({ windowY: 0, regionY: 0 });

  function Page({ page }) {
    return <section className={"page page-" + page} data-harness-page={page}>
      <header><strong>{page}</strong></header>
      <div className="scroll-region" data-outfit-scroll-region={page}>
        <label>Draft <input defaultValue={page + " draft"} /></label>
        <div className="scroll-marker">{page} scroll marker</div>
      </div>
    </section>;
  }

  function Harness() {
    const initial = {
      id: 0,
      from: "library",
      to: "library",
      direction: "replace",
      scrollKey: "library",
      restoreScroll: zeroScroll,
    };
    const [transition, setTransition] = useState(initial);
    const transitionRef = useRef(initial);
    const positionsRef = useRef(new Map());

    const navigate = (to, direction) => {
      const current = transitionRef.current;
      if (current.to === to) return;
      const currentNode = document.querySelector('[data-outfit-deep-presence="current"]');
      if (currentNode?.dataset.outfitDeepPage === current.to) {
        positionsRef.current.set(current.scrollKey, {
          windowY: window.scrollY,
          regionY: currentNode.querySelector("[data-outfit-scroll-region]")?.scrollTop ?? 0,
        });
      }
      const next = {
        id: current.id + 1,
        from: current.to,
        to,
        direction,
        scrollKey: to,
        restoreScroll: positionsRef.current.get(to) ?? zeroScroll,
      };
      transitionRef.current = next;
      setTransition(next);
    };

    const back = () => {
      const target = resolveOutfitSubPageBackTarget(transitionRef.current.to);
      if (target) navigate(target, "pop");
    };

    window.__c3Outfit = {
      navigate,
      back,
      rapidBack: (count) => {
        for (let index = 0; index < count; index += 1) back();
      },
      rapidPush: () => {
        navigate("planning_calendar", "push");
        navigate("plan_add", "push");
        navigate("plan_detail", "push");
      },
      current: () => transitionRef.current,
    };

    return <OutfitDeepFlowMotion transition={transition}>
      <Page page={transition.to} />
    </OutfitDeepFlowMotion>;
  }

  createRoot(document.getElementById("root")).render(<Harness />);
`;

const stubs = new Map([
  ["@capacitor/app", `export const App = { addListener: async () => ({ remove() {} }) };`],
  ["@capacitor/camera", `export const Camera = {}; export const CameraResultType = {}; export const CameraSource = {};`],
]);

const bundle = await build({
  stdin: { contents: entry, loader: "tsx", resolveDir: root },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: "chrome120",
  jsx: "automatic",
  treeShaking: true,
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{
    name: "c3-outfit-harness-aliases",
    setup(buildApi) {
      buildApi.onResolve({ filter: /^@capacitor\/(app|camera)$/ }, (args) => ({ path: args.path, namespace: "c3-stub" }));
      buildApi.onResolve({ filter: /^@\// }, (args) => ({ path: resolveSourcePath(join(root, "src", args.path.slice(2))) }));
      buildApi.onLoad({ filter: /.*/, namespace: "c3-stub" }, (args) => ({
        contents: stubs.get(args.path),
        loader: "js",
      }));
    },
  }],
});

const js = bundle.outputFiles[0]?.text ?? "";
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 100%; min-height: 100%; font: 16px system-ui, sans-serif; background: #f5f1e9; }
  #root { width: 390px; min-height: 844px; overflow-x: hidden; }
  .grid { display: grid; }
  .relative { position: relative; }
  .min-w-0 { min-width: 0; }
  .page { min-height: 844px; padding: 18px; color: #1e3346; }
  .page header { height: 64px; padding: 18px; border-radius: 20px; background: rgba(255,255,255,.86); }
  .scroll-region { height: 690px; margin-top: 14px; overflow-y: auto; overscroll-behavior: contain; border-radius: 24px; background: rgba(255,255,255,.82); padding: 18px; }
  .scroll-region input { display: block; width: 100%; height: 44px; margin-top: 8px; }
  .scroll-marker { height: 1250px; margin-top: 30px; padding-top: 600px; border-top: 2px solid #547793; }
  .page-library { background: linear-gradient(180deg,#dbe8ee,#adc8d7); }
  .page-planning_calendar { background: linear-gradient(180deg,#e8dfd1,#d2bfa5); }
  .page-plan_add { background: linear-gradient(180deg,#e5e0ed,#c9bddb); }
  .page-plan_detail { background: linear-gradient(180deg,#dce9df,#b7cfbd); }
  .page-packing_list { background: linear-gradient(180deg,#e8e2cf,#d4c390); }
</style></head><body><div id="root"></div><script>${js}</script></body></html>`;

const server = http.createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address === "object");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

async function waitForCurrent(pageName) {
  await page.locator(`[data-outfit-deep-presence="current"][data-outfit-deep-page="${pageName}"]`).waitFor();
}

async function setRegionScroll(value) {
  await page.locator('[data-outfit-deep-presence="current"] [data-outfit-scroll-region]').evaluate((node, next) => {
    node.scrollTop = next;
  }, value);
}

async function getRegionScroll() {
  return page.locator('[data-outfit-deep-presence="current"] [data-outfit-scroll-region]').evaluate((node) => node.scrollTop);
}

async function getTranslateX(locator) {
  return locator.evaluate((node) => {
    const transform = getComputedStyle(node).transform;
    if (transform === "none") return 0;
    return new DOMMatrixReadOnly(transform).m41;
  });
}

try {
  await page.goto(`http://127.0.0.1:${address.port}`);
  await waitForCurrent("library");
  assert.equal(await page.evaluate(() => window.innerWidth), 390);
  await setRegionScroll(133);

  await page.evaluate(() => window.__c3Outfit.navigate("planning_calendar", "push"));
  await waitForCurrent("planning_calendar");
  assert.equal(await page.locator("[data-outfit-deep-flow]").getAttribute("data-outfit-deep-direction"), "push");
  const exiting = page.locator('[data-outfit-deep-presence="exiting"]');
  assert.ok(await exiting.count() <= 1);
  if (await exiting.count()) {
    assert.equal(await exiting.getAttribute("aria-hidden"), "true");
    assert.equal(await exiting.evaluate((node) => node.inert), true);
    await page.waitForTimeout(50);
    assert.ok(await getTranslateX(exiting) < 0, "push must move the exiting page backward");
  }
  await page.waitForTimeout(420);
  await setRegionScroll(171);

  await page.evaluate(() => window.__c3Outfit.navigate("plan_add", "push"));
  await waitForCurrent("plan_add");
  await setRegionScroll(93);
  await page.evaluate(() => window.__c3Outfit.navigate("plan_detail", "push"));
  await waitForCurrent("plan_detail");
  await setRegionScroll(237);
  await page.evaluate(() => window.__c3Outfit.navigate("packing_list", "push"));
  await waitForCurrent("packing_list");
  await setRegionScroll(319);

  await page.evaluate(() => window.__c3Outfit.back());
  await waitForCurrent("plan_detail");
  const popExiting = page.locator('[data-outfit-deep-presence="exiting"][data-outfit-deep-page="packing_list"]');
  if (await popExiting.count()) {
    await page.waitForTimeout(50);
    assert.ok(await getTranslateX(popExiting) > 0, "pop must move the exiting page toward the right edge");
  }
  assert.equal(await getRegionScroll(), 237, "plan detail scroll must restore on packing pop");

  await page.evaluate(() => window.__c3Outfit.rapidBack(2));
  await waitForCurrent("library");
  assert.equal(await getRegionScroll(), 133, "rapid pop must restore the original library scroll");
  await page.waitForTimeout(450);
  assert.equal(await page.locator('[data-outfit-deep-presence="current"]').count(), 1);

  await page.evaluate(() => window.__c3Outfit.rapidPush());
  await waitForCurrent("plan_detail");
  assert.equal((await page.evaluate(() => window.__c3Outfit.current())).to, "plan_detail");
  await page.waitForTimeout(450);
  assert.equal(await page.locator('[data-outfit-deep-presence="current"]').count(), 1);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await waitForCurrent("library");
  await page.evaluate(() => window.__c3Outfit.navigate("planning_calendar", "push"));
  await waitForCurrent("planning_calendar");
  const transform = await page.locator('[data-outfit-deep-presence="current"]').evaluate((node) => getComputedStyle(node).transform);
  assert.ok(transform === "none" || transform === "matrix(1, 0, 0, 1, 0, 0)", `reduced-motion transform must be identity, got ${transform}`);

  await page.screenshot({ path: "/tmp/wardrobe-c3-outfit-deep-flow-390.png", fullPage: false });
  assert.deepEqual(consoleErrors, []);
  console.log("C3-Outfit 390x844 deep-flow/scroll/rapid-back harness passed");
  console.log("screenshot: /tmp/wardrobe-c3-outfit-deep-flow-390.png");
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
