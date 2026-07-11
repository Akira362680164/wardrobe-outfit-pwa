import { describe, expect, it } from "vitest";

import type { MiniMaxIntakeServiceLike } from "../src/ai/minimax-intake-service.js";
import { buildApp } from "../src/app.js";
import { AuthApiError } from "../src/auth/registrations.js";
import type { SessionService } from "../src/auth/session.js";

describe("AI intake routes", () => {
  it("requires a valid workspace session and matching device", async () => {
    const app = buildApp({
      readinessCheck: async () => ({ database: "ready" }),
      storageProvider: null,
      sessionService: fakeSessionService(),
      miniMaxIntakeService: fakeAiService(),
    });

    const missingAuth = await app.inject({
      method: "POST",
      url: "/api/workspace/ai/intake/garment-recognition",
      headers: { "x-wardrobe-device-id": "device-1" },
      payload: garmentPayload(),
    });
    expect(missingAuth.statusCode).toBe(401);

    const wrongDevice = await app.inject({
      method: "POST",
      url: "/api/workspace/ai/intake/garment-recognition",
      headers: { authorization: "Bearer ok", "x-wardrobe-device-id": "other" },
      payload: garmentPayload(),
    });
    expect(wrongDevice.statusCode).toBe(403);
    expect(wrongDevice.json()).toMatchObject({ code: "auth" });

    await app.close();
  });

  it("forwards garment recognition to the server-side MiniMax service", async () => {
    const calls: unknown[] = [];
    const app = buildApp({
      readinessCheck: async () => ({ database: "ready" }),
      storageProvider: null,
      sessionService: fakeSessionService(),
      miniMaxIntakeService: fakeAiService(calls),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/workspace/ai/intake/garment-recognition",
      headers: authHeaders(),
      payload: garmentPayload(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      tag: { category: "tops", candidateNames: ["白色衬衫"] },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      fallbackName: "shirt.jpg",
      miniMax: { apiKey: "test-key" },
    });

    await app.close();
  });

  it("forwards batch garment recognition to the server-side MiniMax service", async () => {
    const calls: unknown[] = [];
    const app = buildApp({
      readinessCheck: async () => ({ database: "ready" }),
      storageProvider: null,
      sessionService: fakeSessionService(),
      miniMaxIntakeService: fakeAiService(calls),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/workspace/ai/intake/garment-recognition/batch",
      headers: authHeaders(),
      payload: {
        miniMax: {
          apiKey: "test-key",
          apiHost: "https://api.minimaxi.com",
          model: "MiniMax-M3",
          timeoutMs: 60000,
        },
        items: [
          {
            clientItemId: "image-1",
            imageDataUrl: "data:image/png;base64,AAAA",
            fallbackName: "shirt.jpg",
          },
          {
            clientItemId: "image-2",
            imageDataUrl: "data:image/png;base64,BBBB",
            fallbackName: "pants.jpg",
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [
        {
          clientItemId: "image-1",
          status: "succeeded",
          tag: { category: "tops", candidateNames: ["白色衬衫"] },
        },
        {
          clientItemId: "image-2",
          status: "succeeded",
          tag: { category: "tops", candidateNames: ["白色衬衫"] },
        },
      ],
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      items: [{ clientItemId: "image-1" }, { clientItemId: "image-2" }],
      miniMax: { apiKey: "test-key" },
    });

    await app.close();
  });

  it("forwards outfit metadata generation without client-side prompt parsing", async () => {
    const calls: unknown[] = [];
    const app = buildApp({
      readinessCheck: async () => ({ database: "ready" }),
      storageProvider: null,
      sessionService: fakeSessionService(),
      miniMaxIntakeService: fakeAiService(calls),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/workspace/ai/intake/outfit-metadata",
      headers: authHeaders(),
      payload: {
        miniMax: {
          apiKey: "test-key",
          apiHost: "https://api.minimaxi.com",
          model: "MiniMax-M3",
          timeoutMs: 60000,
        },
        itemIds: [1],
        name: "通勤套装",
        outfitItems: [
          {
            id: 1,
            name: "白色衬衫",
            category: "tops",
            seasons: ["spring"],
            styles: ["commute"],
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      name: "通勤套装",
      seasons: ["spring"],
      styleTags: ["通勤"],
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      itemIds: [1],
      miniMax: { apiKey: "test-key" },
    });

    await app.close();
  });

  it("forwards display enhancement requests to the server-side MiniMax service", async () => {
    const calls: unknown[] = [];
    const app = buildApp({
      readinessCheck: async () => ({ database: "ready" }),
      storageProvider: null,
      sessionService: fakeSessionService(),
      miniMaxIntakeService: fakeAiService(calls),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/workspace/ai/enhance/wardrobe-diagnosis",
      headers: authHeaders(),
      payload: {
        miniMax: {
          apiKey: "test-key",
          apiHost: "https://api.minimaxi.com",
          model: "MiniMax-M3",
          timeoutMs: 60000,
        },
        input: { items: [] },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ summary: "诊断完成" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      kind: "wardrobe-diagnosis",
      input: { input: { items: [] } },
    });

    await app.close();
  });

  it("requires explicit reference and garment images for try-on", async () => {
    const app = buildApp({
      readinessCheck: async () => ({ database: "ready" }),
      storageProvider: null,
      sessionService: fakeSessionService(),
      miniMaxIntakeService: fakeAiService(),
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/workspace/ai/try-on",
      headers: authHeaders(),
      payload: {
        miniMax: {
          apiKey: "test-key",
          apiHost: "https://api.minimaxi.com",
          model: "MiniMax-M3",
          timeoutMs: 60000,
        },
        referenceImageDataUrl: "data:image/png;base64,AAAA",
        garmentImageDataUrls: ["data:image/png;base64,BBBB"],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      imageDataUrl: "data:image/jpeg;base64,dGVzdA==",
    });
    const invalid = await app.inject({
      method: "POST",
      url: "/api/workspace/ai/try-on",
      headers: authHeaders(),
      payload: {
        miniMax: {
          apiKey: "test-key",
          apiHost: "https://api.minimaxi.com",
          model: "MiniMax-M3",
          timeoutMs: 60000,
        },
        referenceImageDataUrl: "data:image/png;base64,AAAA",
        garmentImageDataUrls: [],
      },
    });
    expect(invalid.statusCode).toBe(400);
    await app.close();
  });
});

function fakeSessionService(): SessionService {
  return {
    authenticate: async (authorization: string | undefined) => {
      if (authorization !== "Bearer ok")
        throw new AuthApiError(401, "AUTH_TOKEN_INVALID", "invalid");
      return { userId: "user-1", sessionId: "session-1", deviceId: "device-1" };
    },
  } as SessionService;
}

function fakeAiService(calls: unknown[] = []): MiniMaxIntakeServiceLike {
  return {
    generateTryOn: async () => ({
      imageDataUrl: "data:image/jpeg;base64,dGVzdA==",
    }),
    recognizeGarment: async (input) => {
      calls.push(input);
      return {
        tag: {
          candidateNames: ["白色衬衫"],
          category: "tops",
          colors: { mode: "single", primary: "白色" },
          seasons: ["spring"],
          styles: ["commute"],
          formality: 4,
          warmth: 2,
          confidence: 0.9,
          needsReview: false,
        },
      };
    },
    recognizeGarments: async (input) => {
      calls.push(input);
      return {
        items: input.items.map((item) => ({
          clientItemId: item.clientItemId,
          status: "succeeded",
          tag: {
            candidateNames: ["白色衬衫"],
            category: "tops",
            colors: { mode: "single", primary: "白色" },
            seasons: ["spring"],
            styles: ["commute"],
            formality: 4,
            warmth: 2,
            confidence: 0.9,
            needsReview: false,
          },
        })),
      };
    },
    generateOutfitMetadata: async (input) => {
      calls.push(input);
      return {
        name: input.name ?? "套装",
        seasons: ["spring"],
        styleTags: ["通勤"],
      };
    },
    enhance: async (kind, input) => {
      calls.push({ kind, input });
      return { summary: "诊断完成" };
    },
  };
}

function authHeaders() {
  return {
    authorization: "Bearer ok",
    "x-wardrobe-device-id": "device-1",
    "content-type": "application/json",
  };
}

function garmentPayload() {
  return {
    miniMax: {
      apiKey: "test-key",
      apiHost: "https://api.minimaxi.com",
      model: "MiniMax-M3",
      timeoutMs: 60000,
    },
    imageDataUrl: "data:image/png;base64,AAAA",
    fallbackName: "shirt.jpg",
  };
}
