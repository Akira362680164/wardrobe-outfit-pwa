import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildApp } from "../services/wardrobe-api/src/app.js";
import type { SessionService } from "../services/wardrobe-api/src/auth/session.js";

const selectedIds = ["real-01-backpack", "real-02-denim-belt", "real-03-sling-bag-on-model", "real-06-light-jacket", "real-09-gold-earrings", "real-12-running-shoes", "real-15-plaid-skirt", "real-16-wide-brim-hat", "real-21-blue-dress", "real-25-long-floral-dress-a"];
void main();

async function main() {
const manifestPath = process.argv[2]; const sourceDir = process.argv[3];
if (!manifestPath || !sourceDir) throw new Error("usage: tsx scripts/test-image-crop-real.ts <manifest.json> <source-dir>");
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { cases: Array<{ caseId: string; fileName: string; sha256: string }> };
const cases = selectedIds.map((id) => manifest.cases.find((entry) => entry.caseId === id)).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
if (cases.length !== 10) throw new Error(`expected 10 selected cases, got ${cases.length}`);
const app = buildApp({ storageProvider: null, sessionService: { authenticate: async () => ({ userId: "local-test", sessionId: "local-test", deviceId: "local-test-device" }) } as unknown as SessionService });
const started = performance.now(); let completed = 0;
const results = await runLimited(cases, 3, async (entry, index) => {
  const bytes = await readFile(path.join(sourceDir, entry.fileName)); const sha256 = createHash("sha256").update(bytes).digest("hex"); if (sha256 !== entry.sha256) throw new Error(`sha mismatch: ${entry.caseId}`);
  const requestStarted = performance.now(); const response = await app.inject({ method: "POST", url: "/api/workspace/images/crop-suggestion", headers: { authorization: "Bearer local", "x-wardrobe-device-id": "local-test-device" }, payload: { clientItemId: entry.caseId, revision: index + 1, mimeType: "image/png", imageBase64: bytes.toString("base64") } });
  completed += 1; return { imageId: entry.caseId, sha256, statusCode: response.statusCode, latencyMs: Math.round((performance.now() - requestStarted) * 10) / 10, progress: `${completed}/10` };
});
await app.close(); const latencies = results.map((item) => item.latencyMs).sort((a, b) => a - b); const percentile = (p: number) => latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * p) - 1)];
console.log(JSON.stringify({ selected: results, wallClockMs: Math.round((performance.now() - started) * 10) / 10, p50Ms: percentile(.5), p95Ms: percentile(.95), failures: results.filter((item) => item.statusCode !== 200).length }, null, 2));
}

async function runLimited<T, R>(items: T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> { const results = new Array<R>(items.length); let cursor = 0; const worker = async () => { while (cursor < items.length) { const index = cursor++; results[index] = await task(items[index]!, index); } }; await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker)); return results; }
