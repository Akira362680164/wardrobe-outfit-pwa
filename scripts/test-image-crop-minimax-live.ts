import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { composeNestedCropBoxes } from "@wardrobe/cloud-contracts";
import { MiniMaxIntakeService } from "../services/wardrobe-api/src/ai/minimax-intake-service.js";

void main();
async function main() {
  const manifestPath = process.argv[2]; const sourceDir = process.argv[3]; const apiKey = process.env.MINIMAX_API_KEY;
  if (!manifestPath || !sourceDir || !apiKey) throw new Error("manifest, source directory and MINIMAX_API_KEY are required");
  const selected = new Set(["real-03-sling-bag-on-model", "real-06-light-jacket", "real-21-blue-dress"]);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { cases: Array<{ caseId: string; fileName: string; sha256: string; groundTruthCropBox: { x: number; y: number; width: number; height: number } }> };
  const cases = manifest.cases.filter((entry) => selected.has(entry.caseId)); const service = new MiniMaxIntakeService();
  const results = await Promise.all(cases.map(async (entry) => {
    const bytes = await readFile(path.join(sourceDir, entry.fileName)); const sha256 = createHash("sha256").update(bytes).digest("hex"); if (sha256 !== entry.sha256) throw new Error(`sha mismatch: ${entry.caseId}`);
    const metadata = await sharp(bytes).rotate().metadata(); const width = metadata.width!; const height = metadata.height!;
    const margin = .04; const gt = entry.groundTruthCropBox; const pre = { x: Math.max(0, gt.x - margin), y: Math.max(0, gt.y - margin), width: Math.min(1 - Math.max(0, gt.x - margin), gt.width + margin * 2), height: Math.min(1 - Math.max(0, gt.y - margin), gt.height + margin * 2) };
    const left = Math.floor(pre.x * width); const top = Math.floor(pre.y * height); const cropWidth = Math.max(1, Math.ceil(pre.width * width)); const cropHeight = Math.max(1, Math.ceil(pre.height * height)); const cropped = await sharp(bytes).rotate().extract({ left, top, width: Math.min(cropWidth, width - left), height: Math.min(cropHeight, height - top) }).jpeg({ quality: 94 }).toBuffer();
    const gridSvg = `<svg width="${cropWidth}" height="${cropHeight}" xmlns="http://www.w3.org/2000/svg">${Array.from({length:11},(_,i)=>`<path d="M ${i*cropWidth/10} 0 V ${cropHeight} M 0 ${i*cropHeight/10} H ${cropWidth}" stroke="rgba(255,64,64,.82)" stroke-width="2"/>`).join("")}</svg>`;
    const grid = await sharp(cropped).composite([{ input: Buffer.from(gridSvg) }]).jpeg({ quality: 94 }).toBuffer(); const started = performance.now();
    const response = await service.recognizeGarment({ miniMax: { apiKey, apiHost: "https://api.minimaxi.com", model: "MiniMax-M3", timeoutMs: 120_000 }, imageDataUrl: `data:image/jpeg;base64,${cropped.toString("base64")}`, gridImageDataUrl: `data:image/jpeg;base64,${grid.toString("base64")}`, fallbackName: "live-test.jpg" });
    return { imageId: entry.caseId, sha256, preCropBox: pre, sentPixels: { width: cropWidth, height: cropHeight }, tagValid: Boolean(response.tag.candidateNames[0] && response.tag.category), cropAccepted: Boolean(response.secondaryCropBox), secondaryCropBox: response.secondaryCropBox ?? null, finalCropBox: composeNestedCropBoxes(pre, response.secondaryCropBox), latencyMs: Math.round((performance.now() - started) * 10) / 10 };
  }));
  console.log(JSON.stringify({ keyExposed: false, results }, null, 2));
}
