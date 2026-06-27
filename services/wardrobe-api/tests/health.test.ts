import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { assertSafeTestDatabaseUrl } from "../src/db/client.js";
import type { StorageProvider } from "../src/storage/provider.js";

describe("cloud API skeleton", () => {
  it("serves health without touching the database", async () => {
    const app = buildApp({
      readinessCheck: async () => ({ database: "ready" }),
      storageProvider: readyStorage(),
      jwtReadinessCheck: async () => true,
    });

    const response = await app.inject({ method: "GET", url: "/api/health" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.status).toBe("ok");
    expect(Date.parse(body.serverTime)).not.toBeNaN();

    await app.close();
  });

  it("serves ready when dependencies are available", async () => {
    const app = buildApp({
      readinessCheck: async () => ({ database: "ready" }),
      storageProvider: readyStorage(),
      jwtReadinessCheck: async () => true,
    });

    const response = await app.inject({ method: "GET", url: "/api/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      dependencies: { database: "ready", storage: "ready", jwt: "ready" },
    });

    await app.close();
  });

  it("returns degraded ready when the database check fails", async () => {
    const app = buildApp({
      readinessCheck: async () => {
        throw new Error("database unavailable");
      },
    });

    const response = await app.inject({ method: "GET", url: "/api/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: "degraded",
      dependencies: { database: "unavailable" },
    });

    await app.close();
  });

  it("serves version metadata", async () => {
    const app = buildApp({
      readinessCheck: async () => ({ database: "ready" }),
    });

    const response = await app.inject({ method: "GET", url: "/api/version" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      name: "wardrobe-api",
      version: "0.1.0",
    });

    await app.close();
  });

  it("only echoes configured CORS origins", async () => {
    const previous = process.env.ALLOWED_ORIGINS;
    process.env.ALLOWED_ORIGINS = "http://111.231.98.86, capacitor://localhost";
    const app = buildApp({
      readinessCheck: async () => ({ database: "ready" }),
    });

    try {
      const allowed = await app.inject({
        method: "OPTIONS",
        url: "/api/auth/login",
        headers: { origin: "http://111.231.98.86" },
      });
      const blocked = await app.inject({
        method: "OPTIONS",
        url: "/api/auth/login",
        headers: { origin: "http://example.com" },
      });

      expect(allowed.statusCode).toBe(204);
      expect(allowed.headers["access-control-allow-origin"]).toBe("http://111.231.98.86");
      expect(blocked.statusCode).toBe(204);
      expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      await app.close();
      if (previous === undefined) delete process.env.ALLOWED_ORIGINS;
      else process.env.ALLOWED_ORIGINS = previous;
    }
  });
});

function readyStorage(): StorageProvider {
  return {
    name: "test",
    save: async (input) => ({ storageKey: input.storageKey, sha256: input.expectedSha256, sizeBytes: input.bytes.length }),
    openReadStream: async () => { throw new Error("unused"); },
    stat: async () => ({ exists: false }),
    delete: async () => {},
    cleanupTemporaryFiles: async () => 0,
    checkReady: async () => {},
  };
}

describe("database safety guard", () => {
  it("rejects production database URLs during tests", () => {
    expect(() =>
      assertSafeTestDatabaseUrl(
        "postgres://wardrobe:secret@111.231.98.86:5432/wardrobe",
        "test",
      ),
    ).toThrow("Tests must not use production database");
  });
});
