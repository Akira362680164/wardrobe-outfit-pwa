import { createHash } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import {
  LocationDateOverrideSchema,
  UserLocationProfileSchema,
  WeatherLocationCandidatesResponseSchema,
  type DeleteLocationOverrideCommand,
  type DeleteLocationProfileCommand,
  type LocationDateOverride,
  type LocationDateOverrideState,
  type PutLocationOverrideCommand,
  type PutLocationProfileCommand,
  type UserLocationProfile,
  type WeatherLocationCandidate,
} from "@wardrobe/cloud-contracts";
import { getPostgresPool } from "../db/client.js";
import type { QWeatherProviderLike } from "./qweather-provider.js";

export class LocationMutationConflictError extends Error {
  readonly statusCode = 409;
  constructor(public readonly code: "mutation_conflict" | "revision_conflict", public readonly serverData?: unknown) { super(code); }
}
export class LocationUnavailableError extends Error {
  readonly statusCode = 503; readonly code = "weather_unavailable"; constructor() { super("weather_unavailable"); }
}

export interface WeatherLocationServiceLike {
  getProfile(userId: string): Promise<UserLocationProfile | { homeCity: null; revision: 0; updatedAt: null }>;
  putProfile(userId: string, command: PutLocationProfileCommand): Promise<UserLocationProfile>;
  deleteProfile(userId: string, command: DeleteLocationProfileCommand): Promise<UserLocationProfile>;
  getOverride(userId: string): Promise<LocationDateOverrideState>;
  putOverride(userId: string, command: PutLocationOverrideCommand): Promise<LocationDateOverrideState>;
  deleteOverride(userId: string, command: DeleteLocationOverrideCommand): Promise<LocationDateOverrideState>;
  search(userId: string, query: string): Promise<{ candidates: WeatherLocationCandidate[] }>;
  resolveDevice(userId: string, longitude: number, latitude: number): Promise<{ candidates: WeatherLocationCandidate[] }>;
}

interface GeoProvider {
  getLocationById(locationId: string, signal?: AbortSignal): Promise<WeatherLocationCandidate>;
  searchLocations(query: string, signal?: AbortSignal): Promise<WeatherLocationCandidate[]>;
  resolveCoordinates(longitude: number, latitude: number, signal?: AbortSignal): Promise<WeatherLocationCandidate[]>;
}

export class WeatherLocationService implements WeatherLocationServiceLike {
  constructor(private readonly pool: Pool | undefined, private readonly provider: GeoProvider, private readonly clock: () => Date = () => new Date()) {}

  async getProfile(userId: string) {
    const row = (await this.database().query("select * from user_location_profiles where user_id=$1 and is_current=true", [userId])).rows[0];
    return row ? profile(row) : { homeCity: null, revision: 0 as const, updatedAt: null };
  }
  async putProfile(userId: string, command: PutLocationProfileCommand) {
    const fingerprint = digest({ operation: "put", ...command });
    const replay = await this.findProfileMutation(userId, command.clientMutationId, fingerprint); if (replay) return replay;
    const location = await this.provider.getLocationById(command.locationId);
    return this.mutateProfile(userId, command, fingerprint, location);
  }
  async deleteProfile(userId: string, command: DeleteLocationProfileCommand) {
    const fingerprint = digest({ operation: "delete", ...command });
    const replay = await this.findProfileMutation(userId, command.clientMutationId, fingerprint); if (replay) return replay;
    return this.mutateProfile(userId, command, fingerprint, null);
  }
  async getOverride(userId: string) {
    const row = (await this.database().query("select * from location_date_overrides where user_id=$1 and is_current=true", [userId])).rows[0];
    return row ? overrideState(row) : { override: null, revision: 0, updatedAt: null };
  }
  async putOverride(userId: string, command: PutLocationOverrideCommand) {
    const fingerprint = digest({ operation: "put", ...command });
    const replay = await this.findOverrideMutation(userId, command.clientMutationId, fingerprint); if (replay !== undefined) return replay;
    const location = await this.provider.getLocationById(command.locationId);
    return this.mutateOverride(userId, command, fingerprint, location);
  }
  async deleteOverride(userId: string, command: DeleteLocationOverrideCommand) {
    const fingerprint = digest({ operation: "delete", ...command });
    const replay = await this.findOverrideMutation(userId, command.clientMutationId, fingerprint); if (replay !== undefined) return replay;
    return this.mutateOverride(userId, command, fingerprint, null);
  }
  async search(_userId: string, query: string) { return WeatherLocationCandidatesResponseSchema.parse({ candidates: await this.provider.searchLocations(query) }); }
  async resolveDevice(_userId: string, longitude: number, latitude: number) { return WeatherLocationCandidatesResponseSchema.parse({ candidates: await this.provider.resolveCoordinates(round2(longitude), round2(latitude)) }); }

