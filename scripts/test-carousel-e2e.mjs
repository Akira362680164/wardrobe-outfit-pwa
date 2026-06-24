// scripts/test-carousel-e2e.mjs
// Playwright browser e2e: carousel swipe, thumbnail, index clamp
// Usage: node scripts/test-carousel-e2e.mjs

import { chromium } from "playwright";

const BASE = "http://localhost:3000";

// Generate distinct dataURLs by varying a single byte
const makeImg = (n) =>
  `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYA${String.fromCharCode(65 + n)}AAAYAAjCB0C8AAAAASUVORK5CYII=`;

function makeSeedItems() {
  const now = new Date().toISOString();
  return [
    {
      name: "White T-shirt",
      imageDataUrl: makeImg(0),
      thumbnailDataUrl: makeImg(10),
      category: "top",
      primaryColors: ["White"],
      secondaryColors: [],
      seasons: ["all"],
      styles: ["casual"],
      formality: 2,
      warmth: 2,
      locationId: "home",
      status: "active",
      wornDates: [],
      createdAt: now,
      updatedAt: now,
      referenceOutfitImages: [
        { id: "ref-1", imageDataUrl: makeImg(1), thumbnailDataUrl: makeImg(11), createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z" },
        { id: "ref-2", imageDataUrl: makeImg(2), thumbnailDataUrl: makeImg(12), createdAt: "2026-06-02T00:00:00.000Z", updatedAt: "2026-06-02T00:00:00.000Z" },
      ],
    },
    {
      name: "Blue Jeans",
      imageDataUrl: makeImg(3),
      // No thumbnailDataUrl - test fallback
      category: "bottom",
      primaryColors: ["Blue"],
      secondaryColors: [],
      seasons: ["all"],
      styles: ["casual"],
      formality: 2,
      warmth: 3,
      locationId: "home",
      status: "active",
      wornDates: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      name: "Black Jacket",
      imageDataUrl: makeImg(4),
      thumbnailDataUrl: makeImg(14),
      category: "outerwear",
      primaryColors: ["Black"],
      secondaryColors: [],
      seasons: ["winter"],
      styles: ["casual"],
      formality: 3,
      warmth: 5,
      locationId: "home",
      status: "active",
      wornDates: [],
      createdAt: now,
      updatedAt: now,
      referenceOutfitImages: [
        { id: "ref-3", imageDataUrl: makeImg(5), createdAt: "2026-06-03T00:00:00.000Z", updatedAt: "2026-06-03T00:00:00.000Z" },
      ],
    },
  ];
}

let pass = 0;
let fail = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    pass++;
    console.log(`  PASS ${name}`);
  } else {
    fail++;
    const msg = detail ? ` - ${detail}` : "";
    failures.push(`${name}${msg}`);
    console.log(`  FAIL ${name}${msg}`);
  }
}

