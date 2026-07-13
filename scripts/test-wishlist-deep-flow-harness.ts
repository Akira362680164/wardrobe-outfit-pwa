import { strict as assert } from "node:assert";
import { createServer } from "node:http";
import { resolve } from "node:path";

import { build } from "esbuild";
import { chromium, type Page } from "playwright";

async function main() {
  const root = resolve(__dirname, "..");
  const entry = `
    import React, { useState } from "react";
    import { createRoot } from "react-dom/client";
    import { MotionProvider } from "./src/components/motion-provider";
    import {
      WishlistView20,
      armWishlistIntakeNavigationHandoff,
      captureWishlistIntakeNavigationHandoff,
      clearWishlistIntakeNavigationHandoff,
      consumeWishlistIntakeNavigationHandoff,
      hasPendingWishlistIntakeNavigationHandoff,
    } from "./src/components/wishlist-view-2.0";
    import { wardrobeRepository } from "./src/lib/repository/wardrobe-repository";
    import { buildColorInfo } from "./src/lib/color-fields";

    const now = "2026-07-13T08:00:00.000Z";
    const mainItems = Array.from({ length: 18 }, (_, index) => ({
      id: "main-" + index,
      name: "C3 商品 " + String(index + 1).padStart(2, "0"),
      category: "tops",
      colors: buildColorInfo("single", [index % 2 ? "蓝" : "白"]),
      seasons: ["spring", "autumn"],
      styles: ["casual"],
      formality: 3,
      warmth: 3,
      status: "interested",
      aiAssessment: { verdict: "worth_buying", score: 82, generatedAt: now },
      createdAt: now,
      updatedAt: now,
      serverEntityId: "server-main-" + index,
      serverRevision: 1,
    }));
    const purchasedItem = {
      id: "purchased-1",
      name: "C3 已买商品",
      category: "shoes",
      colors: buildColorInfo("single", ["黑"]),
      seasons: ["spring", "autumn"],
      styles: ["casual"],
      formality: 3,
      warmth: 2,
      status: "interested",
      convertedItemId: 501,
      convertedAt: now,
      createdAt: now,
      updatedAt: now,
      serverEntityId: "server-purchased-1",
      serverRevision: 1,
    };
    const wardrobeItems = [{
      id: 501,
      name: "已转衣橱商品",
      category: "shoes",
      colors: buildColorInfo("single", ["黑"]),
      seasons: ["spring", "autumn"],
      styles: ["casual"],
      formality: 3,
      warmth: 2,
      locationId: "home",
      status: "active",
      wornDates: [],
      createdAt: now,
      updatedAt: now,
      serverEntityId: "garment-501",
      serverRevision: 1,
    }];

    clearWishlistIntakeNavigationHandoff();
    let resolveConvert;
    let resolveEdit;
    let resolveUndo;
    wardrobeRepository.convertWishlistItem = () => new Promise((resolve) => { resolveConvert = resolve; });
    wardrobeRepository.updateWishlistItem = () => new Promise((resolve) => { resolveEdit = resolve; });
    wardrobeRepository.undoWishlistPurchase = () => new Promise((resolve) => { resolveUndo = resolve; });

    function Harness() {
      const [mountKey, setMountKey] = useState(0);
      const [wishlistItems, setWishlistItems] = useState([...mainItems, purchasedItem]);
      const [message, setMessage] = useState("");
      const remount = () => setMountKey((value) => value + 1);
      Object.assign(window, {
        c3ResolveConvert: (value) => resolveConvert?.(value),
        c3ResolveEdit: (value) => resolveEdit?.(value),
        c3ResolveUndo: (value) => resolveUndo?.(value),
        c3SeedHandoff: (snapshot) => {
          const token = captureWishlistIntakeNavigationHandoff(snapshot);
          armWishlistIntakeNavigationHandoff(token);
          return token;
        },
        c3ConsumeHandoff: consumeWishlistIntakeNavigationHandoff,
        c3HasHandoff: hasPendingWishlistIntakeNavigationHandoff,
        c3ClearHandoff: clearWishlistIntakeNavigationHandoff,
        c3Remount: remount,
      });
      return <MotionProvider>
        <div data-testid="harness-shell">
          <output data-testid="message">{message}</output>
          <div className="wishlist-host">
            <WishlistView20
              key={mountKey}
              wishlistItems={wishlistItems}
              setWishlistItems={setWishlistItems}
              items={wardrobeItems}
              locations={[{ id: "home", name: "默认衣橱", createdAt: now, updatedAt: now }, { id: "travel", name: "旅行衣橱", createdAt: now, updatedAt: now }]}
              outfits={[]}
              settings={{}}
              createTrigger={0}
              onPickIntakeImages={async () => []}
              onMessage={(next) => setMessage(next)}
              onExpandImage={() => {}}
              onNavigateToItem={async () => {}}
              onWishlistConvertedToWardrobe={async () => {}}
              onDataChanged={async () => {}}
            />
          </div>
        </div>
      </MotionProvider>;
    }

    createRoot(document.getElementById("root")).render(<React.StrictMode><Harness /></React.StrictMode>);
  `;

  const bundle = await build({
    stdin: {
      contents: entry,
      loader: "tsx",
      resolveDir: root,
      sourcefile: "c3-wishlist-deep-flow-harness.tsx",
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "chrome120",
    jsx: "automatic",
    write: false,
    tsconfig: resolve(root, "tsconfig.json"),
  });
  const script = bundle.outputFiles[0]?.text;
  assert.ok(script, "C3 Wishlist browser bundle must be generated");

  const html = `<!doctype html>
  <html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><style>
    * { box-sizing: border-box; }
    html, body, #root, [data-testid="harness-shell"], .wishlist-host { margin: 0; width: 390px; height: 844px; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    body { color: #1d2228; background: #f6f3ed; }
    button, input, textarea { font: inherit; }
    button { min-height: 36px; cursor: pointer; }
    [data-testid="message"] { position: fixed; z-index: 300; top: 2px; left: 8px; max-width: 360px; font-size: 11px; color: #8a2940; pointer-events: none; }
    .wishlist-host { padding: 20px 10px 10px; }
    [data-wishlist-navigation-direction], [data-wishlist-navigation-page] { height: 100%; min-height: 0; }
    [data-wishlist-navigation-page] { overflow: hidden; background: #fbfaf7; border-radius: 18px; padding: 8px; }
    [data-wishlist-scroll-region] { height: 620px; overflow-y: auto !important; overscroll-behavior: contain; }
    [data-wishlist-scroll-region="home"] button[aria-label^="C3 商品"] { display: block; min-height: 84px; width: 100%; margin: 8px 0; border: 1px solid #d5d8d5; border-radius: 14px; background: white; }
    [data-wishlist-scroll-region="purchased"] > div > div { min-height: 170px; margin: 8px 0; }
    [data-wishlist-navigation-page="detail"] main,
    [data-wishlist-navigation-page="add_edit"] main { height: 650px; overflow-y: auto; }
    [data-wishlist-navigation-page="convert_confirm"] { padding-top: 18px; }
    [data-wishlist-navigation-page="convert_confirm"] [data-wishlist-scroll-region] { height: 520px; }
    [data-overlay-layer] { position: fixed !important; inset: 0 !important; z-index: 500 !important; display: grid; place-items: center; padding: 18px; }
    [data-overlay-layer] > div[aria-hidden="true"] { position: absolute; inset: 0; background: rgba(29,34,40,.48); }
    [data-overlay-layer] [role="dialog"], [data-overlay-layer] [role="alertdialog"] { position: relative; z-index: 2; width: 100%; max-width: 360px; max-height: 720px; overflow-y: auto; border-radius: 18px; background: #fffdf9; padding: 16px; }
    [aria-label="图片预览"] { min-height: 160px; }
    [aria-label="图片预览"] img { display: block; width: 96px; height: 128px; object-fit: cover; }
  </style></head><body><div id="root"></div><script>${script}</script></body></html>`;

  const server = createServer((_, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: "networkidle" });
    assert.equal(await page.evaluate(() => window.innerWidth), 390);
    await waitForWishlistPage(page, "home");
    assert.deepEqual(errors, [], `Wishlist harness must mount cleanly: ${errors.join(" | ")}`);

    // One-shot remount handoff: first target consumes page/filter/scroll; the next mount is clean.
    await page.evaluate(() => {
      (window as any).c3SeedHandoff({ sourcePage: "home", mainFilter: "worth_buying", scrollTop: 226 });
      (window as any).c3Remount();
    });
    await waitForWishlistPage(page, "home");
    await page.waitForTimeout(80);
    assert.equal(await page.getByRole("button", { name: /建议买/ }).getAttribute("aria-pressed"), "true");
    assert.equal(await scrollTop(page, "home"), 226);
    assert.equal(await page.evaluate(() => (window as any).c3HasHandoff()), false, "first remount consumes handoff");
    await page.evaluate(() => (window as any).c3Remount());
    await waitForWishlistPage(page, "home");
    await page.waitForTimeout(80);
    assert.equal(await page.getByRole("button", { name: /全部/ }).getAttribute("aria-pressed"), "true");
    assert.equal(await scrollTop(page, "home"), 0, "repeated mount cannot reuse old scroll");

    // Home filter/scroll -> detail -> convert. Back is locked while converting; failure keeps location/source.
    await page.getByRole("button", { name: /建议买/ }).click();
    await setScrollTop(page, "home", 348);
    const savedHomeScroll = await scrollTop(page, "home");
    await page.evaluate(() => (document.querySelector('button[aria-label="C3 商品 09"]') as HTMLButtonElement).click());
    await waitForWishlistPage(page, "detail");
    assert.equal(await navigationDirection(page), "push");
    await page.getByRole("button", { name: "已买", exact: true }).click();
    await waitForWishlistPage(page, "convert_confirm");
    assert.equal(await navigationDirection(page), "push");
    await page.getByRole("button", { name: /默认衣橱/ }).click();
    await page.getByRole("button", { name: "旅行衣橱", exact: true }).click();
    await page.getByRole("button", { name: "确认加入衣橱", exact: true }).click();
    await page.waitForTimeout(40);
    await page.keyboard.press("Escape");
    await page.evaluate(() => (document.querySelector('[data-wishlist-navigation-page="convert_confirm"] button') as HTMLButtonElement).click());
    assert.equal(await currentWishlistPage(page), "convert_confirm", "busy conversion rejects Back and explicit back");
    await page.evaluate(() => (window as any).c3ResolveConvert({ ok: false, error: "C3 convert fail" }));
    await page.getByText("加入衣橱失败，请重试").waitFor();
    assert.equal(await currentWishlistPage(page), "convert_confirm");
    assert.ok(await page.getByRole("button", { name: /旅行衣橱/ }).isVisible(), "failed conversion keeps selected location");
    await page.getByRole("button", { name: /返回/ }).click();
    await waitForWishlistPage(page, "detail");
    assert.equal(await navigationDirection(page), "pop");
    await page.getByRole("button", { name: "返回", exact: true }).click();
    await waitForWishlistPage(page, "home");
    assert.equal(await page.getByRole("button", { name: /建议买/ }).getAttribute("aria-pressed"), "true");
    assert.equal(await scrollTop(page, "home"), savedHomeScroll, "detail pop restores filtered home scroll");

    // Edit save failure: Back stays locked while pending; failure retains new image and form values.
    await page.evaluate(() => (document.querySelector('button[aria-label="C3 商品 09"]') as HTMLButtonElement).click());
    await waitForWishlistPage(page, "detail");
    await page.getByRole("button", { name: "编辑", exact: true }).click();
    await waitForWishlistPage(page, "add_edit");
    const nameInput = page.getByPlaceholder("例如 白色乐福鞋");
    await nameInput.fill("失败后仍保留的名称");
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="64"><rect width="48" height="64" fill="#6f879b"/></svg>');
    await page.locator('input[type="file"]').setInputFiles({ name: "c3.svg", mimeType: "image/svg+xml", buffer: svg });
    await page.locator('[aria-label="图片预览"] img').waitFor();
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page.waitForTimeout(40);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "返回", exact: true }).click();
    assert.equal(await currentWishlistPage(page), "add_edit", "busy edit save rejects Escape and top back");
    await page.evaluate(() => (window as any).c3ResolveEdit({ ok: false, error: "C3 edit fail" }));
    await page.getByText("C3 edit fail").waitFor();
    await page.getByRole("button", { name: "保存", exact: true }).waitFor();
    await page.waitForTimeout(100);
    assert.equal(await nameInput.inputValue(), "失败后仍保留的名称");
    assert.ok(await page.locator('[aria-label="图片预览"] img').isVisible(), "failed save keeps selected image");
    await page.getByRole("button", { name: "返回", exact: true }).click();
    await page.waitForTimeout(150);
    const discardDialog = page.getByRole("alertdialog", { name: "放弃已修改的内容？" });
    assert.ok(await discardDialog.isVisible(), "dirty edit back opens discard confirmation");
    await page.getByRole("button", { name: "取消", exact: true }).click();
    assert.equal(await currentWishlistPage(page), "add_edit");
    await page.getByRole("button", { name: "返回", exact: true }).click();
    await page.getByRole("button", { name: "放弃", exact: true }).click();
    await waitForWishlistPage(page, "detail");
    assert.equal(await navigationDirection(page), "pop", "discard confirmation returns to source detail");
    await page.getByRole("button", { name: "返回", exact: true }).click();
    await waitForWishlistPage(page, "home");

    // Purchased list keeps its own scroll. Undo confirmation rejects Back/backdrop while pending and stays on failure.
    await page.getByTestId("wishlist-header-menu").click();
    await page.getByRole("menuitem", { name: /已买单品/ }).click();
    await waitForWishlistPage(page, "purchased");
    await setScrollTop(page, "purchased", 72);
    const purchasedScroll = await scrollTop(page, "purchased");
    await page.getByRole("button", { name: "撤销购买", exact: true }).click();
    await page.getByRole("alertdialog", { name: "撤销购买并恢复到种草？" }).waitFor();
    await page.getByRole("button", { name: "撤销购买", exact: true }).click();
    await page.waitForTimeout(40);
    await page.keyboard.press("Escape");
    await page.mouse.click(4, 4);
    assert.ok(await page.getByRole("alertdialog", { name: "撤销购买并恢复到种草？" }).isVisible(), "busy undo rejects Back/backdrop");
    await page.evaluate(() => (window as any).c3ResolveUndo({ ok: false, error: "C3 undo fail" }));
    await page.getByText("撤销购买失败").waitFor();
    const undoDialog = page.getByRole("alertdialog", { name: "撤销购买并恢复到种草？" });
    assert.ok(await undoDialog.isVisible(), "failed undo keeps retry confirmation");
    await page.getByRole("button", { name: "取消", exact: true }).click();
    await undoDialog.waitFor({ state: "hidden" });
    assert.equal(await currentWishlistPage(page), "purchased");
    assert.equal(await scrollTop(page, "purchased"), purchasedScroll, "undo overlay does not lose purchased scroll");

    const screenshotPath = "/tmp/wardrobe-c3-wishlist-deep-flow-390.png";
    await page.screenshot({ path: screenshotPath, fullPage: false });
    assert.deepEqual(errors, [], `C3 Wishlist harness must not raise page errors: ${errors.join(" | ")}`);
    console.log(`C3 Wishlist 390px deep-flow harness passed; screenshot: ${screenshotPath}`);
  } finally {
    await browser.close();
    await new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
  }
}

function currentPageSelector(pageName?: string): string {
  return `[data-wishlist-navigation-presence="current"]${pageName ? `[data-wishlist-navigation-page="${pageName}"]` : ""}`;
}

async function waitForWishlistPage(page: Page, pageName: string): Promise<void> {
  await page.locator(currentPageSelector(pageName)).waitFor({ state: "visible" });
  await page.waitForTimeout(30);
}

async function currentWishlistPage(page: Page): Promise<string | null> {
  return page.locator(currentPageSelector()).getAttribute("data-wishlist-navigation-page");
}

async function navigationDirection(page: Page): Promise<string | null> {
  return page.locator("[data-wishlist-navigation-direction]").getAttribute("data-wishlist-navigation-direction");
}

async function setScrollTop(page: Page, key: string, value: number): Promise<void> {
  await page.locator(`[data-wishlist-scroll-region="${key}"]`).evaluate((node, next) => {
    (node as HTMLElement).scrollTop = next;
  }, value);
}

async function scrollTop(page: Page, key: string): Promise<number> {
  return page.locator(`[data-wishlist-scroll-region="${key}"]`).evaluate((node) => (node as HTMLElement).scrollTop);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
