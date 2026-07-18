import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { build } from "esbuild";

const repoRoot = resolve(import.meta.dirname, "..");
const outputRoot = join(repoRoot, "apps/wechat-miniprogram/generated");
const checkOnly = process.argv.includes("--check");

const bundles = [
  {
    file: "wardora-home-contracts.js",
    sourcefile: "wardora-home-contracts.entry.ts",
    contents: `
      export {
        AcceptRecommendationResponseSchema,
        CancelPrimaryPlanResponseSchema,
        EmptyUserLocationProfileSchema,
        LocationDateOverrideStateSchema,
        RecommendationReadResponseSchema,
        RejectRecommendationResponseSchema,
        ResolveRecommendationsResponseSchema,
        UserLocationProfileSchema,
        WeatherLocationCandidatesResponseSchema,
        WeatherOverviewSchema,
        WorkspaceCommandResponseSchema,
        wardoraBusinessDate,
      } from "@wardrobe/cloud-contracts";
    `,
  },
  {
    file: "wardora-weather-canvas.js",
    sourcefile: "wardora-weather-canvas.entry.ts",
    banner: `var document={createElement:function(tag){if(tag!=="canvas")throw new Error("mini_canvas_element_unsupported");var api=typeof wx!=="undefined"?wx:globalThis.wx;if(!api||typeof api.createOffscreenCanvas!=="function")throw new Error("mini_offscreen_canvas_unavailable");return api.createOffscreenCanvas({type:"2d",width:96,height:56})}};`,
    contents: `
      export {
        WEATHER_CANVAS_DRAW_ORDER,
        canvasEligibility,
        createWeatherScene,
        renderWeatherScene,
        triggerWeatherSceneEvent,
      } from "./src/lib/home/weather-canvas-engine";
      export {
        WEATHER_CANVAS_MAX_DPR,
        WEATHER_CANVAS_TARGET_FPS,
      } from "./src/lib/home/weather-canvas-scheduler";
    `,
  },
];

const declarations = new Map([
  ["wardora-home-contracts.d.ts", `// Generated from @wardrobe/cloud-contracts. Do not edit.\nexport {\n  type AcceptRecommendationCommand,\n  type AcceptRecommendationResponse,\n  type CancelPrimaryPlanCommand,\n  type CancelPrimaryPlanResponse,\n  type LocationDateOverrideState,\n  type RecommendationDisplayItemV3,\n  type RecommendationReadResponse,\n  type RejectRecommendationCommand,\n  type RejectRecommendationResponse,\n  type ResolveRecommendationsResponse,\n  type UserLocationProfile,\n  type WeatherLocationCandidate,\n  type WeatherLocationRef,\n  type WeatherOverview,\n} from "@wardrobe/cloud-contracts";\nexport const AcceptRecommendationResponseSchema: typeof import("@wardrobe/cloud-contracts").AcceptRecommendationResponseSchema;\nexport const CancelPrimaryPlanResponseSchema: typeof import("@wardrobe/cloud-contracts").CancelPrimaryPlanResponseSchema;\nexport const EmptyUserLocationProfileSchema: typeof import("@wardrobe/cloud-contracts").EmptyUserLocationProfileSchema;\nexport const LocationDateOverrideStateSchema: typeof import("@wardrobe/cloud-contracts").LocationDateOverrideStateSchema;\nexport const RecommendationReadResponseSchema: typeof import("@wardrobe/cloud-contracts").RecommendationReadResponseSchema;\nexport const RejectRecommendationResponseSchema: typeof import("@wardrobe/cloud-contracts").RejectRecommendationResponseSchema;\nexport const ResolveRecommendationsResponseSchema: typeof import("@wardrobe/cloud-contracts").ResolveRecommendationsResponseSchema;\nexport const UserLocationProfileSchema: typeof import("@wardrobe/cloud-contracts").UserLocationProfileSchema;\nexport const WeatherLocationCandidatesResponseSchema: typeof import("@wardrobe/cloud-contracts").WeatherLocationCandidatesResponseSchema;\nexport const WeatherOverviewSchema: typeof import("@wardrobe/cloud-contracts").WeatherOverviewSchema;\nexport const WorkspaceCommandResponseSchema: typeof import("@wardrobe/cloud-contracts").WorkspaceCommandResponseSchema;\nexport const wardoraBusinessDate: typeof import("@wardrobe/cloud-contracts").wardoraBusinessDate;\n`],
  ["wardora-weather-canvas.d.ts", `// Generated from the accepted App P3 Canvas kernel. Do not edit.\nexport { type WeatherCanvasEligibility, type WeatherSafeRect, type WeatherScene, type WeatherVisualFamily } from "../../../src/lib/home/weather-canvas-engine";\nexport const WEATHER_CANVAS_DRAW_ORDER: typeof import("../../../src/lib/home/weather-canvas-engine").WEATHER_CANVAS_DRAW_ORDER;\nexport const WEATHER_CANVAS_MAX_DPR: typeof import("../../../src/lib/home/weather-canvas-scheduler").WEATHER_CANVAS_MAX_DPR;\nexport const WEATHER_CANVAS_TARGET_FPS: typeof import("../../../src/lib/home/weather-canvas-scheduler").WEATHER_CANVAS_TARGET_FPS;\nexport const canvasEligibility: typeof import("../../../src/lib/home/weather-canvas-engine").canvasEligibility;\nexport const createWeatherScene: typeof import("../../../src/lib/home/weather-canvas-engine").createWeatherScene;\nexport const renderWeatherScene: typeof import("../../../src/lib/home/weather-canvas-engine").renderWeatherScene;\nexport const triggerWeatherSceneEvent: typeof import("../../../src/lib/home/weather-canvas-engine").triggerWeatherSceneEvent;\n`],
]);

await mkdir(outputRoot, { recursive: true });
let mismatch = false;

for (const bundle of bundles) {
  const result = await build({
    stdin: { contents: bundle.contents, resolveDir: repoRoot, sourcefile: bundle.sourcefile, loader: "ts" },
    bundle: true,
    write: false,
    format: "cjs",
    platform: "browser",
    target: "es2015",
    minify: true,
    legalComments: "none",
    logLevel: "silent",
    banner: bundle.banner ? { js: bundle.banner } : undefined,
  });
  const content = `// Generated from shared Wardora sources. Do not edit.\n${result.outputFiles[0].text}`;
  mismatch = (await persist(join(outputRoot, bundle.file), content)) || mismatch;
}

for (const [file, content] of declarations) {
  mismatch = (await persist(join(outputRoot, file), content)) || mismatch;
}

if (checkOnly && mismatch) {
  process.stderr.write("generated mini-program home shared bridge is stale\n");
  process.exitCode = 1;
}

async function persist(path, expected) {
  let current = "";
  try { current = await readFile(path, "utf8"); } catch {}
  if (current === expected) return false;
  if (!checkOnly) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, expected);
  }
  return true;
}
