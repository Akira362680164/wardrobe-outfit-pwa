import type { WeatherLocationRef, WeatherOverview } from "@wardrobe/cloud-contracts";
import { wardoraBusinessDate } from "@wardrobe/cloud-contracts";
import { resolveQWeatherVisual, type QWeatherVisualDefinition } from "@wardrobe/domain-catalog";
import type { ImageAssetReference } from "@/lib/types";

export type HomeAsyncState<T> =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

export interface HomeGarment {
  id: string;
  name: string;
  category: string;
  status: string;
  hasImage: boolean;
  imageAsset?: ImageAssetReference;
}

export interface HomePlan {
  id: string;
  date: string;
  status: "planned" | "worn" | "skipped" | "changed";
  role: string;
  revision: number;
  garmentIds: readonly string[];
  garmentSnapshots?: readonly HomeGarmentSnapshot[];
  actualGarmentSnapshots?: readonly HomeGarmentSnapshot[];
  unavailableGarmentIds?: readonly string[];
  availability?: "available" | "blocked" | "historical";
}

export interface HomeGarmentSnapshot {
  garmentId: string;
  name: string;
  role: string;
  category: string;
  imageAssetId?: string;
}

export type HomeLocationSource = "travel" | "temporary_override" | "home_city";
export type HomeResolvedLocation =
  | { kind: "none"; revision: number }
  | { kind: HomeLocationSource; displayName: string; revision: number };

export interface HomeRecommendationCandidate {
  candidateId: string;
  objective?: string;
  garmentIds: readonly string[];
  reasonCodes?: readonly string[];
  riskCodes?: readonly string[];
  finalScore?: number;
}

export type HomeRecommendationResult =
  | { status: "protected_plan" | "actual_wear"; protectedPlanEntryId?: string }
  | {
      status: "generated" | "reused" | "served_stale";
      recommendation: {
        recommendationId: string;
        recommendationRevision: number;
        targetDate: string;
        contextMode: "forecast" | "locationless" | "weather_fallback";
        resolvedLocation?: WeatherLocationRef;
        locationSource?: HomeLocationSource;
        weatherUpdatedAt?: string;
        endpointFreshness?: WeatherOverview["endpointFreshness"];
        attribution?: WeatherOverview["attribution"];
        recommendations: readonly HomeRecommendationCandidate[];
      };
    }
  | { status: "not_ready"; reason?: string };

export interface HomeFeedInput {
  businessDate: string;
  selectedDate: string;
  workspace: { status: "loading" } | { status: "error"; message: string } | { status: "ready"; revision: number };
  garments: readonly HomeGarment[];
  location:
    | { kind: "none"; revision: number }
    | { kind: "home_city" | "temporary_city"; displayName: string; revision: number };
  weather: HomeAsyncState<WeatherOverview>;
  weatherByDate?: Readonly<Record<string, HomeAsyncState<WeatherOverview>>>;
  recommendation: HomeAsyncState<HomeRecommendationResult>;
  plans: readonly HomePlan[];
}

export type HomeNormalState =
  | "home-empty-locationless"
  | "home-empty-forecast"
  | "home-ready-locationless"
  | "home-ready-forecast";

export interface HomeFeedViewModel {
  normalState: HomeNormalState | null;
  workspace: HomeFeedInput["workspace"];
  wardrobeReady: boolean;
  location: HomeResolvedLocation;
  weather: HomeWeatherViewModel;
  todayWeather: HomeWeatherViewModel;
  tomorrowWeather: HomeWeatherViewModel;
  recommendation:
    | { status: "idle" | "loading" | "protected" | "not_ready" }
    | { status: "error"; message: string }
    | { status: "ready"; contextMode: "forecast" | "locationless" | "weather_fallback"; resolvedLocation?: WeatherLocationRef; locationSource?: HomeLocationSource; weatherUpdatedAt?: string; stale: boolean; attribution?: WeatherOverview["attribution"]; candidates: readonly HomeRecommendationCandidate[] };
  plan: (HomePlan & { kind: "protected_plan" | "actual_wear" }) | null;
}

export type HomeWeatherViewModel =
    | { status: "idle" | "loading" }
    | { status: "error"; message: string }
    | {
        status: "ready";
        availabilityReason: WeatherOverview["availabilityReason"];
        summary?: string;
        temperatureC?: number;
        feelsLikeC?: number;
        windLevel?: number;
        minTemperatureC?: number;
        maxTemperatureC?: number;
        visual?: QWeatherVisualDefinition;
        stale: boolean;
        weatherUpdatedAt?: string;
        attribution?: WeatherOverview["attribution"];
        resolvedLocation?: WeatherLocationRef;
        locationSource?: HomeLocationSource;
      };

const idleWeather = { status: "idle" } as const;

function hasReadyWardrobe(garments: readonly HomeGarment[]): boolean {
  const categories = new Set(
    garments.filter((item) => item.status === "active" && item.hasImage).map((item) => item.category),
  );
  return categories.has("shoes") && (
    categories.has("one_piece")
    || (categories.has("tops") && (categories.has("pants") || categories.has("skirts")))
  );
}

