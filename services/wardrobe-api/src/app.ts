import {
  HealthResponseSchema,
  ReadyResponseSchema,
  VersionResponseSchema,
  type ReadyResponse,
} from "@wardrobe/cloud-contracts";
import Fastify, { type FastifyInstance } from "fastify";

import { registerAuthRoutes } from "./auth/routes.js";
import { type RegistrationService } from "./auth/registrations.js";
import { checkDatabaseReady } from "./db/client.js";
import { getApiVersion } from "./version.js";

export type ReadinessCheck = () => Promise<{ database: "ready" }>;

export interface BuildAppOptions {
  readinessCheck?: ReadinessCheck;
  registrationService?: RegistrationService;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const readinessCheck = options.readinessCheck ?? checkDatabaseReady;
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
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

  registerAuthRoutes(app, options.registrationService);

  return app;
}
