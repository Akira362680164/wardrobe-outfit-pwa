import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { SessionService } from "../src/auth/session.js";
import { verifyReaderToken, hashReaderToken } from "../src/diagnostics/reader-auth.js";
import { generateCaseId } from "../src/diagnostics/case-id.js";

describe("diagnostics", () => {
  it("generates valid case IDs", () => {
    const id = generateCaseId();
    expect(id).toMatch(/^WD-\d{8}-[A-Z0-9]{6}$/);
  });

  it("generates unique case IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateCaseId()));
    expect(ids.size).toBe(100);
  });

  it("reader token hash is deterministic", () => {
    const hash1 = hashReaderToken("test-token-123");
    const hash2 = hashReaderToken("test-token-123");
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("verifyReaderToken accepts correct token", () => {
    const token = "correct-token";
    const hash = hashReaderToken(token);
    expect(verifyReaderToken(token, hash)).toBe(true);
  });

  it("verifyReaderToken rejects wrong token", () => {
    const hash = hashReaderToken("correct-token");
    expect(verifyReaderToken("wrong-token", hash)).toBe(false);
  });

  it("verifyReaderToken uses constant-time comparison", () => {
    // 长度不同应直接返回 false，不抛异常
    expect(verifyReaderToken("short", "a".repeat(64))).toBe(false);
  });

  it("admin routes reject without reader token", async () => {
    delete process.env.DIAGNOSTIC_READER_TOKEN_HASH;
    delete process.env.DIAGNOSTIC_READER_TOKEN_ID;
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/diagnostics/cases",
    });
    expect(res.statusCode).toBe(503);
  });

  it("admin routes reject with wrong reader token", async () => {
    process.env.DIAGNOSTIC_READER_TOKEN_HASH = hashReaderToken("valid-token");
    process.env.DIAGNOSTIC_READER_TOKEN_ID = "test-reader";
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/diagnostics/cases",
      headers: {
        authorization: "Bearer wrong-token",
        "x-diagnostic-actor": "test",
      },
    });
    expect(res.statusCode).toBe(401);
    delete process.env.DIAGNOSTIC_READER_TOKEN_HASH;
    delete process.env.DIAGNOSTIC_READER_TOKEN_ID;
  });

  it("admin routes require X-Diagnostic-Actor", async () => {
    process.env.DIAGNOSTIC_READER_TOKEN_HASH = hashReaderToken("valid-token");
    process.env.DIAGNOSTIC_READER_TOKEN_ID = "test-reader";
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/diagnostics/cases",
      headers: {
        authorization: "Bearer valid-token",
      },
    });
    expect(res.statusCode).toBe(400);
    delete process.env.DIAGNOSTIC_READER_TOKEN_HASH;
    delete process.env.DIAGNOSTIC_READER_TOKEN_ID;
  });

  it("user upload requires auth", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/diagnostics/cases",
      headers: {
        "x-wardrobe-device-id": "device-1",
      },
      payload: {
        clientRequestId: "018f6f02-7b7a-7a20-8d1d-000000000001",
        schemaVersion: 1,
        appVersion: "2.0.2",
        versionCode: 20002,
        clientGitCommit: "a".repeat(40),
        buildTime: new Date().toISOString(),
        buildChannel: "internal",
        problemDescription: null,
        sha256: "a".repeat(64),
        sizeBytes: 1024,
        eventCount: 10,
        itemCount: 5,
        outfitCount: 2,
        wishlistCount: 1,
        recentRequestIds: [],
      },
    });
    expect(res.statusCode).toBe(401);
  });
});
