"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { WeatherLocationRef, WeatherOverview } from "@wardrobe/cloud-contracts";

import {
  HomeRequestGate,
  buildHomeFeedViewModel,
  homeBusinessWindow,
  type HomeAsyncState,
  type HomeFeedInput,
  type HomeGarment,
  type HomePlan,
  type HomeRecommendationResult,
} from "@/lib/home/home-feed-model";
import {
  clearHomeCity,
  clearTemporaryCity,
  readHomeLocation,
  readHomeRecommendations,
  readHomeWeather,
  resolveHomeRecommendations,
  searchHomeCities,
  setHomeCity,
  setTemporaryCity,
  type HomeLocationSnapshot,
} from "@/lib/online/online-home-client";
import { OnlineRequestError, onlineErrorMessage } from "@/lib/online/online-error";

interface HomeFeedControllerInput {
  active: boolean;
  accountId: string;
  accessToken?: string;
  deviceId: string;
  workspaceRevision: number;
  garments: readonly HomeGarment[];
  plans: readonly HomePlan[];
}

const idle = { status: "idle" } as const;

export function useHomeFeedController(input: HomeFeedControllerInput) {
  const [window, setWindow] = useState(() => homeBusinessWindow(new Date()));
  const [selectedDate, setSelectedDate] = useState(window.today);
  const [locationSnapshot, setLocationSnapshot] = useState<HomeLocationSnapshot | null>(null);
  const [locationState, setLocationState] = useState<HomeAsyncState<HomeLocationSnapshot>>(idle);
  const [weather, setWeather] = useState<HomeAsyncState<WeatherOverview>>(idle);
  const [recommendation, setRecommendation] = useState<HomeAsyncState<HomeRecommendationResult>>(idle);
  const [cityOpen, setCityOpen] = useState(false);
  const [cityQuery, setCityQuery] = useState("");
  const [cityCandidates, setCityCandidates] = useState<readonly WeatherLocationRef[]>([]);
  const [citySearchState, setCitySearchState] = useState<"idle" | "loading" | "error">("idle");
  const [cityMutation, setCityMutation] = useState<string | null>(null);
  const [cityMutationError, setCityMutationError] = useState<string | null>(null);
  const accountRef = useRef(input.accountId);
  const locationGate = useRef(new HomeRequestGate());
  const weatherGate = useRef(new HomeRequestGate());
  const recommendationGate = useRef(new HomeRequestGate());
  const searchGate = useRef(new HomeRequestGate());
  const weatherCache = useRef(new Map<string, WeatherOverview>());
  const recommendationCache = useRef(new Map<string, HomeRecommendationResult>());

  const session = useMemo(() => ({ accessToken: input.accessToken, deviceId: input.deviceId }), [input.accessToken, input.deviceId]);

  const loadLocation = useCallback(async () => {
    if (!input.active || !session.accessToken) return;
    const ticket = locationGate.current.begin(input.accountId, selectedDate);
    setLocationState({ status: "loading" });
    try {
      const next = await readHomeLocation(session, ticket.signal);
      if (!locationGate.current.isCurrent(ticket)) return;
      setLocationSnapshot(next);
      setLocationState({ status: "ready", data: next });
    } catch (error) {
      if (!locationGate.current.isCurrent(ticket)) return;
      setLocationState({ status: "error", message: onlineErrorMessage(error) });
    }
  }, [input.accountId, input.active, selectedDate, session]);

  const loadWeather = useCallback(async () => {
    if (!input.active || !session.accessToken) return;
    const ticket = weatherGate.current.begin(input.accountId, selectedDate);
    const cached = weatherCache.current.get(selectedDate);
    if (cached) {
      setWeather({ status: "ready", data: cached });
      return;
    }
    setWeather({ status: "loading" });
    try {
      const dates = selectedDate === window.today ? [window.today, window.tomorrow] : [selectedDate];
      const values = await Promise.all(dates.map((date) => readHomeWeather(date, session, ticket.signal)));
      if (!weatherGate.current.isCurrent(ticket)) return;
      values.forEach((value) => weatherCache.current.set(value.targetDate, value));
      const next = weatherCache.current.get(selectedDate);
      if (next) setWeather({ status: "ready", data: next });
    } catch (error) {
      if (weatherGate.current.isCurrent(ticket)) setWeather({ status: "error", message: onlineErrorMessage(error) });
    }
  }, [input.accountId, input.active, selectedDate, session, window.today, window.tomorrow]);

  const loadRecommendation = useCallback(async () => {
    if (!input.active || !session.accessToken) return;
    const ticket = recommendationGate.current.begin(input.accountId, selectedDate);
    const cached = recommendationCache.current.get(selectedDate);
    if (cached) {
      setRecommendation({ status: "ready", data: cached });
      return;
    }
    setRecommendation({ status: "loading" });
    try {
      const dates = selectedDate === window.today ? [window.today, window.tomorrow] : [selectedDate];
      try {
        const current = await readHomeRecommendations(dates[0]!, dates.at(-1)!, session, ticket.signal);
        current.items.forEach((existing) => {
          if ("recommendationRevision" in existing) {
            recommendationCache.current.set(existing.targetDate, {
              status: "reused",
              recommendation: {
                recommendationId: existing.recommendationId,
                recommendationRevision: existing.recommendationRevision,
                targetDate: existing.targetDate,
                contextMode: existing.contextMode,
                recommendations: existing.recommendations.map((candidate) => ({
                  candidateId: candidate.candidateId,
                  objective: candidate.objective,
                  garmentIds: candidate.garmentIds,
                  reasonCodes: candidate.reasonCodes,
                  riskCodes: candidate.riskCodes,
                  finalScore: candidate.finalScore,
                })),
              },
            });
          }
        });
        const currentResult = recommendationCache.current.get(selectedDate);
        if (currentResult) {
          if (!recommendationGate.current.isCurrent(ticket)) return;
          setRecommendation({ status: "ready", data: currentResult });
          return;
        }
      } catch (readError) {
        if (!(readError instanceof OnlineRequestError) || readError.status !== 404) throw readError;
      }
      const response = await resolveHomeRecommendations(dates, session, ticket.signal);
      if (!recommendationGate.current.isCurrent(ticket)) return;
      response.results.forEach((result) => {
        const mapped: HomeRecommendationResult = result.status === "protected_plan" || result.status === "actual_wear"
          ? { status: result.status, protectedPlanEntryId: result.protectedPlanEntryId }
          : result.status === "not_ready" || !result.recommendation
            ? { status: "not_ready" }
            : {
            status: result.status,
            recommendation: {
              recommendationId: result.recommendation.recommendationId,
              recommendationRevision: result.recommendation.recommendationRevision,
              targetDate: result.recommendation.targetDate,
              contextMode: result.recommendation.contextMode,
              recommendations: result.recommendation.recommendations.map((candidate) => ({
                candidateId: candidate.candidateId,
                objective: candidate.objective,
                garmentIds: candidate.garmentIds,
                reasonCodes: candidate.reasonCodes,
                riskCodes: candidate.riskCodes,
                finalScore: candidate.finalScore,
              })),
            },
          };
        recommendationCache.current.set(result.targetDate, mapped);
      });
      const result = recommendationCache.current.get(selectedDate);
      if (!result) throw new Error("推荐响应缺少目标日期");
      setRecommendation({ status: "ready", data: result });
    } catch (error) {
      if (recommendationGate.current.isCurrent(ticket)) setRecommendation({ status: "error", message: onlineErrorMessage(error) });
    }
  }, [input.accountId, input.active, selectedDate, session, window.today, window.tomorrow]);

  const refresh = useCallback(() => {
    weatherCache.current.clear();
    recommendationCache.current.clear();
    void loadLocation();
    void loadWeather();
    void loadRecommendation();
  }, [loadLocation, loadRecommendation, loadWeather]);

  const retryWeather = useCallback(() => {
    weatherCache.current.delete(selectedDate);
    void loadWeather();
  }, [loadWeather, selectedDate]);

  const retryRecommendation = useCallback(() => {
    recommendationCache.current.delete(selectedDate);
    void loadRecommendation();
  }, [loadRecommendation, selectedDate]);

  useLayoutEffect(() => {
    if (!input.active) {
      locationGate.current.cancel();
      weatherGate.current.cancel();
      recommendationGate.current.cancel();
      return;
    }
    void loadLocation();
    void loadWeather();
    void loadRecommendation();
    return () => {
      locationGate.current.cancel();
      weatherGate.current.cancel();
      recommendationGate.current.cancel();
    };
  }, [input.active, input.workspaceRevision, loadLocation, loadRecommendation, loadWeather]);

  useLayoutEffect(() => {
    if (accountRef.current === input.accountId) return;
    accountRef.current = input.accountId;
    locationGate.current.cancel();
    weatherGate.current.cancel();
    recommendationGate.current.cancel();
    searchGate.current.cancel();
    setLocationSnapshot(null);
    setLocationState(idle);
    setWeather(idle);
    setRecommendation(idle);
    setCityCandidates([]);
    setCityOpen(false);
    weatherCache.current.clear();
    recommendationCache.current.clear();
    if (input.active) queueMicrotask(refresh);
  }, [input.accountId, input.active, refresh]);

  useEffect(() => {
    if (!input.active || typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.hidden) {
        weatherGate.current.cancel();
        recommendationGate.current.cancel();
        searchGate.current.cancel();
        return;
      }
      const next = homeBusinessWindow(new Date());
      if (next.today !== window.today) {
        weatherCache.current.clear();
        recommendationCache.current.clear();
        setWindow(next);
        setSelectedDate(next.today);
      } else {
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [input.active, refresh, window.today]);

  const activeLocation = useMemo<HomeFeedInput["location"]>(() => {
    const override = locationSnapshot?.override.override;
    if (override && override.effectiveFrom <= selectedDate && override.effectiveThrough >= selectedDate) {
      return { kind: "temporary_city", displayName: override.location.displayName, revision: locationSnapshot!.override.revision };
    }
    const profile = locationSnapshot?.profile;
    if (profile?.homeCity) return { kind: "home_city", displayName: profile.homeCity.displayName, revision: profile.revision };
    return { kind: "none", revision: profile?.revision ?? 0 };
  }, [locationSnapshot, selectedDate]);

  const viewModel = useMemo(() => buildHomeFeedViewModel({
    businessDate: window.today,
    selectedDate,
    workspace: { status: "ready", revision: input.workspaceRevision },
    garments: input.garments,
    location: activeLocation,
    weather,
    recommendation,
    plans: input.plans,
  }), [activeLocation, input.garments, input.plans, input.workspaceRevision, recommendation, selectedDate, weather, window.today]);

  const searchCities = useCallback(async (query: string) => {
    setCityQuery(query);
    const trimmed = query.trim();
    if (!trimmed || !session.accessToken) {
      searchGate.current.cancel();
      setCityCandidates([]);
      setCitySearchState("idle");
      return;
    }
    const ticket = searchGate.current.begin(input.accountId, trimmed);
    setCitySearchState("loading");
    try {
      const candidates = await searchHomeCities(trimmed, session, ticket.signal);
      if (!searchGate.current.isCurrent(ticket)) return;
      setCityCandidates(candidates);
      setCitySearchState("idle");
    } catch {
      if (searchGate.current.isCurrent(ticket)) setCitySearchState("error");
    }
  }, [input.accountId, session]);

  const commitLocation = useCallback(async (kind: "home" | "temporary" | "clear_home" | "clear_temporary", locationId?: string) => {
    if (!session.accessToken || cityMutation) return;
    setCityMutation(kind);
    setCityMutationError(null);
    const mutationId = globalThis.crypto?.randomUUID?.() ?? `00000000-0000-4000-8000-${String(Date.now()).padStart(12, "0").slice(-12)}`;
    try {
      const next = kind === "home"
        ? await setHomeCity(locationId!, locationSnapshot?.profile.revision ?? 0, mutationId, session)
        : kind === "temporary"
          ? await setTemporaryCity(locationId!, locationSnapshot?.override.revision ?? 0, mutationId, session)
          : kind === "clear_home"
            ? await clearHomeCity(locationSnapshot?.profile.revision ?? 0, mutationId, session)
            : await clearTemporaryCity(locationSnapshot?.override.revision ?? 0, mutationId, session);
      setLocationSnapshot(next);
      setLocationState({ status: "ready", data: next });
      setCityOpen(false);
      setCityQuery("");
      setCityCandidates([]);
      weatherCache.current.clear();
      recommendationCache.current.clear();
      void loadWeather();
      void loadRecommendation();
    } catch (error) {
      setCityMutationError(onlineErrorMessage(error));
    } finally {
      setCityMutation(null);
    }
  }, [cityMutation, loadRecommendation, loadWeather, locationSnapshot, session]);

  return {
    window, selectedDate, setSelectedDate, viewModel,
    locationState, locationSnapshot,
    retryLocation: loadLocation, retryWeather, retryRecommendation, refresh,
    cityOpen, setCityOpen, cityQuery, cityCandidates, citySearchState, searchCities, cityMutation, cityMutationError, commitLocation,
  };
}

export type HomeFeedController = ReturnType<typeof useHomeFeedController>;
