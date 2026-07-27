import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import process from "node:process";
import { build } from "esbuild";
import fg from "fast-glob";
import { miniHomeP4VisualFixtures } from "./fixtures/miniprogram-home-p4-visual";

async function main(): Promise<void> {
  const repoRoot = resolve(import.meta.dirname, "..");
  const sourceRoot = join(repoRoot, "apps/wechat-miniprogram");
  const explicitOutput = process.argv.find((value) => value.startsWith("--output="))?.slice("--output=".length);
  const outputRoot = explicitOutput
    ? resolve(explicitOutput)
    : await mkdtemp(join(tmpdir(), "wardora-wechat-devtools-"));

  if (outputRoot === sourceRoot || outputRoot.startsWith(`${sourceRoot}/`)) {
    throw new Error("validation output must stay outside the mini-program source tree");
  }

  await rm(outputRoot, { recursive: true, force: true });
  await cp(sourceRoot, outputRoot, {
    recursive: true,
    filter: (source) => {
      const pathFromRoot = relative(sourceRoot, source);
      return !pathFromRoot
        .split("/")
        .some((part) => part === "node_modules" || part === "miniprogram_npm" || part === "scripts");
    },
  });

  const entries = await fg(["**/*.ts", "!**/*.d.ts", "!scripts/**"], {
    absolute: true,
    cwd: sourceRoot,
  });

  await build({
    entryPoints: entries,
    outbase: sourceRoot,
    outdir: outputRoot,
    bundle: true,
    format: "cjs",
    platform: "browser",
    target: "es2015",
    sourcemap: false,
    minify: false,
    logLevel: "warning",
    logOverride: { "duplicate-object-key": "silent" },
  });

  for (const entry of entries) {
    await rm(join(outputRoot, relative(sourceRoot, entry)), { force: true });
  }

  const projectConfigPath = join(outputRoot, "project.config.json");
  const projectConfig = JSON.parse(await readFile(projectConfigPath, "utf8")) as {
    projectname?: string;
    setting?: { useCompilerPlugins?: string[] };
  };
  projectConfig.projectname = `${projectConfig.projectname ?? basename(sourceRoot)}-validation`;
  if (projectConfig.setting) {
    projectConfig.setting.useCompilerPlugins = [];
  }
  await writeFile(projectConfigPath, `${JSON.stringify(projectConfig, null, 2)}\n`);
  await rm(join(outputRoot, "tsconfig.json"), { force: true });

  if (process.argv.includes("--home-p4-visual")) {
    await prepareHomeP4VisualPage(outputRoot);
  }

  process.stdout.write(`${outputRoot}\n`);
}

