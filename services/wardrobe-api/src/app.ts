import {
  HealthResponseSchema,
  ReadyResponseSchema,
  VersionResponseSchema,
  type ReadyResponse,
} from "@wardrobe/cloud-contracts";
import Fastify, { type FastifyInstance } from "fastify";

import { registerAuthRoutes } from "./auth/routes.js";
import { type RegistrationService } from "./auth/registrations.js";
import { registerSessionRoutes } from "./auth/session-routes.js";
import { SessionService } from "./auth/session.js";
import { registerAssetRoutes } from "./assets/routes.js";
import { AssetService } from "./assets/service.js";
import { registerDiagnosticRoutes, registerDiagnosticAdminRoutes } from "./diagnostics/routes.js";
import { DiagnosticService } from "./diagnostics/service.js";
import { registerRequestTraceMiddleware } from "./diagnostics/request-trace-middleware.js";
import { readFile } from "node:fs/promises";
import { checkDatabaseReady } from "./db/client.js";
import { getApiVersion } from "./version.js";
import { registerSyncRoutes } from "./sync/routes.js";
import { SyncService } from "./sync/service.js";
import { redactedLogSerializer } from "./shared/redact.js";

export type ReadinessCheck = () => Promise<{ database: "ready" }>;

export interface BuildAppOptions {
  readinessCheck?: ReadinessCheck;
  registrationService?: RegistrationService;
  sessionService?: SessionService;
  syncService?: SyncService;
  assetService?: AssetService;
  diagnosticService?: DiagnosticService;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const readinessCheck = options.readinessCheck ?? checkDatabaseReady;
  const app = Fastify({
    trustProxy: true,
    logger: process.env.NODE_ENV !== "test"
      ? { serializers: { req: redactedLogSerializer as never, res: redactedLogSerializer as never } }
      : false,
  });

  registerRequestTraceMiddleware(app);

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && getAllowedOrigins().has(origin)) {
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Access-Control-Allow-Credentials", "true");
      reply.header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Wardrobe-Device-Id, X-Wardrobe-Request-Id, X-Diagnostic-Actor");
      reply.header("Access-Control-Expose-Headers", "X-Wardrobe-Request-Id");
      reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      reply.header("Vary", "Origin");
    }
    if (request.method === "OPTIONS") return reply.code(204).send();
  });

  app.get("/api/health", async () =>
    HealthResponseSchema.parse({
      status: "ok",
      serverTime: new Date().toISOString(),
    }),
  );

  app.get("/api/ready", async (_request, reply) => {
    const serverTime = new Date().toISOString();
    const deps: ReadyResponse["dependencies"] = { database: "unavailable" };

    try {
      await readinessCheck();
      deps.database = "ready";
    } catch {
      // database check failed
    }

    // P1-N13: 检查 COS 配置和 JWT 密钥文件
    const cosConfigured = Boolean(
      process.env.COS_BUCKET?.trim() && process.env.COS_REGION?.trim() &&
      process.env.COS_SECRET_ID?.trim() && process.env.COS_SECRET_KEY?.trim(),
    );
    const jwtReady = await checkJwtKeysReady();

    const allReady = deps.database === "ready" && cosConfigured && jwtReady;
    if (!allReady) {
      reply.code(503);
      return ReadyResponseSchema.parse({
        status: "degraded",
        dependencies: {
          database: deps.database,
          ...(cosConfigured ? {} : { cos: "unavailable" as const }),
          ...(jwtReady ? {} : { jwt: "unavailable" as const }),
        },
        serverTime,
      });
    }

    return ReadyResponseSchema.parse({
      status: "ok",
      dependencies: { database: "ready" },
      serverTime,
    });
  });

  app.get("/api/version", async () =>
    VersionResponseSchema.parse({
      name: "wardrobe-api",
      version: getApiVersion(),
      gitCommit: process.env.GIT_COMMIT ?? null,
      serverTime: new Date().toISOString(),
    }),
  );

  const sharedSessionService =
    options.sessionService ?? (options.registrationService ? undefined : new SessionService());

  registerAuthRoutes(app, options.registrationService, sharedSessionService);
  registerSessionRoutes(app, sharedSessionService);
  registerSyncRoutes(app, options.syncService ?? new SyncService(), sharedSessionService ?? new SessionService());
  registerAssetRoutes(app, options.assetService ?? new AssetService(), sharedSessionService ?? new SessionService());
  registerDiagnosticRoutes(app, sharedSessionService ?? new SessionService(), options.diagnosticService);
  registerDiagnosticAdminRoutes(app, options.diagnosticService);

  return app;
}

async function checkJwtKeysReady(): Promise<boolean> {
  try {
    const privatePath = process.env.JWT_PRIVATE_KEY_PATH ?? "/run/secrets/jwt-private.pem";
    const publicPath = process.env.JWT_PUBLIC_KEY_PATH ?? "/run/secrets/jwt-public.pem";
    await Promise.all([readFile(privatePath), readFile(publicPath)]);
    return true;
  } catch {
    return false;
  }
}

function getAllowedOrigins() {
  return new Set(
    (process.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}
