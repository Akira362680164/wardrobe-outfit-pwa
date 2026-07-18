import {
  EmptyUserLocationProfileSchema,
  LocationDateOverrideStateSchema,
  RecommendationReadResponseSchema,
  ResolveRecommendationsResponseSchema,
  UserLocationProfileSchema,
  WeatherLocationCandidatesResponseSchema,
  WeatherOverviewSchema,
  type LocationDateOverrideState,
  type RecommendationReadResponse,
  type ResolveRecommendationsResponse,
  type UserLocationProfile,
  type WeatherLocationCandidate,
  type WeatherLocationRef,
  type WeatherOverview,
} from "@wardrobe/cloud-contracts";

import { request } from "./http";
import type { MiniAbortSignal } from "../utils/request-cancellation";

export interface MiniHomeLocationSnapshot {
  profile: UserLocationProfile | { homeCity: null; revision: 0; updatedAt: null };
  override: LocationDateOverrideState;
}

export async function readMiniHomeLocation(signal?: MiniAbortSignal): Promise<MiniHomeLocationSnapshot> {
  const [profileValue, overrideValue] = await Promise.all([
    request<unknown>({ path: "/api/settings/location-profile", toast: false, signal }),
    request<unknown>({ path: "/api/settings/location-override", toast: false, signal }),
  ]);
  const profileResult = UserLocationProfileSchema.safeParse(profileValue);
  return {
    profile: profileResult.success ? profileResult.data : EmptyUserLocationProfileSchema.parse(profileValue),
    override: LocationDateOverrideStateSchema.parse(overrideValue),
  };
}

export async function readMiniHomeWeather(date: string, signal?: MiniAbortSignal): Promise<WeatherOverview> {
  const value = await request<unknown>({ path: `/api/weather/overview?date=${encodeURIComponent(date)}`, toast: false, signal });
  return WeatherOverviewSchema.parse(value);
}

export async function readMiniHomeRecommendations(startDate: string, endDate: string, signal?: MiniAbortSignal): Promise<RecommendationReadResponse> {
  const value = await request<unknown>({
    path: `/api/recommendations?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
    toast: false, signal,
  });
  return RecommendationReadResponseSchema.parse(value);
}

export async function resolveMiniHomeRecommendations(dates: readonly string[], signal?: MiniAbortSignal): Promise<ResolveRecommendationsResponse> {
  const value = await request<unknown>({ method: "POST", path: "/api/recommendations/resolve", data: { dates }, toast: false, signal });
  return ResolveRecommendationsResponseSchema.parse(value);
}

export async function searchMiniHomeCities(query: string): Promise<readonly WeatherLocationCandidate[]> {
  const value = await request<unknown>({ path: `/api/weather/locations/search?q=${encodeURIComponent(query.trim())}`, toast: false });
  return WeatherLocationCandidatesResponseSchema.parse(value).candidates;
}

export async function resolveMiniDeviceLocation(longitude: number, latitude: number): Promise<readonly WeatherLocationCandidate[]> {
  const value = await request<unknown>({
    method: "POST", path: "/api/weather/locations/resolve-device", data: { longitude, latitude }, toast: false,
  });
  return WeatherLocationCandidatesResponseSchema.parse(value).candidates;
}

export async function putMiniHomeCity(kind: "home" | "temporary", location: WeatherLocationRef, expectedRevision: number, clientMutationId: string): Promise<MiniHomeLocationSnapshot> {
  await request({
    method: "PUT",
    path: kind === "home" ? "/api/settings/location-profile" : "/api/settings/location-override",
    data: { locationId: location.locationId, expectedRevision, clientMutationId },
    toast: false,
  });
  return readMiniHomeLocation();
}

export async function clearMiniTemporaryCity(expectedRevision: number, clientMutationId: string): Promise<MiniHomeLocationSnapshot> {
  await request({
    method: "DELETE", path: "/api/settings/location-override", data: { expectedRevision, clientMutationId }, toast: false,
  });
  return readMiniHomeLocation();
}
