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
  HomeCitySearchSession,
  HomeLocationMutationSession,
  commitHomeLocation,
  loadHomeWeatherDates,
  type HomeLocationAction,
  type HomeLocationCommand,
} from "@/lib/home/home-feed-operations";
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
  const [citySearchState, setCitySearchState] = useState<"idle" | "loading" | "error" | "rate_limited">("idle");
  const [citySearchMessage, setCitySearchMessage] = useState<string | null>(null);
  const [citySearchRetryAfter, setCitySearchRetryAfter] = useState<number | null>(null);
  const [cityMutation, setCityMutation] = useState<string | null>(null);
  const [cityMutationError, setCityMutationError] = useState<string | null>(null);
  const [cityMutationConflict, setCityMutationConflict] = useState(false);
  const accountRef = useRef(input.accountId);
  const locationGate = useRef(new HomeRequestGate());
  const weatherGate = useRef(new HomeRequestGate());
  const recommendationGate = useRef(new HomeRequestGate());
  const mutationSession = useRef(new HomeLocationMutationSession());
  const mutationAbort = useRef<AbortController | null>(null);
  const weatherCache = useRef(new Map<string, WeatherOverview>());
  const recommendationCache = useRef(new Map<string, HomeRecommendationResult>());

  const session = useMemo(() => ({ accessToken: input.accessToken, deviceId: input.deviceId }), [input.accessToken, input.deviceId]);
  const citySearch = useMemo(() => new HomeCitySearchSession({
    request: (query, signal) => searchHomeCities(query, session, signal),
    onState: (state) => {
      setCityQuery(state.query);
      setCityCandidates(state.candidates);
      setCitySearchState(state.status === "ready" ? "idle" : state.status);
      setCitySearchMessage("message" in state ? state.message : null);
      setCitySearchRetryAfter(state.status === "rate_limited" ? state.retryAfterSeconds ?? null : null);
    },
  }), [session]);

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
    const dates = selectedDate === window.today ? [window.today, window.tomorrow] : [selectedDate];
    const cached = weatherCache.current.get(selectedDate);
    if (cached) setWeather({ status: "ready", data: cached });
    else setWeather({ status: "loading" });
    const missingDates = dates.filter((date) => !weatherCache.current.has(date));
    if (missingDates.length === 0) return;
    try {
      const settled = await loadHomeWeatherDates(
        missingDates,
        (date) => readHomeWeather(date, session, ticket.signal),
        (date, result) => {
          if (!weatherGate.current.isCurrent(ticket)) return;
          if (result.status === "fulfilled") {
            weatherCache.current.set(result.value.targetDate, result.value);
            if (date === selectedDate) setWeather({ status: "ready", data: result.value });
          } else if (date === selectedDate) {
            setWeather({ status: "error", message: onlineErrorMessage(result.reason) });
          }
        },
      );
      if (!weatherGate.current.isCurrent(ticket)) return;
      settled.values.forEach((value) => weatherCache.current.set(value.targetDate, value));
      const next = weatherCache.current.get(selectedDate);
      if (next) {
        setWeather({ status: "ready", data: next });
        return;
      }
      setWeather({ status: "error", message: onlineErrorMessage(settled.errors.get(selectedDate) ?? new Error("天气响应缺少目标日期")) });
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
      citySearch.reset(input.accountId);
      mutationAbort.current?.abort();
      mutationAbort.current = null;
      mutationSession.current.reset();
      setCityOpen(false);
      setCityMutation(null);
      setCityMutationError(null);
      setCityMutationConflict(false);
      return;
    }
    void loadLocation();
    void loadWeather();
    void loadRecommendation();
    return () => {
      locationGate.current.cancel();
      weatherGate.current.cancel();
      recommendationGate.current.cancel();
      mutationAbort.current?.abort();
      mutationAbort.current = null;
      mutationSession.current.reset();
    };
  }, [citySearch, input.accountId, input.active, input.workspaceRevision, loadLocation, loadRecommendation, loadWeather]);

  useLayoutEffect(() => {
    if (accountRef.current === input.accountId) return;
    accountRef.current = input.accountId;
    locationGate.current.cancel();
    weatherGate.current.cancel();
    recommendationGate.current.cancel();
    citySearch.reset(input.accountId);
    mutationAbort.current?.abort();
    mutationAbort.current = null;
    mutationSession.current.reset();
    setLocationSnapshot(null);
    setLocationState(idle);
    setWeather(idle);
    setRecommendation(idle);
    setCityCandidates([]);
    setCityQuery("");
    setCitySearchMessage(null);
    setCitySearchRetryAfter(null);
    setCityMutation(null);
    setCityMutationError(null);
    setCityMutationConflict(false);
    setCityOpen(false);
    weatherCache.current.clear();
    recommendationCache.current.clear();
    if (input.active) queueMicrotask(refresh);
  }, [citySearch, input.accountId, input.active, refresh]);

  useEffect(() => {
    if (!input.active || typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.hidden) {
        weatherGate.current.cancel();
        recommendationGate.current.cancel();
        citySearch.reset(input.accountId);
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
  }, [citySearch, input.accountId, input.active, refresh, window.today]);

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

  const searchCities = useCallback((query: string) => {
    setCityQuery(query);
    if (session.accessToken) citySearch.update(input.accountId, query);
  }, [citySearch, input.accountId, session.accessToken]);

  const startCityComposition = useCallback(() => citySearch.startComposition(), [citySearch]);
  const endCityComposition = useCallback((query: string) => citySearch.endComposition(input.accountId, query), [citySearch, input.accountId]);

  const commitLocation = useCallback(async (kind: HomeLocationAction, locationId?: string) => {
    if (!session.accessToken || cityMutation) return;
    setCityMutation(kind);
    setCityMutationError(null);
    setCityMutationConflict(false);
    const expectedRevision = kind === "home" || kind === "clear_home" ? locationSnapshot?.profile.revision ?? 0 : locationSnapshot?.override.revision ?? 0;
    const command: HomeLocationCommand = { accountId: input.accountId, sessionId: input.deviceId, action: kind, locationId, expectedRevision };
    const controller = new AbortController();
    mutationAbort.current?.abort();
    mutationAbort.current = controller;
    try {
      const result = await commitHomeLocation({
        session: mutationSession.current,
        command,
        signal: controller.signal,
        mutate: (clientMutationId, signal) => kind === "home"
          ? setHomeCity(locationId!, expectedRevision, clientMutationId, session, signal)
          : kind === "temporary"
            ? setTemporaryCity(locationId!, expectedRevision, clientMutationId, session, signal)
            : kind === "clear_home"
              ? clearHomeCity(expectedRevision, clientMutationId, session, signal)
              : clearTemporaryCity(expectedRevision, clientMutationId, session, signal),
        readLatest: (signal) => readHomeLocation(session, signal),
      });
      if (result.status === "stale") return;
      if (result.status === "conflict_unresolved") {
        setCityMutationConflict(true);
        setCityMutationError(`地点设置发生冲突，读取最新设置失败：${onlineErrorMessage(result.error)}`);
        return;
      }
      setCityMutation(null);
      setLocationSnapshot(result.snapshot);
      setLocationState({ status: "ready", data: result.snapshot });
      if (result.status === "conflict") {
        setCityMutationConflict(true);
        setCityMutationError("地点已在其他设备更新，已加载最新设置，请确认后重试。");
        return;
      }
      setCityOpen(false);
      setCityQuery("");
      setCityCandidates([]);
      weatherCache.current.clear();
      recommendationCache.current.clear();
      void loadWeather();
      void loadRecommendation();
    } catch (error) {
      if (!controller.signal.aborted) setCityMutationError(onlineErrorMessage(error));
    } finally {
      if (!controller.signal.aborted) setCityMutation(null);
      if (mutationAbort.current === controller) mutationAbort.current = null;
    }
  }, [cityMutation, input.accountId, input.deviceId, loadRecommendation, loadWeather, locationSnapshot, session]);

  useEffect(() => () => {
    citySearch.dispose();
    mutationAbort.current?.abort();
    mutationSession.current.reset();
  }, [citySearch]);

  return {
    window, selectedDate, setSelectedDate, viewModel,
    locationState, locationSnapshot,
    retryLocation: loadLocation, retryWeather, retryRecommendation, refresh,
    cityOpen, setCityOpen, cityQuery, cityCandidates, citySearchState, citySearchMessage, citySearchRetryAfter,
    searchCities, startCityComposition, endCityComposition,
    cityMutation, cityMutationError, cityMutationConflict, commitLocation,
  };
}

export type HomeFeedController = ReturnType<typeof useHomeFeedController>;