export function buildHomeWeatherView(
  state: HomeAsyncState<WeatherOverview>,
  date: string,
  businessDate: string,
): HomeWeatherViewModel {
  if (state.status !== "ready") return state;
  const overview = state.data;
  const stale = overview.endpointFreshness.some((endpoint) => endpoint.freshness === "stale");
  if (overview.contextMode !== "forecast") {
    return { status: "ready", availabilityReason: overview.availabilityReason, stale };
  }

  const evidence = overview.weatherEvidence;
  const today = date === businessDate;
  const code = today ? evidence.weatherCode : evidence.dayWeatherCode;
  return {
    status: "ready",
    availabilityReason: overview.availabilityReason,
    summary: evidence.summary,
    temperatureC: today ? evidence.currentTemperatureC : undefined,
    feelsLikeC: today ? evidence.currentFeelsLikeC : undefined,
    windLevel: today ? evidence.windLevel : undefined,
    minTemperatureC: evidence.temperatureMinC,
    maxTemperatureC: evidence.temperatureMaxC,
    visual: code ? resolveQWeatherVisual(code) : undefined,
    stale,
    weatherUpdatedAt: evidence.weatherUpdatedAt,
    attribution: overview.attribution,
    resolvedLocation: overview.resolvedLocation,
    locationSource: overview.locationSource,
  };
}

export function buildHomeFeedViewModel(input: HomeFeedInput): HomeFeedViewModel {
  const wardrobeReady = hasReadyWardrobe(input.garments);
  const recommendationData = input.recommendation.status === "ready"
    && (input.recommendation.data.status === "generated" || input.recommendation.data.status === "reused" || input.recommendation.data.status === "served_stale")
    ? input.recommendation.data.recommendation
    : null;
  const weatherLocation = input.weather.status === "ready" && input.weather.data.resolvedLocation && input.weather.data.locationSource
    ? { kind: input.weather.data.locationSource, displayName: input.weather.data.resolvedLocation.displayName, revision: input.location.revision }
    : null;
  const recommendationLocation = recommendationData?.resolvedLocation && recommendationData.locationSource
    ? { kind: recommendationData.locationSource, displayName: recommendationData.resolvedLocation.displayName, revision: input.location.revision }
    : null;
  const profileLocation: HomeResolvedLocation = input.location.kind === "none"
    ? input.location
    : input.location.kind === "temporary_city"
      ? { kind: "temporary_override", displayName: input.location.displayName, revision: input.location.revision }
      : { kind: "home_city", displayName: input.location.displayName, revision: input.location.revision };
  const resolvedLocation = weatherLocation ?? recommendationLocation ?? profileLocation;
  const hasCity = resolvedLocation.kind !== "none";
  const plan = input.plans.find((entry) => entry.date === input.selectedDate && entry.role === "primary");
  const protectedPlan = plan
    ? { ...plan, kind: plan.status === "worn" ? "actual_wear" as const : "protected_plan" as const }
    : null;
  const tomorrow = addBusinessDays(input.businessDate, 1);
  const todayWeather = input.weatherByDate?.[input.businessDate]
    ?? (input.selectedDate === input.businessDate ? input.weather : idleWeather);
  const tomorrowWeather = input.weatherByDate?.[tomorrow]
    ?? (input.selectedDate === tomorrow ? input.weather : idleWeather);

  let recommendation: HomeFeedViewModel["recommendation"];
  if (protectedPlan || (input.recommendation.status === "ready" && (
    input.recommendation.data.status === "protected_plan" || input.recommendation.data.status === "actual_wear"
  ))) {
    recommendation = { status: "protected" };
  } else if (input.recommendation.status !== "ready") {
    recommendation = input.recommendation;
  } else if (input.recommendation.data.status === "not_ready") {
    recommendation = { status: "not_ready" };
  } else if (input.recommendation.data.status === "generated"
    || input.recommendation.data.status === "reused"
    || input.recommendation.data.status === "served_stale") {
    recommendation = {
      status: "ready",
      contextMode: input.recommendation.data.recommendation.contextMode,
      resolvedLocation: input.recommendation.data.recommendation.resolvedLocation,
      locationSource: input.recommendation.data.recommendation.locationSource,
      weatherUpdatedAt: input.recommendation.data.recommendation.weatherUpdatedAt,
      stale: input.recommendation.data.recommendation.endpointFreshness?.some((entry) => entry.freshness === "stale") ?? input.recommendation.data.status === "served_stale",
      attribution: input.recommendation.data.recommendation.attribution,
      candidates: input.recommendation.data.recommendation.recommendations,
    };
  } else {
    recommendation = { status: "protected" };
  }

  return {
    normalState: input.workspace.status === "ready"
      ? `home-${wardrobeReady ? "ready" : "empty"}-${hasCity ? "forecast" : "locationless"}` as HomeNormalState
      : null,
    workspace: input.workspace,
    wardrobeReady,
    location: resolvedLocation,
    weather: buildHomeWeatherView(input.weather, input.selectedDate, input.businessDate),
    todayWeather: buildHomeWeatherView(todayWeather, input.businessDate, input.businessDate),
    tomorrowWeather: buildHomeWeatherView(tomorrowWeather, tomorrow, input.businessDate),
    recommendation,
    plan: protectedPlan,
  };
}

export interface HomeRequestTicket {
  readonly accountId: string;
  readonly date: string;
  readonly generation: number;
  readonly signal: AbortSignal;
}

export class HomeRequestGate {
  private controller: AbortController | null = null;
  private current: HomeRequestTicket | null = null;
  private generation = 0;

  begin(accountId: string, date: string): HomeRequestTicket {
    this.controller?.abort();
    this.controller = new AbortController();
    this.current = {
      accountId,
      date,
      generation: ++this.generation,
      signal: this.controller.signal,
    };
    return this.current;
  }

  isCurrent(ticket: HomeRequestTicket): boolean {
    return this.current === ticket && !ticket.signal.aborted;
  }

  cancel(): void {
    this.controller?.abort();
    this.controller = null;
    this.current = null;
  }
}

function addBusinessDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days, 12));
  return wardoraBusinessDate(value);
}

export function homeBusinessWindow(value: Date | string | number): { today: string; tomorrow: string } {
  const today = wardoraBusinessDate(value);
  return { today, tomorrow: addBusinessDays(today, 1) };
}
