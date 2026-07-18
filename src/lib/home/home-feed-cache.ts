import type { HomeLocationSnapshot } from "@/lib/online/online-home-client";

export function homeLocationRevisionKey(snapshot: HomeLocationSnapshot): string {
  const home = snapshot.profile.homeCity;
  const override = snapshot.override.override;
  return [
    `profile:${snapshot.profile.revision}:${home?.locationId ?? "none"}`,
    `override:${snapshot.override.revision}:${override?.location.locationId ?? "none"}:${override?.effectiveFrom ?? ""}:${override?.effectiveThrough ?? ""}`,
  ].join("|");
}

export function homeEffectiveLocationKey(snapshot: HomeLocationSnapshot, date: string): string {
  const override = snapshot.override.override;
  if (override && override.effectiveFrom <= date && override.effectiveThrough >= date) {
    return `temporary:${override.location.locationId}:${snapshot.override.revision}`;
  }
  const home = snapshot.profile.homeCity;
  if (home) return `home:${home.locationId}:${snapshot.profile.revision}`;
  return `none:${snapshot.profile.revision}:${snapshot.override.revision}`;
}

export function homeWeatherCacheKey(accountId: string, snapshot: HomeLocationSnapshot, date: string): string {
  return JSON.stringify([accountId, homeEffectiveLocationKey(snapshot, date), date]);
}

export function homeRecommendationCacheKey(accountId: string, snapshot: HomeLocationSnapshot, workspaceRevision: number, date: string): string {
  return JSON.stringify([accountId, homeEffectiveLocationKey(snapshot, date), workspaceRevision, date]);
}

export class HomeFeedSessionCache<Weather, Recommendation> {
  private readonly weather = new Map<string, Weather>();
  private readonly recommendations = new Map<string, Recommendation>();

  getWeather(accountId: string, snapshot: HomeLocationSnapshot, date: string): Weather | undefined {
    return this.weather.get(homeWeatherCacheKey(accountId, snapshot, date));
  }

  setWeather(accountId: string, snapshot: HomeLocationSnapshot, date: string, value: Weather): void {
    this.weather.set(homeWeatherCacheKey(accountId, snapshot, date), value);
  }

  deleteWeather(accountId: string, snapshot: HomeLocationSnapshot, date: string): void {
    this.weather.delete(homeWeatherCacheKey(accountId, snapshot, date));
  }

  getRecommendation(accountId: string, snapshot: HomeLocationSnapshot, workspaceRevision: number, date: string): Recommendation | undefined {
    return this.recommendations.get(homeRecommendationCacheKey(accountId, snapshot, workspaceRevision, date));
  }

  setRecommendation(accountId: string, snapshot: HomeLocationSnapshot, workspaceRevision: number, date: string, value: Recommendation): void {
    this.recommendations.set(homeRecommendationCacheKey(accountId, snapshot, workspaceRevision, date), value);
  }

  deleteRecommendation(accountId: string, snapshot: HomeLocationSnapshot, workspaceRevision: number, date: string): void {
    this.recommendations.delete(homeRecommendationCacheKey(accountId, snapshot, workspaceRevision, date));
  }

  clear(): void {
    this.weather.clear();
    this.recommendations.clear();
  }
}
