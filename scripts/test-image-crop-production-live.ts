import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { IMAGE_CROP_MAX_IN_FLIGHT } from "@wardrobe/cloud-contracts";

const selectedIds = [
  "real-01-backpack",
  "real-02-denim-belt",
  "real-03-sling-bag-on-model",
  "real-06-light-jacket",
  "real-09-gold-earrings",
  "real-12-running-shoes",
  "real-15-plaid-skirt",
  "real-16-wide-brim-hat",
  "real-21-blue-dress",
  "real-25-long-floral-dress-a",
];

type ManifestEntry = { caseId: string; fileName: string; sha256: string };

void main();

async function main() {
  const [manifestPath, sourceDir] = process.argv.slice(2);
  const account = process.env.WARDROBE_TEST_ACCOUNT;
  const password = process.env.WARDROBE_TEST_PASSWORD;
  const apiBase = process.env.WARDROBE_API_BASE_URL ?? "https://api.zhengfangapps.cloud";
  if (!manifestPath || !sourceDir) throw new Error("usage: tsx scripts/test-image-crop-production-live.ts <manifest.json> <source-dir>");
  if (!account || !password) throw new Error("WARDROBE_TEST_ACCOUNT and WARDROBE_TEST_PASSWORD are required");

  const deviceId = `crop-live-${randomUUID()}`;
  const loginResponse = await fetch(`${apiBase}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account, password, deviceId, deviceLabel: "Crop production verification", client: "pwa" }),
  });
  if (!loginResponse.ok) throw new Error(`login failed: HTTP ${loginResponse.status}`);
  const session = (await loginResponse.json()) as { accessToken?: string };
  if (!session.accessToken) throw new Error("login response did not contain an access token");

  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { cases: ManifestEntry[] };
  const cases = selectedIds.map((id) => manifest.cases.find((entry) => entry.caseId === id)).filter((entry): entry is ManifestEntry => Boolean(entry));
  if (cases.length !== selectedIds.length) throw new Error(`expected ${selectedIds.length} selected cases, got ${cases.length}`);

  let completed = 0;
  const started = performance.now();
  const results = await runLimited(cases, IMAGE_CROP_MAX_IN_FLIGHT, async (entry, index) => {
    const bytes = await readFile(path.join(sourceDir, entry.fileName));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== entry.sha256) throw new Error(`sha mismatch: ${entry.caseId}`);
    const requestStarted = performance.now();
    const response = await fetch(`${apiBase}/api/workspace/images/crop-suggestion`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "content-type": "application/json",
        "x-wardrobe-device-id": deviceId,
      },
      body: JSON.stringify({ clientItemId: entry.caseId, revision: index + 1, mimeType: "image/png", imageBase64: bytes.toString("base64") }),
    });
    const latencyMs = round(performance.now() - requestStarted);
    let validSuggestion = false;
    if (response.ok) {
      const payload = (await response.json()) as { revision?: number; suggestion?: { clientItemId?: string; cropBox?: unknown; coordinateSpace?: string } };
      validSuggestion = payload.revision === index + 1
        && payload.suggestion?.clientItemId === entry.caseId
        && payload.suggestion.coordinateSpace === "exif-corrected-normalized-top-left"
        && Boolean(payload.suggestion.cropBox);
    }
    completed += 1;
    const result = { imageId: entry.caseId, sha256, statusCode: response.status, validSuggestion, latencyMs, progress: `${completed}/${cases.length}` };
    console.log(JSON.stringify(result));
    return result;
  });

  const latencies = results.map((item) => item.latencyMs).sort((a, b) => a - b);
  const percentile = (p: number) => latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * p) - 1)];
  console.log(JSON.stringify({
    summary: true,
    wallClockMs: round(performance.now() - started),
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    failures: results.filter((item) => item.statusCode !== 200 || !item.validSuggestion).length,
  }));
}

async function runLimited<T, R>(items: T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index]!, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
