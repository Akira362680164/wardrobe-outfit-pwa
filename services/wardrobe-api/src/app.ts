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
import { checkDatabaseReady } from "./db/client.js";
import { getApiVersion } from "./version.js";
import { registerSyncRoutes } from "./sync/routes.js";
import { SyncService } from "./sync/service.js";

export type ReadinessCheck = () => Promise<{ database: "ready" }>;

export interface BuildAppOptions {
  readinessCheck?: ReadinessCheck;
  registrationService?: RegistrationService;
  sessionService?: SessionService;
  syncService?: SyncService;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const readinessCheck = options.readinessCheck ?? checkDatabaseReady;
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
  });

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && getAllowedOrigins().has(origin)) {
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Access-Control-Allow-Credentials", "true");
      reply.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
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

    try {
      await readinessCheck();
      const body: ReadyResponse = {
        status: "ok",
        dependencies: { database: "ready" },
        serverTime,
      };
      return ReadyResponseSchema.parse(body);
    } catch {
      reply.code(503);
      const body: ReadyResponse = {
        status: "degraded",
        dependencies: { database: "unavailable" },
        serverTime,
      };
      return ReadyResponseSchema.parse(body);
    }
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

  return app;
}

function getAllowedOrigins() {
  return new Set(
    (process.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}
