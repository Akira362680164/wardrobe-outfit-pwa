import { readFileSync, writeFileSync } from "node:fs";

const target = new URL("../apps/wechat-miniprogram/generated/image-crop.ts", import.meta.url);
const output = `// Generated from packages/cloud-contracts/src/image-crop/contracts.ts. Do not edit by hand.
export const IMAGE_CROP_MAX_IN_FLIGHT = 10;
export interface NormalizedCropBox { x: number; y: number; width: number; height: number }
export function expandCropBoxEachSide(box: NormalizedCropBox, ratio = .2): NormalizedCropBox { const x = Math.max(0, box.x - box.width * ratio); const y = Math.max(0, box.y - box.height * ratio); const right = Math.min(1, box.x + box.width + box.width * ratio); const bottom = Math.min(1, box.y + box.height + box.height * ratio); return { x, y, width: right - x, height: bottom - y }; }
export function composeNestedCropBoxes(pre: NormalizedCropBox, secondary?: NormalizedCropBox): NormalizedCropBox {
  if (!secondary || !valid(pre) || !valid(secondary)) return valid(pre) ? { ...pre } : { x: 0, y: 0, width: 1, height: 1 };
  const raw = { x: pre.x + secondary.x * pre.width, y: pre.y + secondary.y * pre.height, width: secondary.width * pre.width, height: secondary.height * pre.height };
  const right = Math.min(pre.x + pre.width, Math.max(pre.x, raw.x + raw.width)); const bottom = Math.min(pre.y + pre.height, Math.max(pre.y, raw.y + raw.height)); const x = Math.min(right, Math.max(pre.x, raw.x)); const y = Math.min(bottom, Math.max(pre.y, raw.y)); return { x, y, width: right - x, height: bottom - y };
}
export function rotateNormalizedCropBox(box: NormalizedCropBox, degrees: 0 | 90 | 180 | 270): NormalizedCropBox { if (degrees === 90) return { x: 1 - box.y - box.height, y: box.x, width: box.height, height: box.width }; if (degrees === 180) return { x: 1 - box.x - box.width, y: 1 - box.y - box.height, width: box.width, height: box.height }; if (degrees === 270) return { x: box.y, y: 1 - box.x - box.width, width: box.height, height: box.width }; return { ...box }; }
function valid(box: NormalizedCropBox): boolean { return [box.x, box.y, box.width, box.height].every(Number.isFinite) && box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0 && box.x + box.width <= 1.000001 && box.y + box.height <= 1.000001; }
`;

if (process.argv.includes("--check")) {
  if (readFileSync(target, "utf8") !== output) throw new Error("miniprogram image crop artifact is stale");
} else writeFileSync(target, output);
