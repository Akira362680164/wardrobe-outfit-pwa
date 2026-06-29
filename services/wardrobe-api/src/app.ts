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
import { loadStorageConfig } from "./storage/config.js";
import { createStorageProviderFromEnv } from "./storage/factory.js";
import { UnavailableStorageProvider, type StorageProvider } from "./storage/provider.js";
import { isStorageReady } from "./storage/readiness.js";

export type ReadinessCheck = () => Promise<{ database: "ready" }>;

export interface BuildAppOptions {
  readinessCheck?: ReadinessCheck;
  registrationService?: RegistrationService;
  sessionService?: SessionService;
  syncService?: SyncService;
  assetService?: AssetService;
  diagnosticService?: DiagnosticService;
  storageProvider?: StorageProvider | null;
  jwtReadinessCheck?: () => Promise<boolean>;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const readinessCheck = options.readinessCheck ?? checkDatabaseReady;
  const storageConfig = loadStorageConfig();
  const configuredStorage = Object.prototype.hasOwnProperty.call(options, "storageProvider")
    ? options.storageProvider ?? null
    : createStorageProviderFromEnv();
  const storage = configuredStorage ?? new UnavailableStorageProvider();
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
      reply.header("Access-Control-Allow-Headers", "Authorization, Content-Type, Cache-Control, X-Wardrobe-Device-Id, X-Wardrobe-Request-Id, X-Diagnostic-Actor, X-Asset-Owner-Entity-Type, X-Asset-Owner-Entity-Id, X-Asset-SHA256, X-Asset-Size-Bytes, X-Asset-Width, X-Asset-Height, X-Diagnostic-Client-Request-Id, X-Diagnostic-SHA256, X-Diagnostic-Size-Bytes");
      reply.header("Access-Control-Expose-Headers", "X-Wardrobe-Request-Id, X-Asset-SHA256, X-Asset-Variant, X-Diagnostic-SHA256, Content-Length, ETag");
      reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
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
    const deps: ReadyResponse["dependencies"] = { database: "unavailable", storage: "unavailable", jwt: "unavailable" };

    try {
      await readinessCheck();
      deps.database = "ready";
    } catch {
      // database check failed
    }

    deps.storage = await isStorageReady(configuredStorage) ? "ready" : "unavailable";
    const jwtReady = await (options.jwtReadinessCheck ?? checkJwtKeysReady)();
    deps.jwt = jwtReady ? "ready" : "unavailable";

    const allReady = deps.database === "ready" && deps.storage === "ready" && jwtReady;
    if (!allReady) {
      reply.code(503);
      return ReadyResponseSchema.parse({
        status: "degraded",
        dependencies: {
          ...deps,
        },
        serverTime,
      });
    }

    return ReadyResponseSchema.parse({
      status: "ok",
      dependencies: { database: "ready", storage: "ready", jwt: "ready" },
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

  const assetService = options.assetService ?? new AssetService(storage);

  registerAuthRoutes(app, options.registrationService, sharedSessionService);
  registerSessionRoutes(app, sharedSessionService);
  registerSyncRoutes(app, options.syncService ?? new SyncService(
    undefined,
    (input) => assetService.deleteAsset(input),
    (input) => assetService.deleteAssetsForOwner(input),
  ), sharedSessionService ?? new SessionService());
  registerAssetRoutes(app, assetService, sharedSessionService ?? new SessionService(), storageConfig.maxAssetBytes);
  const diagnosticService = options.diagnosticService ?? new DiagnosticService(storage);
  registerDiagnosticRoutes(app, sharedSessionService ?? new SessionService(), diagnosticService);
  registerDiagnosticAdminRoutes(app, diagnosticService);

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
