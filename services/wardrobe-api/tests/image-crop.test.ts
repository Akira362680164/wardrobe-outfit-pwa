import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { AuthApiError } from "../src/auth/registrations.js";
import type { SessionService } from "../src/auth/session.js";
import { ImageCropService, ProcessCropSidecar, type CropSidecar } from "../src/image-crop/service.js";
import path from "node:path";
import sharp from "sharp";
import { decodeAndValidateCropImage } from "../src/image-crop/image-metadata.js";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAE0lEQVR4nGP4z8DwHwwZGP6DAQBJyAn3FGMynQAAAABJRU5ErkJggg==";

describe("image crop suggestion route", () => {
  it("requires authentication and the matching device", async () => {
    const app = createApp();
    const missing = await app.inject({ method: "POST", url: route, headers: { "x-wardrobe-device-id": "device-1" }, payload: payload() });
    expect(missing.statusCode).toBe(401);
    const wrong = await app.inject({ method: "POST", url: route, headers: { authorization: "Bearer ok", "x-wardrobe-device-id": "other" }, payload: payload() });
    expect(wrong.statusCode).toBe(403);
    await app.close();
  });

  it("rejects corrupt images and spoofed MIME before the sidecar", async () => {
    const calls: unknown[] = []; const app = createApp(calls);
    const corrupt = await app.inject({ method: "POST", url: route, headers: authHeaders(), payload: { ...payload(), imageBase64: Buffer.from("not-image").toString("base64") } });
    expect(corrupt.statusCode).toBe(400);
    const spoofed = await app.inject({ method: "POST", url: route, headers: authHeaders(), payload: { ...payload(), mimeType: "image/jpeg" } });
    expect(spoofed.statusCode).toBe(400); expect(calls).toHaveLength(0); await app.close();
  });

  it("rejects blank, fully transparent, oversized-byte and oversized-pixel images", async () => {
    const blank = await sharp({ create: { width: 4, height: 4, channels: 4, background: "white" } }).png().toBuffer();
    const transparent = await sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    await expect(decodeAndValidateCropImage(blank.toString("base64"), "image/png")).rejects.toMatchObject({ statusCode: 400 });
    await expect(decodeAndValidateCropImage(transparent.toString("base64"), "image/png")).rejects.toMatchObject({ statusCode: 400 });
    const padded = Buffer.concat([Buffer.from(png, "base64"), Buffer.alloc(7_500_001)]);
    await expect(decodeAndValidateCropImage(padded.toString("base64"), "image/png")).rejects.toMatchObject({ statusCode: 400 });
    const hugeHeader = Buffer.from(png, "base64"); hugeHeader.writeUInt32BE(50_000, 16); hugeHeader.writeUInt32BE(50_000, 20);
    await expect(decodeAndValidateCropImage(hugeHeader.toString("base64"), "image/png")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("returns a strict single-image suggestion and echoes revision", async () => {
    const calls: unknown[] = []; const app = createApp(calls);
    const response = await app.inject({ method: "POST", url: route, headers: authHeaders(), payload: payload() });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ revision: 7, suggestion: { clientItemId: "item-1", source: "u2netp", cropBox: { x: 0.1, y: 0.2, width: 0.6, height: 0.5 } } });
    expect(calls).toHaveLength(1); await app.close();
  });
});

describe("private crop sidecar boundary", () => {
  it("applies the fixed per-side expansion and clamps", async () => { configureFixture("crop-sidecar-success.mjs", 5000); const result = await new ProcessCropSidecar().suggest({ clientItemId: "x", mimeType: "image/png", image: Buffer.from("x") }); expect(result.cropBox).toEqual({ x: .15, y: .15, width: .7, height: .7 }); });
  it("contains a sidecar crash", async () => { configureFixture("crop-sidecar-crash.mjs", 5000); await expect(new ProcessCropSidecar().suggest({ clientItemId: "x", mimeType: "image/png", image: Buffer.from("x") })).rejects.toThrow(); });
  it("kills a timed-out sidecar", async () => { configureFixture("crop-sidecar-timeout.mjs", 25); await expect(new ProcessCropSidecar().suggest({ clientItemId: "x", mimeType: "image/png", image: Buffer.from("x") })).rejects.toMatchObject({ statusCode: 504 }); });
});

function configureFixture(name: string, timeoutMs: number) { process.env.IMAGE_CROP_SIDECAR_COMMAND = path.resolve("tests/fixtures", name); process.env.IMAGE_CROP_MODEL_PATH = path.resolve("tests/fixtures/fake.onnx"); process.env.IMAGE_CROP_TIMEOUT_MS = String(timeoutMs); }

const route = "/api/workspace/images/crop-suggestion";
function payload() { return { clientItemId: "item-1", revision: 7, mimeType: "image/png", imageBase64: png }; }
function authHeaders() { return { authorization: "Bearer ok", "x-wardrobe-device-id": "device-1" }; }
function createApp(calls: unknown[] = []) {
  const sidecar: CropSidecar = { suggest: async (input) => { calls.push(input); return { clientItemId: input.clientItemId, cropBox: { x: 0.1, y: 0.2, width: 0.6, height: 0.5 }, source: "u2netp", confidence: 0.9, needsReview: false, reasonCodes: [], modelVersion: "u2netp-test", coordinateSpace: "exif-corrected-normalized-top-left" }; } };
  return buildApp({ storageProvider: null, sessionService: fakeSessionService(), imageCropService: new ImageCropService(sidecar, 2, 4) });
}
function fakeSessionService(): SessionService { return { authenticate: async (authorization?: string) => { if (authorization !== "Bearer ok") throw new AuthApiError(401, "AUTH_TOKEN_MISSING", "missing"); return { userId: "user-1", sessionId: "session-1", deviceId: "device-1" }; } } as unknown as SessionService; }