async function seedDb(page) {
  const items = makeSeedItems();
  await page.evaluate((seed) => {
    return new Promise((resolve, reject) => {
      const DBOpenRequest = indexedDB.open("wardrobe-outfit-pwa"); // open at current version
      DBOpenRequest.onsuccess = () => {
        const db = DBOpenRequest.result;
        const tx = db.transaction("items", "readwrite");
        const store = tx.objectStore("items");
        store.clear();
        for (const item of seed) {
          store.add(item);
        }
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      DBOpenRequest.onerror = () => reject(DBOpenRequest.error);
    });
  }, items);
  console.log("  Seeded IndexedDB with 3 items");
}

async function runTests(page) {
  // === Test 1: Homepage renders ===
  console.log("\n=== Test 1: Homepage render ===");
  const carousels = await page.$$('[role="region"]');
  check("Homepage has carousel regions", carousels.length > 0, `found ${carousels.length}`);

  const images = await page.$$("img");
  check("Homepage has images", images.length > 0, `found ${images.length}`);

  // === Test 2: Card swipe ===
  console.log("\n=== Test 2: Card swipe ===");
  if (carousels.length > 0) {
    const firstCarousel = carousels[0];
    const box = await firstCarousel.boundingBox();
    if (box) {
      const startX = box.x + box.width * 0.8;
      const startY = box.y + box.height / 2;
      const endX = box.x + box.width * 0.2;

      // Simulate swipe left
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      for (let i = 0; i < 5; i++) {
        await page.mouse.move(
          startX + ((endX - startX) / 5) * (i + 1),
          startY + Math.random() * 10,
        );
        await page.waitForTimeout(30);
      }
      await page.mouse.up();
      await page.waitForTimeout(600);
      check("Carousel still exists after swipe", (await page.$$('[role="region"]')).length > 0);
    } else {
      check("Card carousel boundingBox exists", false, "boundingBox is null");
    }
  }

  // === Test 3: Detail page carousel ===
  console.log("\n=== Test 3: Detail page carousel ===");
  // v0.9.44-dev: 新 Track carousel 中 off-screen 兄弟 visibility:hidden, 用 visible 选择器拿可点的 img
  const visibleImg = await page.locator("img:visible").first();
  const visibleCount = await visibleImg.count();
  if (visibleCount > 0) {
    await visibleImg.click();
    await page.waitForTimeout(1500);

    const detailCarousels = await page.$$('[aria-roledescription="carousel"]');
    check("Detail page has carousel", detailCarousels.length > 0, `found ${detailCarousels.length}`);

    // Check counter badge
    const counters = await page.$$("div");
    let counterFound = false;
    for (const el of counters) {
      const text = await el.textContent();
      if (text && /^\d+\/\d+$/.test(text.trim())) {
        counterFound = true;
        console.log(`  Counter badge: ${text.trim()}`);
        // Validate index <= total
        const parts = text.trim().split("/");
        const idx = parseInt(parts[0]);
        const total = parseInt(parts[1]);
        check("Counter index <= total", idx <= total && idx >= 1, `${idx}/${total}`);
        break;
      }
    }
    if (!counterFound) {
      console.log("  (No counter badge found - may be single-image)");
    }

    // Detail swipe
    if (detailCarousels.length > 0) {
      const detailBox = await detailCarousels[0].boundingBox();
      if (detailBox) {
        await page.mouse.move(detailBox.x + detailBox.width * 0.8, detailBox.y + detailBox.height / 2);
        await page.mouse.down();
        for (let i = 0; i < 5; i++) {
          await page.mouse.move(
            detailBox.x + detailBox.width * 0.8 - (detailBox.width * 0.6 / 5) * (i + 1),
            detailBox.y + detailBox.height / 2 + Math.random() * 10,
          );
          await page.waitForTimeout(20);
        }
        await page.mouse.up();
        await page.waitForTimeout(800);
        check("Carousel exists after detail swipe", (await page.$$('[aria-roledescription="carousel"]')).length > 0);
      }
    }

    // Go back
    await page.goBack();
    await page.waitForTimeout(1000);
  } else {
    console.log("  No clickable images, skipping detail tests");
  }

  // === Test 4: Index clamp ===
  console.log("\n=== Test 4: Index clamp ===");
  const clampResult = await page.evaluate(() => {
    const counterTexts = [];
    const divs = document.querySelectorAll("div");
    divs.forEach((d) => {
      const text = d.textContent ? d.textContent.trim() : "";
      if (/^\d+\/\d+$/.test(text)) {
        counterTexts.push(text);
      }
    });
    // Also check aria-labels
    const ariaLabels = [];
    const regions = document.querySelectorAll('[role="region"]');
    regions.forEach((el) => {
      const aria = el.getAttribute("aria-label");
      if (aria) ariaLabels.push(aria);
    });
    return { ariaLabels, counterTexts };
  });

  let clampOk = true;
  for (const c of clampResult.counterTexts) {
    if (!c) continue;
    const match = c.match(/^(\d+)\/(\d+)$/);
    if (match) {
      const idx = parseInt(match[1], 10);
      const total = parseInt(match[2], 10);
      if (idx < 1 || idx > total) {
        clampOk = false;
        console.log(`  Bad counter: ${c}`);
      }
    }
  }
  check("All carousel counters valid (no overflow)", clampOk, `counters: ${clampResult.counterTexts.join(", ")}`);

  // === Test 5: No blank images ===
  console.log("\n=== Test 5: No blank images ===");
  const allImgData = await page.$$eval("img", (els) =>
    els.map((el) => ({
      src: el.src.slice(0, 60),
      complete: el.complete,
      naturalWidth: el.naturalWidth,
    })),
  );
  const broken = allImgData.filter((img) => img.complete && img.naturalWidth === 0 && !img.src.startsWith("blob:"));
  check("No broken images (naturalWidth > 0)", broken.length === 0, `broken: ${broken.length}`);

  // === Test 6: Thumbnail fallback ===
  console.log("\n=== Test 6: Thumbnail src check ===");
  const emptySrcs = await page.$$eval("img", (els) =>
    els.filter((el) => !el.src || el.src === "undefined" || el.src === ""),
  );
  check("No empty/undefined img src", emptySrcs.length === 0, `empty: ${emptySrcs.length}`);

  // === Test 7: Multi-image preview thumbnail test ===
  console.log("\n=== Test 7: Long-press to multi-select ===");
  // Find and click the multi-select toggle button if available
  const multiSelectBtns = await page.$$("button");
  let mstClicked = false;
  for (const btn of multiSelectBtns) {
    const text = await btn.textContent();
    const aria = await btn.getAttribute("aria-label");
    if ((text && text.includes("select")) || (aria && /select|multi/i.test(aria))) {
      await btn.click();
      mstClicked = true;
      await page.waitForTimeout(500);
      break;
    }
  }
  if (!mstClicked) {
    console.log("  (No multi-select button found - may need tap+hold activation)");
  }

  console.log(`\n=== Total: ${pass} pass / ${fail} fail ===`);
  if (fail > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
}

async function main() {
  console.log("\nPlaywright Carousel E2E Tests");
  console.log("==============================\n");

  // Check dev server
  try {
    const resp = await fetch(BASE);
    console.log(`Dev server online (status=${resp.status})`);
  } catch {
    console.error(`Cannot connect to ${BASE} - start npm run dev first`);
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
  });
  const page = await context.newPage();

  try {
    // Navigate to app origin first (IndexedDB needs a real origin)
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);

    // Seed data via page.evaluate (now has IndexedDB permission)
    await seedDb(page);

    // Reload so app picks up seeded data
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(3000);

    // Wait for carousel or any content
    try {
      await page.waitForSelector('[role="region"]', { timeout: 8000 });
    } catch {
      console.log("  No [role=region] found, continuing anyway...");
    }

    await runTests(page);
  } catch (e) {
    console.error("Test error:", e);
    fail++;
    failures.push(`Error: ${e.message}`);
  } finally {
    await browser.close();
  }

  if (fail > 0) {
    console.log("\nTests FAILED");
    process.exit(1);
  }
  console.log("\nAll carousel E2E tests PASSED");
}

main();
