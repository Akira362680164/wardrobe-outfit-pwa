import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = join(__dirname, "..");
const outDir = join(root, "docs/designs/v0.3-alpha");
const dataPath = join(outDir, "visual-review-data.json");
const htmlPath = join(outDir, "visual-review.html");
const manifestPath = join(outDir, "live-capture-manifest.json");
const cssPath = join(outDir, "assets/visual-review.css");
const jsPath = join(outDir, "assets/visual-review.js");
const captureScriptPath = join(root, "scripts/capture-v03-alpha-screenshots.ts");
const captureSpecPath = join(root, "e2e/specs/v03-alpha-live-capture.spec.ts");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function pngSize(path: string): { width: number; height: number } {
  const buffer = readFileSync(path);
  const signature = buffer.subarray(0, 8).toString("hex");
  assert.equal(signature, "89504e470d0a1a0a", `${path} is not a PNG`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

for (const path of [dataPath, htmlPath, manifestPath, cssPath, jsPath, captureScriptPath, captureSpecPath]) {
  assert.ok(existsSync(path), `missing ${path}`);
}

const data = JSON.parse(read(dataPath));
const manifest = JSON.parse(read(manifestPath));
const html = read(htmlPath);
const css = read(cssPath);
const js = read(jsPath);
const captureScript = read(captureScriptPath);
const captureSpec = read(captureSpecPath);

assert.equal(data.version, "v0.3-alpha");
assert.equal(data.resolution.width, 390);
assert.equal(data.resolution.height, 844);
assert.equal(data.source, "live_business_flow");
assert.equal(data.states.length, 14, "v0.3-alpha must keep exactly 14 states");
assert.ok(data.captureManifestAvailable, "generated data must include live capture manifest evidence");
assert.equal(manifest.source, "live_business_flow");
assert.equal(manifest.resolution.width, 390);
assert.equal(manifest.resolution.height, 844);
assert.equal(manifest.captures.length, 21, "live flow must produce 21 viewport screenshots");

const stateIds = data.states.map((state: { id: string }) => state.id);
assert.ok(stateIds.includes("intake_single_step1_imported"), "image import state must be captured after selecting images");
assert.ok(!stateIds.includes("image_source_sheet"), "old image source sheet state is not part of the current formal flow");

const requiredStates = [
  "auth_login",
  "auth_register",
  "settings_home",
  "intake_single_step1_empty",
  "intake_single_step1_imported",
  "intake_single_confirm",
  "wardrobe_home",
  "garment_detail",
  "confirm_delete_sheet",
  "outfit_home",
  "outfit_detail",
  "outfit_calendar",
  "wishlist_home",
  "wishlist_detail",
];
assert.deepEqual(stateIds, requiredStates, "state order documents the serial live business flow");

const longPageSegments: Record<string, string[]> = {
  garment_detail: ["top", "info", "bottom"],
  outfit_detail: ["top", "info", "bottom"],
  wishlist_detail: ["top", "info", "bottom"],
  intake_single_confirm: ["top", "bottom"],
};

let segmentCount = 0;
for (const state of data.states) {
  assert.ok(state.title, `${state.id} missing title`);
  assert.ok(state.module, `${state.id} missing module`);
  assert.ok(state.type, `${state.id} missing type`);
  assert.ok(Array.isArray(state.aiFindings) && state.aiFindings.length >= 3, `${state.id} needs at least 3 AI findings`);
  if (longPageSegments[state.id]) {
    assert.deepEqual(state.segments.map((segment: { id: string }) => segment.id), longPageSegments[state.id], `${state.id} segments mismatch`);
    for (const segmentId of longPageSegments[state.id]) {
      assert.ok(
        state.aiFindings.some((finding: { segment: string }) => finding.segment === segmentId),
        `${state.id} missing AI finding for ${segmentId}`,
      );
    }
  }
  for (const segment of state.segments) {
    segmentCount += 1;
    assert.ok(segment.screenshot.endsWith(`${state.id}_390_${segment.id}.png`), `${state.id}/${segment.id} screenshot name mismatch`);
    const screenshotPath = join(outDir, segment.screenshot);
    assert.ok(existsSync(screenshotPath), `missing screenshot ${segment.screenshot}`);
    assert.deepEqual(pngSize(screenshotPath), { width: 390, height: 844 }, `${segment.screenshot} must be 390x844`);
    assert.ok(
      manifest.captures.some((capture: { stateId: string; segment: string; filename: string }) =>
        capture.stateId === state.id && capture.segment === segment.id && capture.filename === segment.screenshot),
      `manifest missing capture evidence for ${state.id}/${segment.id}`,
    );
  }
}
assert.equal(segmentCount, 21, "state segments must map to 21 screenshots");

for (const needle of [
  "DO NOT EDIT BY HAND",
  "visual-review-data",
  "导出 JSON",
  "导出 Markdown",
  "清空本地意见",
  "390×844",
]) {
  assert.ok(html.includes(needle), `html missing ${needle}`);
}

for (const needle of [
  "phone-shell",
  "target-top-bar",
  "target-bottom-nav",
  "target-card",
  "target-hero-image",
  "target-section-card",
  "target-button-primary",
  "target-button-secondary",
  "target-input",
  "target-chip",
  "target-color-swatch",
  "target-sheet",
  "target-auth-card",
  "target-calendar",
  "target-intake-shell",
  "target-detail-top",
  "target-detail-info",
  "target-detail-bottom",
]) {
  assert.ok(css.includes(needle), `css missing target baseline class ${needle}`);
}

for (const needle of [
  "localStorage",
  "v03-alpha-human-review.json",
  "v03-alpha-human-review.md",
  "segmentNotes",
  "reviewStatus",
  "betaInstruction",
]) {
  assert.ok(js.includes(needle), `review app js missing ${needle}`);
}

for (const needle of [
  'ALLOW_LIVE_AI_TEST: "true"',
  'E2E_AI_MODE: "live"',
  "run-e2e-local.sh",
  "v03-alpha-live-capture.spec.ts",
]) {
  assert.ok(captureScript.includes(needle), `capture script missing live flow guard ${needle}`);
}

for (const needle of [
  "configureMiniMaxKeyByUi",
  "createE2ETestAccount",
  "loginByUi",
  "expectedGarmentCount = 9",
  "intake_single_step1_imported",
  "已选择 ${expectedGarmentCount} 张单品照片",
  "核对 AI 识别结果",
  "getWorkspaceOverview",
  "live-capture-manifest.json",
  "Du_240122123203-1242822577.png",
  "Du_240521225816-1242822577.png",
  "isMobile: true",
  "hasTouch: true",
  "deviceScaleFactor: 1",
]) {
  assert.ok(captureSpec.includes(needle), `capture spec missing ${needle}`);
}

assert.ok(!captureSpec.includes("fullPage: true"), "screenshots must be fixed viewport, not fullPage");
assert.ok(!html.includes("/Users/"), "html must not expose local absolute paths");
assert.ok(!JSON.stringify(data).includes("/Users/"), "data must not expose local absolute paths");
assert.ok(!JSON.stringify(manifest).includes("/Users/"), "manifest must not expose local absolute paths");

async function runHtmlBehaviorCheck(): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.goto(pathToFileURL(htmlPath).toString());
    assert.equal(await page.locator(".state-card").count(), 14, "review app renders all 14 states");
    assert.equal(await page.locator(".phone-shell").first().evaluate((node) => node.getBoundingClientRect().width), 390);
    assert.equal(await page.locator(".current-shot, .missing-shot").first().evaluate((node) => node.getBoundingClientRect().height), 844);

    await page.getByRole("button", { name: /单品详情页/ }).click();
    await page.getByRole("button", { name: /信息区 · info/ }).click();
    const switchedSrc = await page.locator("#current-screenshot img").getAttribute("src");
    assert.ok(switchedSrc?.includes("garment_detail_390_info.png"), "segment tab switches current screenshot");

    await page.getByRole("button", { name: "只看 P0" }).click();
    const visibleCards = await page.locator(".state-card").count();
    assert.ok(visibleCards >= 1 && visibleCards < 14, "P0 filter narrows state list");

    await page.getByRole("button", { name: "全部" }).click();
    await page.getByRole("button", { name: /单品详情页/ }).click();
    await page.locator("#human-notes").fill("自动化评审意见");
    const saved = await page.evaluate(() => localStorage.getItem("wardrobe-v03-alpha-human-review"));
    assert.ok(saved?.includes("自动化评审意见"), "human notes auto-save to localStorage");

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出 JSON" }).click();
    assert.equal((await download).suggestedFilename(), "v03-alpha-human-review.json");

    assert.deepEqual(consoleErrors, [], "visual review html should not emit console errors");
  } finally {
    await browser.close();
  }
}

runHtmlBehaviorCheck()
  .then(() => {
    console.log("v0.3-alpha visual review tests: passed");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
