import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

async function main() {
const root = join(process.cwd(), "out-website");
await mkdir(join(process.cwd(), "test-results/wardora-website"), { recursive: true });
const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8",
};

async function fileExists(path: string) {
  try { return (await stat(path)).isFile(); } catch { return false; }
}

const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  const relative = normalize(pathname).replace(/^[/\\]+/, "");
  const candidates = [join(root, relative), join(root, relative, "index.html")];
  let selected = pathname === "/" ? join(root, "index.html") : null;
  for (const candidate of candidates) if (!selected && await fileExists(candidate)) selected = candidate;
  const notFound = !selected || !selected.startsWith(root);
  selected = notFound ? join(root, "404.html") : selected;
  try {
    response.statusCode = notFound ? 404 : 200;
    response.setHeader("Content-Type", mimeTypes[extname(selected)] ?? "application/octet-stream");
    response.end(await readFile(selected));
  } catch {
    response.statusCode = 500;
    response.end("Static server error");
  }
});

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address === "object");
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });

try {
  for (const width of [375, 390, 430, 768, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const consoleErrors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });

    for (const route of ["/", "/privacy/", "/terms/", "/account-deletion/", "/contact/"]) {
      const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
      assert.equal(response?.status(), 200, `${route} should return 200 at ${width}px`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 0, `${route} has ${overflow}px horizontal overflow at ${width}px`);
      const emptyLinks = await page.locator('a[href=""], a:not([href])').count();
      assert.equal(emptyLinks, 0, `${route} contains empty links`);
    }

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    if (width <= 860) {
      const menu = page.locator("button.site-menu-button");
      assert.equal(await menu.getAttribute("aria-label"), "打开导航菜单");
      await menu.click();
      assert.equal(await menu.getAttribute("aria-expanded"), "true");
      await page.locator("#site-navigation a", { hasText: "隐私政策" }).click();
      await page.waitForURL(/\/privacy\/$/);
    }

    if (width === 390 || width === 1440) {
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await page.screenshot({ path: `test-results/wardora-website/home-${width}.png`, fullPage: true });
    }

    assert.deepEqual(consoleErrors, [], `console errors at ${width}px: ${consoleErrors.join(" | ")}`);
    const missingResponse = await page.goto(`${baseUrl}/missing-compliance-page/`, { waitUntil: "networkidle" });
    assert.equal(missingResponse?.status(), 404);
    await page.getByRole("heading", { name: "这一页没有记录" }).waitFor();
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

console.log("Wardora website responsive verification passed at 375, 390, 430, 768, 1024, and 1440px.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
