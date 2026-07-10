import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";

const previousEnv = {
  wardrobeEnv: process.env.WARDROBE_ENV,
  token: process.env.E2E_FAULT_TOKEN,
};

afterEach(() => {
  restoreEnv("WARDROBE_ENV", previousEnv.wardrobeEnv);
  restoreEnv("E2E_FAULT_TOKEN", previousEnv.token);
});

describe("E2E fault injection", () => {
  it("injects a bounded server failure and then expires it", async () => {
    process.env.WARDROBE_ENV = "test";
    process.env.E2E_FAULT_TOKEN = "test-fault-token";
    const app = buildApp({
      readinessCheck: async () => ({ database: "ready" }),
      jwtReadinessCheck: async () => true,
    });

    try {
      const armed = await app.inject({
        method: "POST",
        url: "/api/test/faults",
        headers: { "x-e2e-fault-token": "test-fault-token" },
        payload: { method: "GET", pathIncludes: "/api/health", times: 1, statusCode: 503 },
      });
      expect(armed.statusCode).toBe(200);

      const failed = await app.inject({ method: "GET", url: "/api/health" });
      expect(failed.statusCode).toBe(503);
      expect(failed.json()).toMatchObject({ code: "server", retryable: true });

      const recovered = await app.inject({ method: "GET", url: "/api/health" });
      expect(recovered.statusCode).toBe(200);
      expect(recovered.json()).toMatchObject({ status: "ok" });
    } finally {
      await app.close();
    }
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
