"use client";

import {
  EmptyUserLocationProfileSchema,
  LocationDateOverrideStateSchema,
  RecommendationReadResponseSchema,
  ResolveRecommendationsResponseSchema,
  UserLocationProfileSchema,
  WeatherLocationCandidatesResponseSchema,
  WeatherOverviewSchema,
  type LocationDateOverrideState,
  type ResolveRecommendationsResponse,
  type RecommendationReadResponse,
  type UserLocationProfile,
  type WeatherLocationRef,
  type WeatherOverview,
} from "@wardrobe/cloud-contracts";

import type { AuthSessionSnapshot } from "@/lib/auth-session-store";
import { onlineRequest } from "@/lib/online/online-request";

type Session = Pick<AuthSessionSnapshot, "accessToken" | "deviceId">;

export interface HomeLocationSnapshot {
  profile: UserLocationProfile | { homeCity: null; revision: 0; updatedAt: null };
  override: LocationDateOverrideState;
}

export async function readHomeLocation(session: Session, signal?: AbortSignal): Promise<HomeLocationSnapshot> {
  const [profileValue, overrideValue] = await Promise.all([
    onlineRequest<unknown>("/api/settings/location-profile", { session, signal }),
    onlineRequest<unknown>("/api/settings/location-override", { session, signal }),
  ]);
  const profile = UserLocationProfileSchema.safeParse(profileValue).success
    ? UserLocationProfileSchema.parse(profileValue)
    : EmptyUserLocationProfileSchema.parse(profileValue);
  return { profile, override: LocationDateOverrideStateSchema.parse(overrideValue) };
}

export async function readHomeWeather(date: string, session: Session, signal?: AbortSignal): Promise<WeatherOverview> {
  const value = await onlineRequest<unknown>(`/api/weather/overview?date=${encodeURIComponent(date)}`, { session, signal });
  return WeatherOverviewSchema.parse(value);
}

export async function resolveHomeRecommendations(dates: readonly string[], session: Session, signal?: AbortSignal): Promise<ResolveRecommendationsResponse> {
  const value = await onlineRequest<unknown>("/api/recommendations/resolve", {
    method: "POST",
    body: { dates },
    session,
    signal,
  });
  return ResolveRecommendationsResponseSchema.parse(value);
}

export async function readHomeRecommendations(startDate: string, endDate: string, session: Session, signal?: AbortSignal): Promise<RecommendationReadResponse> {
  const query = `startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
  const value = await onlineRequest<unknown>(`/api/recommendations?${query}`, { session, signal });
  return RecommendationReadResponseSchema.parse(value);
}

export async function searchHomeCities(query: string, session: Session, signal?: AbortSignal): Promise<readonly WeatherLocationRef[]> {
  const value = await onlineRequest<unknown>(`/api/weather/locations/search?q=${encodeURIComponent(query.trim())}`, { session, signal });
  return WeatherLocationCandidatesResponseSchema.parse(value).candidates;
}

export async function setHomeCity(locationId: string, expectedRevision: number, clientMutationId: string, session: Session): Promise<HomeLocationSnapshot> {
  await onlineRequest("/api/settings/location-profile", {
    method: "PUT", body: { locationId, expectedRevision, clientMutationId }, session,
  });
  return readHomeLocation(session);
}

export async function clearHomeCity(expectedRevision: number, clientMutationId: string, session: Session): Promise<HomeLocationSnapshot> {
  await onlineRequest("/api/settings/location-profile", {
    method: "DELETE", body: { expectedRevision, clientMutationId }, session,
  });
  return readHomeLocation(session);
}

export async function setTemporaryCity(locationId: string, expectedRevision: number, clientMutationId: string, session: Session): Promise<HomeLocationSnapshot> {
  await onlineRequest("/api/settings/location-override", {
    method: "PUT", body: { locationId, expectedRevision, clientMutationId }, session,
  });
  return readHomeLocation(session);
}

export async function clearTemporaryCity(expectedRevision: number, clientMutationId: string, session: Session): Promise<HomeLocationSnapshot> {
  await onlineRequest("/api/settings/location-override", {
    method: "DELETE", body: { expectedRevision, clientMutationId }, session,
  });
  return readHomeLocation(session);
}
