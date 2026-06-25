import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { assertSafeTestDatabaseUrl } from "../src/db/client.js";

describe("cloud API skeleton", () => {
  it("serves health without touching the database", async () => {
    const app = buildApp({
      readinessCheck: async () => ({ database: "ready" }),
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
    });

    const response = await app.inject({ method: "GET", url: "/api/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      dependencies: { database: "ready" },
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
});

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
