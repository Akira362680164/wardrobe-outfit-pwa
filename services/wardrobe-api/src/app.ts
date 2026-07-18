import {
  HealthResponseSchema,
  ReadyResponseSchema,
  VersionResponseSchema,
  type ReadyResponse,
} from "@wardrobe/cloud-contracts";
import Fastify, { type FastifyInstance } from "fastify";

import { registerAuthRoutes } from "./auth/routes.js";
import { AccountPasswordAuthService } from "./auth/account-password.js";
import { AccountDeletionService } from "./auth/account-deletion.js";
import { registerAccountDeletionRoutes } from "./auth/account-deletion-routes.js";
import { registerEmailAuthRoutes } from "./auth/email-routes.js";
import { EmailVerificationService } from "./auth/email-verification.js";
import { type RegistrationService } from "./auth/registrations.js";
import { registerSessionRoutes } from "./auth/session-routes.js";
import { SessionService } from "./auth/session.js";
import { registerWechatOpenIdAuthRoutes, WechatOpenIdAuthService } from "./auth/wechat-openid.js";
import { registerWechatPhoneAuthRoutes, WechatPhoneAuthService } from "./auth/wechat-phone.js";
import { registerAiIntakeRoutes } from "./ai/routes.js";
import { MiniMaxIntakeService, type MiniMaxIntakeServiceLike } from "./ai/minimax-intake-service.js";
import { registerAssetRoutes } from "./assets/routes.js";
import { AssetService } from "./assets/service.js";
import { registerDiagnosticRoutes, registerDiagnosticAdminRoutes } from "./diagnostics/routes.js";
import { DiagnosticService } from "./diagnostics/service.js";
import { registerRequestTraceMiddleware } from "./diagnostics/request-trace-middleware.js";
import { readFile } from "node:fs/promises";
import { checkDatabaseReady } from "./db/client.js";
import { getApiVersion } from "./version.js";
import { redactedLogSerializer } from "./shared/redact.js";
import { getEmailProviderReadiness } from "./email/factory.js";
import { loadStorageConfig } from "./storage/config.js";
import { createStorageProviderFromEnv } from "./storage/factory.js";
import { UnavailableStorageProvider, type StorageProvider } from "./storage/provider.js";
import { isStorageReady } from "./storage/readiness.js";
import { registerTestFaultInjection } from "./test/fault-injection.js";
import { registerWorkspaceRoutes } from "./workspace/routes.js";
import { WorkspaceQueryService } from "./workspace/query-service.js";
import { WorkspaceCommandService } from "./workspace/command-service.js";
import { registerImageCropRoutes } from "./image-crop/routes.js";
import { ImageCropService } from "./image-crop/service.js";
import { registerRecommendationRoutes } from "./recommendations/routes.js";
import { RecommendationReadService } from "./recommendations/read-service.js";
import { RecommendationRegenerationService } from "./recommendations/regeneration-service.js";
import { RecommendationGenerationCoordinator } from "./recommendations/coordinator.js";
import { RecommendationGenerationServiceV3 } from "./recommendations/generation-service-v3.js";
import { RecommendationAcceptService } from "./recommendations/accept-service.js";
import { RecommendationPlanCancelService } from "./recommendations/cancel-service.js";
import { RecommendationActionService } from "./recommendations/action-service.js";
import { getPostgresPool } from "./db/client.js";
import { FixedWindowRateLimiter } from "./auth/rate-limit.js";
import { WeatherLocationService, type WeatherLocationServiceLike } from "./weather/location-service.js";
import { createQWeatherProviderFromEnv } from "./weather/qweather-provider.js";
import { registerWeatherLocationRoutes, registerWeatherOverviewRoute } from "./weather/routes.js";
import { WeatherOverviewService } from "./weather/overview-service.js";

export type ReadinessCheck = () => Promise<{ database: "ready" }>;

