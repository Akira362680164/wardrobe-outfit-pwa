import type { WeatherOverview } from "@wardrobe/cloud-contracts";
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
  status: string;
  role: string;
  revision: number;
  garmentIds: readonly string[];
}

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
  location: HomeFeedInput["location"];
  weather: HomeWeatherViewModel;
  todayWeather: HomeWeatherViewModel;
  tomorrowWeather: HomeWeatherViewModel;
  recommendation:
    | { status: "idle" | "loading" | "protected" | "not_ready" }
    | { status: "error"; message: string }
    | { status: "ready"; contextMode: "forecast" | "locationless" | "weather_fallback"; candidates: readonly HomeRecommendationCandidate[] };
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
  };
}

export function buildHomeFeedViewModel(input: HomeFeedInput): HomeFeedViewModel {
  const wardrobeReady = hasReadyWardrobe(input.garments);
  const hasCity = input.location.kind !== "none";
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
    location: input.location,
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