  private async findProfileMutation(userId: string, mutationId: string, fingerprint: string) {
    const row = (await this.database().query("select * from user_location_profiles where user_id=$1 and client_mutation_id=$2", [userId, mutationId])).rows[0];
    if (!row) return null; if (row.mutation_fingerprint !== fingerprint) throw new LocationMutationConflictError("mutation_conflict"); return profile(row);
  }
  private async findOverrideMutation(userId: string, mutationId: string, fingerprint: string): Promise<LocationDateOverrideState | undefined> {
    const row = (await this.database().query("select * from location_date_overrides where user_id=$1 and client_mutation_id=$2", [userId, mutationId])).rows[0];
    if (!row) return undefined; if (row.mutation_fingerprint !== fingerprint) throw new LocationMutationConflictError("mutation_conflict"); return overrideState(row);
  }
  private async mutateProfile(userId: string, command: PutLocationProfileCommand | DeleteLocationProfileCommand, fingerprint: string, location: WeatherLocationCandidate | null) {
    return this.transaction("profile", userId, command.expectedRevision, command.clientMutationId, fingerprint, async (client, revision, now) => {
      const row = (await client.query(`insert into user_location_profiles (user_id,location_id,display_name,timezone,centroid_latitude,centroid_longitude,revision,client_mutation_id,mutation_fingerprint,created_at,updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) returning *`, [userId, location?.locationId ?? null, location?.displayName ?? null, location?.timezone ?? null, location?.centroidLatitude ?? null, location?.centroidLongitude ?? null, revision, command.clientMutationId, fingerprint, now])).rows[0]!;
      return profile(row);
    });
  }
  private async mutateOverride(userId: string, command: PutLocationOverrideCommand | DeleteLocationOverrideCommand, fingerprint: string, location: WeatherLocationCandidate | null) {
    return this.transaction("override", userId, command.expectedRevision, command.clientMutationId, fingerprint, async (client, revision, now) => {
      const today = localDate(now, "Asia/Shanghai"); const tomorrow = addDate(today, 1);
      const row = (await client.query(`insert into location_date_overrides (user_id,location_id,display_name,timezone,centroid_latitude,centroid_longitude,effective_from,effective_through,source,confirmed_at,revision,client_mutation_id,mutation_fingerprint,created_at,updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14) returning *`, [userId, location?.locationId ?? null, location?.displayName ?? null, location?.timezone ?? null, location?.centroidLatitude ?? null, location?.centroidLongitude ?? null, location ? today : null, location ? tomorrow : null, location ? "device_location" : null, location ? now : null, revision, command.clientMutationId, fingerprint, now])).rows[0]!;
      return overrideState(row);
    });
  }
  private async transaction<T>(kind: "profile" | "override", userId: string, expectedRevision: number, mutationId: string, fingerprint: string, insert: (client: PoolClient, revision: number, now: Date) => Promise<T>): Promise<T> {
    const table = kind === "profile" ? "user_location_profiles" : "location_date_overrides";
    const client = await this.database().connect();
    try {
      await client.query("begin"); await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`location-${kind}:${userId}`]);
      const replay = (await client.query(`select * from ${table} where user_id=$1 and client_mutation_id=$2`, [userId, mutationId])).rows[0];
      if (replay) {
        if (replay.mutation_fingerprint !== fingerprint) throw new LocationMutationConflictError("mutation_conflict");
        await client.query("commit");
        return (kind === "profile" ? profile(replay) : overrideState(replay)) as T;
      }
      const current = (await client.query(`select * from ${table} where user_id=$1 and is_current=true`, [userId])).rows[0];
      const revision = Number(current?.revision ?? 0) + 1;
      if (Number(current?.revision ?? 0) !== expectedRevision) throw new LocationMutationConflictError("revision_conflict", { revision: Number(current?.revision ?? 0) });
      const now = this.clock();
      if (current) await client.query(`update ${table} set is_current=false,superseded_at=$2,updated_at=$2 where id=$1`, [current.id, now]);
      const output = await insert(client, revision, now); await client.query("commit"); return output;
    } catch (error) { await client.query("rollback").catch(() => {}); throw error; } finally { client.release(); }
  }
  private database() { return this.pool ?? getPostgresPool(); }
}

function location(row: QueryResultRow) { return { locationId: row.location_id, displayName: row.display_name, timezone: row.timezone, ...(row.centroid_latitude === null ? {} : { centroidLatitude: row.centroid_latitude }), ...(row.centroid_longitude === null ? {} : { centroidLongitude: row.centroid_longitude }) }; }
function profile(row: QueryResultRow) { return UserLocationProfileSchema.parse({ homeCity: row.location_id ? location(row) : null, revision: row.revision, updatedAt: row.created_at.toISOString() }); }
function override(row: QueryResultRow) { return LocationDateOverrideSchema.parse({ id: row.id, location: location(row), effectiveFrom: dateValue(row.effective_from), effectiveThrough: dateValue(row.effective_through), source: row.source, confirmedAt: row.confirmed_at.toISOString(), revision: row.revision }); }
function overrideState(row: QueryResultRow): LocationDateOverrideState { return { override: row.location_id ? override(row) : null, revision: row.revision, updatedAt: row.created_at.toISOString() }; }
function dateValue(value: string | Date) { return typeof value === "string" ? value : localDate(value, "Asia/Shanghai"); }
function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function round2(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function localDate(value: Date, timezone: string) { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value); const get = (type: string) => parts.find((part) => part.type === type)?.value; return `${get("year")}-${get("month")}-${get("day")}`; }
function addDate(value: string, days: number) { const date = new Date(`${value}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }

export function unavailableLocationService(): WeatherLocationServiceLike {
  const fail = async () => { throw new LocationUnavailableError(); };
  return { getProfile: fail, putProfile: fail, deleteProfile: fail, getOverride: fail, putOverride: fail, deleteOverride: fail, search: fail, resolveDevice: fail } as WeatherLocationServiceLike;
}

export function providerAsGeo(provider: QWeatherProviderLike): GeoProvider { return provider; }