export interface BuildAppOptions {
  readinessCheck?: ReadinessCheck;
  registrationService?: RegistrationService;
  sessionService?: SessionService;
  assetService?: AssetService;
  workspaceQueryService?: WorkspaceQueryService;
  workspaceCommandService?: WorkspaceCommandService;
  diagnosticService?: DiagnosticService;
  miniMaxIntakeService?: MiniMaxIntakeServiceLike;
  storageProvider?: StorageProvider | null;
  jwtReadinessCheck?: () => Promise<boolean>;
  emailReadinessCheck?: () => boolean;
  wechatPhoneAuthService?: WechatPhoneAuthService;
  wechatOpenIdAuthService?: WechatOpenIdAuthService;
  emailVerificationService?: EmailVerificationService;
  accountPasswordAuthService?: AccountPasswordAuthService;
  accountDeletionService?: AccountDeletionService;
  imageCropService?: ImageCropService;
  imageCropReadinessCheck?: () => Promise<boolean>;
  recommendationReadService?: RecommendationReadService;
  recommendationRegenerationService?: RecommendationRegenerationService;
  recommendationGenerationCoordinator?: RecommendationGenerationCoordinator;
  recommendationAcceptService?: RecommendationAcceptService;
  recommendationPlanCancelService?: RecommendationPlanCancelService;
  recommendationActionService?: RecommendationActionService;
  weatherLocationService?: WeatherLocationServiceLike;
  weatherOverviewService?: WeatherOverviewService;
  locationCostLimiter?: FixedWindowRateLimiter;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const readinessCheck = options.readinessCheck ?? checkDatabaseReady;
  const storageConfig = loadStorageConfig();
  const configuredStorage = Object.prototype.hasOwnProperty.call(options, "storageProvider")
    ? options.storageProvider ?? null
    : createStorageProviderFromEnv();
  const storage = configuredStorage ?? new UnavailableStorageProvider();
  const imageCropService = options.imageCropService ?? new ImageCropService();
  if (!options.imageCropService && !options.imageCropReadinessCheck) imageCropService.start();
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

  registerTestFaultInjection(app);

  app.get("/api/health", async () =>
    HealthResponseSchema.parse({
      status: "ok",
      serverTime: new Date().toISOString(),
    }),
  );

