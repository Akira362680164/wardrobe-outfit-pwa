import type { Pool } from "pg";
import {
  ResolvedRecommendationContextSchema,
  WeatherLocationRefSchema,
  type ResolvedRecommendationContext,
  type WeatherLocationRef,
} from "@wardrobe/cloud-contracts";

export interface TravelLocationSnapshot {
  id?: string;
  userId: string;
  startDate: string | null;
  endDate: string | null;
  deletedAt: Date | null;
  updatedAt: Date;
  payload: Record<string, unknown>;
}
export interface OverrideLocationSnapshot {
  userId: string;
  effectiveFrom: string | null;
  effectiveThrough: string | null;
  isCurrent: boolean;
  supersededAt: Date | null;
  location: unknown;
}
export interface ProfileLocationSnapshot {
  userId: string;
  isCurrent: boolean;
  supersededAt: Date | null;
  location: unknown;
}

export function resolveRecommendationContextSnapshot(input: {
  userId: string;
  targetDate: string;
  contextResolvedAt: string;
  travelPlans: TravelLocationSnapshot[];
  overrides: OverrideLocationSnapshot[];
  profiles: ProfileLocationSnapshot[];
}): ResolvedRecommendationContext {
  const authoritativeTravel = input.travelPlans
    .filter((row) => row.userId === input.userId && !row.deletedAt && row.startDate !== null && row.endDate !== null && row.startDate <= input.targetDate && row.endDate >= input.targetDate)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || (b.id ?? "").localeCompare(a.id ?? ""))[0];
  const travel = strictLocation(authoritativeTravel?.payload.weatherLocation);
  if (travel) return located(input.targetDate, input.contextResolvedAt, travel, "travel");
  const override = input.overrides
    .filter((row) => row.userId === input.userId && row.isCurrent && !row.supersededAt && row.effectiveFrom !== null && row.effectiveThrough !== null && row.effectiveFrom <= input.targetDate && row.effectiveThrough >= input.targetDate)
    .map((row) => strictLocation(row.location))
    .find((location): location is WeatherLocationRef => location !== null);
  if (override) return located(input.targetDate, input.contextResolvedAt, override, "temporary_override");
  const profile = input.profiles
    .filter((row) => row.userId === input.userId && row.isCurrent && !row.supersededAt)
    .map((row) => strictLocation(row.location))
    .find((location): location is WeatherLocationRef => location !== null);
  if (profile) return located(input.targetDate, input.contextResolvedAt, profile, "home_city");
  return ResolvedRecommendationContextSchema.parse({ targetDate: input.targetDate, targetTimezone: "Asia/Shanghai", contextResolvedAt: input.contextResolvedAt, contextMode: "locationless" });
}

export class RecommendationContextResolver {
  constructor(private readonly pool: Pool, private readonly clock: () => Date = () => new Date()) {}

  async resolve(userId: string, targetDate: string): Promise<ResolvedRecommendationContext> {
    const [travel, override, profile] = await Promise.all([
      this.pool.query(`select id, user_id, start_date::text, end_date::text, deleted_at, updated_at, payload from trip_plans where user_id=$1 and deleted_at is null and start_date <= $2 and end_date >= $2 order by updated_at desc,id desc`, [userId, targetDate]),
      this.pool.query(`select user_id, effective_from::text, effective_through::text, is_current, superseded_at, location_id, display_name, timezone, centroid_latitude, centroid_longitude from location_date_overrides where user_id=$1 and is_current=true and superseded_at is null and effective_from <= $2 and effective_through >= $2`, [userId, targetDate]),
      this.pool.query(`select user_id, is_current, superseded_at, location_id, display_name, timezone, centroid_latitude, centroid_longitude from user_location_profiles where user_id=$1 and is_current=true and superseded_at is null`, [userId]),
    ]);
    const location = (row: any) => row.location_id ? { locationId: row.location_id, displayName: row.display_name, timezone: row.timezone, ...(row.centroid_latitude === null ? {} : { centroidLatitude: row.centroid_latitude }), ...(row.centroid_longitude === null ? {} : { centroidLongitude: row.centroid_longitude }) } : null;
    return resolveRecommendationContextSnapshot({
      userId, targetDate, contextResolvedAt: this.clock().toISOString(),
      travelPlans: travel.rows.map((row: any) => ({ id: row.id, userId: row.user_id, startDate: row.start_date, endDate: row.end_date, deletedAt: row.deleted_at, updatedAt: row.updated_at, payload: row.payload })),
      overrides: override.rows.map((row: any) => ({ userId: row.user_id, effectiveFrom: row.effective_from, effectiveThrough: row.effective_through, isCurrent: row.is_current, supersededAt: row.superseded_at, location: location(row) })),
      profiles: profile.rows.map((row: any) => ({ userId: row.user_id, isCurrent: row.is_current, supersededAt: row.superseded_at, location: location(row) })),
    });
  }
}

function strictLocation(value: unknown): WeatherLocationRef | null {
  const parsed = WeatherLocationRefSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
function located(targetDate: string, contextResolvedAt: string, resolvedLocation: WeatherLocationRef, locationSource: "travel" | "temporary_override" | "home_city") {
  return ResolvedRecommendationContextSchema.parse({ targetDate, targetTimezone: resolvedLocation.timezone, contextResolvedAt, contextMode: "forecast", resolvedLocation, locationSource });
}
