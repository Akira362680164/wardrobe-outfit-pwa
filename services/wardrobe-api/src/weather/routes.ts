import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  DeleteLocationOverrideCommandSchema,
  DeleteLocationProfileCommandSchema,
  LocationDateOverrideStateSchema,
  PutLocationOverrideCommandSchema,
  PutLocationProfileCommandSchema,
  ResolveDeviceLocationCommandSchema,
  UserLocationProfileSchema,
  WeatherLocationCandidatesResponseSchema,
  WeatherLocationSearchQuerySchema,
  WeatherOverviewQuerySchema,
  WeatherOverviewSchema,
} from "@wardrobe/cloud-contracts";
import type { SessionService } from "../auth/session.js";
import { FixedWindowRateLimiter } from "../auth/rate-limit.js";
import { sendWorkspaceError, WorkspaceApiError } from "../workspace/errors.js";
import { LocationMutationConflictError, LocationUnavailableError, type WeatherLocationServiceLike } from "./location-service.js";
import { QWeatherProviderError } from "./qweather-provider.js";
import type { WeatherOverviewService } from "./overview-service.js";

export const DEFAULT_LOCATION_COST_LIMIT = { maxAttempts: 20, windowMs: 60 * 60_000 };

export function registerWeatherLocationRoutes(app: FastifyInstance, sessionService: SessionService, service: WeatherLocationServiceLike, limiter = new FixedWindowRateLimiter(DEFAULT_LOCATION_COST_LIMIT)) {
  const auth = async (request: FastifyRequest) => {
    const claims = await sessionService.authenticate(request.headers.authorization);
    const deviceId = request.headers["x-wardrobe-device-id"];
    if (typeof deviceId !== "string" || !deviceId) throw new WorkspaceApiError(400, "invalid_request", "缺少设备标识");
    if (deviceId !== claims.deviceId) throw new WorkspaceApiError(403, "auth", "设备标识与登录会话不一致");
    return claims;
  };
  const route = (handler: (request: FastifyRequest) => Promise<unknown>) => async (request: FastifyRequest, reply: any) => {
    try { return await handler(request); } catch (error) {
      if (error instanceof LocationMutationConflictError) return reply.code(409).send({ code: "conflict", message: error.code, retryable: false, ...(error.serverData === undefined ? {} : { serverData: error.serverData }) });
      if (error instanceof LocationUnavailableError || error instanceof QWeatherProviderError) {
        if (error instanceof QWeatherProviderError && error.code === "rate_limited" && error.retryAfterSeconds) reply.header("Retry-After", String(error.retryAfterSeconds));
        return reply.code(error instanceof QWeatherProviderError && error.code === "rate_limited" ? 429 : 503).send({ code: error instanceof QWeatherProviderError && error.code === "rate_limited" ? "rate_limited" : "weather_unavailable", message: "天气服务暂不可用", retryable: true, ...(error instanceof QWeatherProviderError && error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}) });
      }
      return sendWorkspaceError(reply, error);
    }
  };

  app.get("/api/settings/location-profile", route(async (request) => { const claims = await auth(request); const value = await service.getProfile(claims.userId); return value.revision === 0 ? value : UserLocationProfileSchema.parse(value); }));
  app.put("/api/settings/location-profile", route(async (request) => { const claims = await auth(request); return UserLocationProfileSchema.parse(await service.putProfile(claims.userId, PutLocationProfileCommandSchema.parse(request.body))); }));
  app.delete("/api/settings/location-profile", route(async (request) => { const claims = await auth(request); return UserLocationProfileSchema.parse(await service.deleteProfile(claims.userId, DeleteLocationProfileCommandSchema.parse(request.body))); }));
  app.get("/api/settings/location-override", route(async (request) => { const claims = await auth(request); return LocationDateOverrideStateSchema.parse(await service.getOverride(claims.userId)); }));
  app.put("/api/settings/location-override", route(async (request) => { const claims = await auth(request); return LocationDateOverrideStateSchema.parse(await service.putOverride(claims.userId, PutLocationOverrideCommandSchema.parse(request.body))); }));
  app.delete("/api/settings/location-override", route(async (request) => { const claims = await auth(request); return LocationDateOverrideStateSchema.parse(await service.deleteOverride(claims.userId, DeleteLocationOverrideCommandSchema.parse(request.body))); }));
  app.get("/api/weather/locations/search", route(async (request) => { const claims = await auth(request); takeCost(limiter, claims.userId); const { q } = WeatherLocationSearchQuerySchema.parse(request.query); return WeatherLocationCandidatesResponseSchema.parse(await service.search(claims.userId, q)); }));
  app.post("/api/weather/locations/resolve-device", route(async (request) => { const claims = await auth(request); takeCost(limiter, claims.userId); const body = ResolveDeviceLocationCommandSchema.parse(request.body); return WeatherLocationCandidatesResponseSchema.parse(await service.resolveDevice(claims.userId, round2(body.longitude), round2(body.latitude))); }));
}

export function registerWeatherOverviewRoute(app: FastifyInstance, sessionService: SessionService, service: WeatherOverviewService, limiter = new FixedWindowRateLimiter({ maxAttempts: 120, windowMs: 60 * 60_000 })) {
  app.get("/api/weather/overview", async (request, reply) => {
    try {
      const claims = await sessionService.authenticate(request.headers.authorization);
      const deviceId = request.headers["x-wardrobe-device-id"];
      if (typeof deviceId !== "string" || deviceId !== claims.deviceId) throw new WorkspaceApiError(403, "auth", "设备标识与登录会话不一致");
      const limit = limiter.take(`weather-overview:${claims.userId}`);
      if (!limit.allowed) return reply.header("Retry-After", String(limit.retryAfterSeconds)).code(429).send({ code: "rate_limited", message: "请求过于频繁", retryable: true, retryAfterSeconds: limit.retryAfterSeconds });
      const { date } = WeatherOverviewQuerySchema.parse(request.query);
      return WeatherOverviewSchema.parse(await service.get(claims.userId, date));
    } catch (error) { return sendWorkspaceError(reply, error); }
  });
}

function takeCost(limiter: FixedWindowRateLimiter, userId: string) { const result = limiter.take(`weather-location:${userId}`); if (!result.allowed) throw new QWeatherProviderError("rate_limited", result.retryAfterSeconds); }
function round2(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
