import type { FastifyInstance } from "fastify";
import { getDb } from "../db/client.js";
import { apiRequestTraces } from "../db/schema.js";
import { createHmac } from "node:crypto";
import { getApiVersion } from "../version.js";

export function registerRequestTraceMiddleware(app: FastifyInstance): void {
  const serverVersion = getApiVersion();
  const serverGitCommit = process.env.GIT_COMMIT ?? "unknown";

  app.addHook("onRequest", async (request) => {
    (request as any)._traceStartMs = Date.now();
  });

  app.addHook("onSend", async (request, reply, payload) => {
    const startMs = (request as any)._traceStartMs as number | undefined;
    if (!startMs) return;

    const route = (request.routeOptions as any)?.url ?? (request as any).routerPath ?? "unknown";
    const method = request.method;
    const statusCode = reply.statusCode;

    // 只记录项目 API 请求（/api/ 开头）
    if (!route.startsWith("/api/")) return;

    // 排除健康探测（避免噪音）
    if (route === "/api/health" || route === "/api/ready" || route === "/api/version") return;

    const requestId = request.headers["x-wardrobe-request-id"] as string | undefined;
    if (!requestId) return;

    const durationMs = Date.now() - startMs;
    const secretKey = process.env.DIAGNOSTIC_HASH_SECRET ?? process.env.DIAGNOSTIC_READER_TOKEN_HASH ?? "diagnostic-local-hash";
    const userId = (request as any)._traceUserId as string | undefined;
    const deviceId = request.headers["x-wardrobe-device-id"] as string | undefined;

    const userIdHash = userId ? hashUserId(userId, secretKey) : null;
    const deviceIdHash = deviceId ? hashDeviceId(deviceId, secretKey) : null;

    const errorCode = extractErrorCode(payload);

    try {
      await getDb().insert(apiRequestTraces).values({
        requestId,
        occurredAt: new Date(startMs),
        method,
        routeTemplate: route,
        statusCode,
        durationMs,
        userIdHash,
        deviceIdHash,
        errorCode,
        serverVersion,
        serverGitCommit,
      });
    } catch {
      // 轨迹记录失败不中断请求
    }
  });
}

function extractErrorCode(payload: unknown): string | null {
  if (typeof payload !== "string") return null;
  try {
    const obj = JSON.parse(payload);
    return typeof obj?.code === "string" ? obj.code : null;
  } catch {
    return null;
  }
}

function hashUserId(userId: string, secretKey: string): string {
  return createHmac("sha256", secretKey).update(userId).digest("hex");
}

function hashDeviceId(deviceId: string, secretKey: string): string {
  return createHmac("sha256", secretKey).update(deviceId).digest("hex").slice(0, 16);
}
