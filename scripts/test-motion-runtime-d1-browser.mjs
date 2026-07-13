import assert from "node:assert/strict";
import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
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
  import React, { useRef, useState } from "react";
  import { createRoot } from "react-dom/client";
  import { MotionProvider } from "@/components/motion-provider";
  import { AiTaskProgressCard, MotionPopoverMenu, MotionSheet } from "@/components/motion-common";

  function Harness() {
    const [sheetOpen, setSheetOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const menuAnchorRef = useRef(null);
    return <MotionProvider>
      <main id="app-content">
        <h1>D1 Runtime</h1>
        <div id="material" className="surface">material</div>
        <button id="press" className="app-press-feedback">press</button>
        <button id="open-sheet" onClick={() => setSheetOpen(true)}>open sheet</button>
        <button id="open-menu" ref={menuAnchorRef} onClick={() => setMenuOpen(true)}>open menu</button>
        <AiTaskProgressCard visible label="AI 识别" stage="正在分析图片" progress={42} />
      </main>
      <MotionSheet open={sheetOpen} onClose={() => setSheetOpen(false)} ariaLabel="运行时测试面板">
        <button id="close-sheet" onClick={() => setSheetOpen(false)}>close</button>
      </MotionSheet>
      <MotionPopoverMenu visible={menuOpen} onClose={() => setMenuOpen(false)} ariaLabel="运行时测试菜单" anchorRef={menuAnchorRef}>
        <button id="menu-action" onClick={() => setMenuOpen(false)}>action</button>
      </MotionPopoverMenu>
    </MotionProvider>;
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
    name: "motion-runtime-d1-aliases",
    setup(buildApi) {
      buildApi.onResolve({ filter: /^@\// }, (args) => ({ path: resolveSourcePath(join(root, "src", args.path.slice(2))) }));
    },
  }],
});

const js = bundle.outputFiles[0]?.text ?? "";
const globals = readFileSync(join(root, "src/app/globals.css"), "utf8");
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
${globals}
html,body,#root { margin:0; min-height:100%; }
body { padding:16px; }
button { min-height:44px; margin:6px; }
.surface { min-height:80px; padding:16px; }
.fixed { position:fixed; }.absolute { position:absolute; }.relative { position:relative; }
.inset-0 { inset:0; }.bottom-0 { bottom:0; }.inset-x-0 { left:0; right:0; }
.grid { display:grid; }.flex { display:flex; }.contents { display:contents; }
.place-items-center { place-items:center; }.w-full { width:100%; }.max-w-lg { max-width:32rem; }
.bg-paper { background:rgb(251 251 248); }.bg-ink\\/40 { background:rgba(29,34,40,.4); }
.p-4 { padding:1rem; }.rounded-2xl { border-radius:1rem; }.outline-none { outline:none; }
.sr-only { position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0; }
[data-overlay-variant] { background:rgb(251 251 248); padding:20px; }
</style></head><body><div id="root"></div><script>${js}</script></body></html>`;

const server = http.createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address === "object");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  userAgent: "Mozilla/5.0 (Linux; Android 14; D1-Low-End) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
});
await context.addInitScript(() => {
  Object.defineProperty(navigator, "hardwareConcurrency", { configurable: true, get: () => 4 });
  Object.defineProperty(navigator, "deviceMemory", { configurable: true, get: () => 4 });
});
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

try {
  await page.goto(`http://127.0.0.1:${address.port}`);
  await page.locator("#material").waitFor();
  assert.equal(await page.evaluate(() => window.innerWidth), 390);
  assert.equal(await page.locator("html").getAttribute("data-motion-effects"), "reduced");
  assert.equal(await page.locator("#material").evaluate((node) => getComputedStyle(node).backdropFilter), "none");

  await page.evaluate(() => document.documentElement.setAttribute("data-high-contrast", ""));
  const highContrastBorder = await page.locator("#material").evaluate((node) => getComputedStyle(node).borderColor);
  assert.match(highContrastBorder, /rgba?\(29, 34, 40/);
  await page.evaluate(() => {
    document.documentElement.removeAttribute("data-high-contrast");
    document.documentElement.setAttribute("data-reduced-transparency", "");
  });
  assert.equal(await page.locator("#material").evaluate((node) => getComputedStyle(node).backdropFilter), "none");

  await page.locator("#open-sheet").tap();
  const sheet = page.getByRole("dialog", { name: "运行时测试面板" });
  await sheet.waitFor();
  assert.equal(await page.locator("#app-content").evaluate((node) => node.closest("[data-overlay-app-content]")?.hasAttribute("inert")), true);
  assert.equal(await page.evaluate(() => document.activeElement?.id), "close-sheet");
  await page.keyboard.press("Escape");
  await sheet.waitFor({ state: "detached" });

  await page.locator("#open-menu").tap();
  const menu = page.getByRole("menu", { name: "运行时测试菜单" });
  await menu.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.id), "menu-action");
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "detached" });

  const progress = page.getByRole("progressbar", { name: "AI 识别进度" });
  assert.equal(await progress.getAttribute("aria-valuenow"), "42");
  assert.equal(await progress.getAttribute("aria-valuetext"), "正在分析图片");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.locator("#open-sheet").tap();
  const reducedSheet = page.getByRole("dialog", { name: "运行时测试面板" });
  await reducedSheet.waitFor();
  const reducedTransforms = await reducedSheet.evaluate((node) => [
    getComputedStyle(node).transform,
    ...node.getAnimations().flatMap((animation) => animation.effect?.getKeyframes?.().map((frame) => frame.transform) ?? []),
  ]);
  assert.ok(reducedTransforms.every((value) => !value || value === "none"), `reduced sheet must be opacity-only: ${reducedTransforms}`);
  await page.keyboard.press("Escape");
  await reducedSheet.waitFor({ state: "detached" });

  assert.equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true);
  assert.equal(await page.locator("#press").evaluate((node) => getComputedStyle(node).scale), "none");
  const reducedPressOpacity = await page.evaluate(() => {
    const visit = (rules) => {
      for (const rule of rules) {
        if (rule instanceof CSSMediaRule) {
          if (rule.conditionText.includes("prefers-reduced-motion") && matchMedia(rule.conditionText).matches) {
            const nested = visit(rule.cssRules);
            if (nested) return nested;
          }
          continue;
        }
        if (rule instanceof CSSStyleRule && rule.selectorText.includes(".app-press-feedback:active")) {
          return rule.style.opacity;
        }
      }
      return "";
    };
    for (const sheet of document.styleSheets) {
      const value = visit(sheet.cssRules);
      if (value) return value;
    }
    return "";
  });
  assert.equal(reducedPressOpacity, "0.78");

  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.deepEqual(consoleErrors, []);
  await page.screenshot({ path: "/tmp/wardrobe-motion-d1-runtime-390.png", fullPage: false });
  console.log("motion D1 runtime 390px preference harness passed");
  console.log("screenshot: /tmp/wardrobe-motion-d1-runtime-390.png");
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