  app.get("/api/ready", async (_request, reply) => {
    const serverTime = new Date().toISOString();
    const deps: ReadyResponse["dependencies"] = {
      database: "unavailable",
    storage: "unavailable",
    jwt: "unavailable",
    email: "unavailable",
    wechat: "unavailable",
    imageCrop: "unavailable",
    };

    try {
      await readinessCheck();
      deps.database = "ready";
    } catch {
      // database check failed
    }

    deps.storage = await isStorageReady(configuredStorage) ? "ready" : "unavailable";
    const jwtReady = await (options.jwtReadinessCheck ?? checkJwtKeysReady)();
    deps.jwt = jwtReady ? "ready" : "unavailable";
    const emailReady = (options.emailReadinessCheck ?? (() => getEmailProviderReadiness() === "ready"))();
    deps.email = emailReady ? "ready" : "unavailable";
    const wechatReady = checkWechatReady();
    deps.wechat = wechatReady ? "ready" : "unavailable";
    const imageCropReady = await (options.imageCropReadinessCheck ?? (async () => imageCropService.isReady()))();
    deps.imageCrop = imageCropReady ? "ready" : "unavailable";

    const allReady = deps.database === "ready" && deps.storage === "ready" && jwtReady && emailReady && wechatReady && imageCropReady;
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
      dependencies: { database: "ready", storage: "ready", jwt: "ready", email: "ready", wechat: "ready", imageCrop: "ready" },
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
  const emailVerificationService = options.emailVerificationService ?? new EmailVerificationService();
  const accountPasswordAuthService = options.accountPasswordAuthService ?? new AccountPasswordAuthService({
    sessionService: sharedSessionService ?? new SessionService(),
    emailVerificationService,
  });

  const assetService = options.assetService ?? new AssetService(storage);

  registerAuthRoutes(app, options.registrationService, sharedSessionService, accountPasswordAuthService);
  registerSessionRoutes(app, sharedSessionService, accountPasswordAuthService);
  registerEmailAuthRoutes(app, emailVerificationService);
  registerAccountDeletionRoutes(
    app,
    sharedSessionService ?? new SessionService(),
    options.accountDeletionService ?? new AccountDeletionService({
      storage,
      emailVerificationService,
    }),
  );
  registerWechatOpenIdAuthRoutes(
    app,
    options.wechatOpenIdAuthService ?? new WechatOpenIdAuthService({
      sessionService: sharedSessionService ?? new SessionService(),
      emailVerificationService,
    }),
  );
  registerWechatPhoneAuthRoutes(
    app,
    options.wechatPhoneAuthService ?? new WechatPhoneAuthService({
      sessionService: sharedSessionService ?? new SessionService(),
    }),
  );
  registerAssetRoutes(app, assetService, sharedSessionService ?? new SessionService(), storageConfig.maxAssetBytes);
  registerWorkspaceRoutes(
    app,
    options.workspaceQueryService ?? new WorkspaceQueryService(),
    options.workspaceCommandService ?? new WorkspaceCommandService(),
    assetService,
    sharedSessionService ?? new SessionService(),
  );
  registerAiIntakeRoutes(app, sharedSessionService ?? new SessionService(), options.miniMaxIntakeService ?? new MiniMaxIntakeService());
  registerImageCropRoutes(app, sharedSessionService ?? new SessionService(), imageCropService);
  let defaultRegeneration: RecommendationRegenerationService | undefined;
  const regeneration = options.recommendationRegenerationService ?? ({ enqueueExplicit: (...args: Parameters<RecommendationRegenerationService["enqueueExplicit"]>) => (defaultRegeneration ??= new RecommendationRegenerationService()).enqueueExplicit(...args) } as RecommendationRegenerationService);
  let defaultRealtime: RecommendationGenerationCoordinator | undefined;
  const realtime = options.recommendationGenerationCoordinator ?? (process.env.RECOMMENDATION_REALTIME_ENABLED === "true" ? (defaultRealtime ??= (() => { const generation = new RecommendationGenerationServiceV3(getPostgresPool()); return new RecommendationGenerationCoordinator({ prepare: (...args) => generation.prepare(...args), findCurrent: (...args) => generation.persistence.findCurrent(...args), publish: (...args) => generation.persistence.publish(...args), publishHomePair: (...args) => generation.persistence.publishHomePair(...args) }); })()) : undefined);
  const accept = options.recommendationAcceptService ?? (process.env.RECOMMENDATION_ACCEPT_ENABLED === "true" ? new RecommendationAcceptService(getPostgresPool()) : undefined);
  let defaultCancel: RecommendationPlanCancelService | undefined;
  let defaultActions: RecommendationActionService | undefined;
  const cancel = options.recommendationPlanCancelService ?? (process.env.RECOMMENDATION_ACCEPT_ENABLED === "true" ? ({ cancel: (...args: Parameters<RecommendationPlanCancelService["cancel"]>) => (defaultCancel ??= new RecommendationPlanCancelService(getPostgresPool())).cancel(...args) } as RecommendationPlanCancelService) : undefined);
  const actions = options.recommendationActionService ?? (process.env.RECOMMENDATION_ACCEPT_ENABLED === "true" ? ({ reject: (...args: Parameters<RecommendationActionService["reject"]>) => (defaultActions ??= new RecommendationActionService(getPostgresPool())).reject(...args) } as RecommendationActionService) : undefined);
  registerRecommendationRoutes(app, sharedSessionService ?? new SessionService(), options.recommendationReadService ?? new RecommendationReadService(), regeneration, realtime, accept, cancel, actions);
  const qweather = createQWeatherProviderFromEnv();
  registerWeatherLocationRoutes(app, sharedSessionService ?? new SessionService(), options.weatherLocationService ?? new WeatherLocationService(undefined, qweather), options.locationCostLimiter);
  let defaultOverview: WeatherOverviewService | undefined;
  const overview = options.weatherOverviewService ?? ({ get: (...args: Parameters<WeatherOverviewService["get"]>) => (defaultOverview ??= new WeatherOverviewService({ provider: qweather })).get(...args) } as WeatherOverviewService);
  registerWeatherOverviewRoute(app, sharedSessionService ?? new SessionService(), overview);
  app.addHook("onClose", async () => imageCropService.close());
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

function checkWechatReady(): boolean {
  // Test fixtures inject a fake WeChat client and must not require a production
  // secret. Every non-test process needs the secret before /api/ready can be OK.
  if (process.env.NODE_ENV === "test") return true;
  return Boolean(process.env.WECHAT_MINIPROGRAM_APP_SECRET);
}

function getAllowedOrigins() {
  return new Set(
    (process.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}