async function prepareHomeP4VisualPage(outputRoot: string): Promise<void> {
  // Temp-only: keep the real tab route and shared custom-tab-bar, replacing only
  // its controller with deterministic server-response-equivalent visual data.
  const visualRoot = join(outputRoot, "pages/home");
  await writeFile(join(visualRoot, "fixtures.js"), `module.exports = ${JSON.stringify(miniHomeP4VisualFixtures)};\n`);
  await writeVisualGarmentAssets(outputRoot);
  await writeFile(join(visualRoot, "index.js"), `
const fixtures = require("./fixtures");
const { createMiniWeatherCanvasRuntime } = require("../home/weather-canvas-runtime");
const { currentAccessibilityFontStyle } = require("../../utils/accessibility-font");

Page({
  data: fixtures.normal,
  onLoad(options) {
    const scene = fixtures[options.scene] || fixtures.normal;
    this.setData({ ...scene, fontStyle: currentAccessibilityFontStyle() });
  },
  async onReady() {
    this.syncTabVisibility();
    if (!this.data.canvasVisible) return;
    try {
      this.weatherRuntime = await createMiniWeatherCanvasRuntime({
        page: this,
        code: this.data.todayWeather.code,
        stale: this.data.todayWeather.stale,
        forecast: true,
        reducedMotion: this.data.reducedMotion === true,
        onFailure: (error) => this.setData({ canvasVisible: false, canvasStaticFallback: true, canvasFailure: String(error && error.message || error || "render_failed") }),
      });
    } catch (_) {
      this.setData({ canvasVisible: false, canvasStaticFallback: true, canvasFailure: "measure_failed" });
    }
  },
  onShow() { if (this.weatherRuntime) this.weatherRuntime.setForeground(true); const tab = this.getTabBar && this.getTabBar(); if (tab && tab.selectTab) tab.selectTab(0); this.syncTabVisibility(); },
  onHide() { if (this.weatherRuntime) this.weatherRuntime.setForeground(false); },
  onUnload() { if (this.weatherRuntime) this.weatherRuntime.destroy(); },
  canvasMetrics() { return this.weatherRuntime ? this.weatherRuntime.metrics : null; },
  syncTabVisibility() {
    const tab = this.getTabBar && this.getTabBar();
    if (tab && tab.setData) tab.setData({ hidden: Boolean(this.data.recommendationSheetOpen || this.data.postAcceptSheetOpen || this.data.cancelSheetOpen || this.data.locationSheetOpen || this.data.createSheetOpen) });
  },
  setSheet(name, open) { this.setData({ [name]: open }, () => this.syncTabVisibility()); },
  setSection(event) { this.setData({ activeSection: event.currentTarget.dataset.section }); },
  openRecommendationSheet() { this.setSheet("recommendationSheetOpen", true); },
  closeRecommendationSheet() { this.setSheet("recommendationSheetOpen", false); },
  openLocationSheet() { this.setSheet("locationSheetOpen", true); },
  closeLocationSheet() { this.setSheet("locationSheetOpen", false); },
  openCancelPlanSheet() { this.setSheet("cancelSheetOpen", true); },
  closeCancelPlanSheet() { this.setSheet("cancelSheetOpen", false); },
  closePostAcceptSheet() { this.setSheet("postAcceptSheetOpen", false); },
  openCreateSheet() { this.setSheet("createSheetOpen", true); }, closeCreateSheet() { this.setSheet("createSheetOpen", false); }, retryHome() {}, retrySelectedDate() {},
  selectWeatherDate() {}, selectDate() {}, selectTravelDate() {}, openGarment() {}, openIntake() {},
  beginChangePlan() {}, markCurrentPlanWorn() {}, undoCurrentPlanWorn() {},
  selectReplacementSource() {}, selectReplacementChoice() {}, applyRecommendation() {}, applySelectedRecommendation() {},
  rejectSelectedRecommendation() {}, saveSelectedOutfit() {}, chooseCancelBackup() {}, cancelCurrentPlan() {},
  useCurrentLocation() {}, openLocationSettings() {}, inputCityQuery() {}, searchCity() {}, chooseCity() {}, clearTemporary() {},
});
`);
}

async function writeVisualGarmentAssets(outputRoot: string): Promise<void> {
  const assetRoot = join(outputRoot, "assets/home-p4-visual");
  await mkdir(assetRoot, { recursive: true });
  const assets = [
    ["top.svg", "#9cb4bd", "#526f7d", "M82 52l34-24 34 24 28 8-16 38-20-12v116H90V86L70 98 54 60z"],
    ["bottom.svg", "#d8c9ad", "#9a7d58", "M92 34h48l13 168h-35l-6-92-7 92H70z"],
    ["shoes.svg", "#c9ced0", "#69747b", "M46 142c34 0 47-42 72-17 15 15 42 24 76 29v34H46z"],
    ["alt.svg", "#475d72", "#1f3042", "M92 34h48l13 168h-35l-6-92-7 92H70z"],
  ] as const;
  await Promise.all(assets.map(([name, background, fill, path]) => writeFile(join(assetRoot, name), `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320" viewBox="0 0 240 320"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${background}"/><stop offset="1" stop-color="#f5f3ed"/></linearGradient></defs><rect width="240" height="320" rx="28" fill="url(#g)"/><path d="${path}" fill="${fill}" opacity=".92"/></svg>`)));
}

void main();
