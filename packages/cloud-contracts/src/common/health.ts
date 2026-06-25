import { z } from "zod";

export const ApiStatusSchema = z.enum(["ok", "degraded"]);

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  serverTime: z.string().datetime(),
});

export const ReadyResponseSchema = z.object({
  status: ApiStatusSchema,
  dependencies: z.object({
    database: z.enum(["ready", "unavailable"]),
  }),
  serverTime: z.string().datetime(),
});

export const VersionResponseSchema = z.object({
  name: z.literal("wardrobe-api"),
  version: z.string().min(1),
  gitCommit: z.string().min(1).nullable(),
  serverTime: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type ReadyResponse = z.infer<typeof ReadyResponseSchema>;
export type VersionResponse = z.infer<typeof VersionResponseSchema>;
