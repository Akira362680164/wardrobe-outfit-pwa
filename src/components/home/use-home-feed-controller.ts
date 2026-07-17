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
import { HomeFeedSessionCache, homeLocationRevisionKey } from "@/lib/home/home-feed-cache";
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

const defaultHomeClients = {
  clearHomeCity, clearTemporaryCity, readHomeLocation, readHomeRecommendations, readHomeWeather,
  resolveHomeRecommendations, searchHomeCities, setHomeCity, setTemporaryCity,
};

type HomeFeedClients = typeof defaultHomeClients;

interface HomeFeedControllerInput {
  active: boolean;
  locationActive?: boolean;
  accountId: string;
  accessToken?: string;
  deviceId: string;
  workspaceRevision: number;
  garments: readonly HomeGarment[];
  plans: readonly HomePlan[];
  clients?: Partial<HomeFeedClients>;
}

export type HomeLocationCommitStatus = "committed" | "conflict" | "conflict_unresolved" | "failed" | "stale";

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

  const mountedRef = useRef(true);
  const accountRef = useRef(input.accountId);
  const identityRef = useRef("");
  const lifecycleActiveRef = useRef(false);
  const feedActiveRef = useRef(input.active);
  const locationActiveRef = useRef(input.locationActive ?? input.active);
  const selectedDateRef = useRef(selectedDate);
  const windowRef = useRef(window);
  const workspaceRevisionRef = useRef(input.workspaceRevision);
  const locationSnapshotRef = useRef<HomeLocationSnapshot | null>(null);
  const cityMutationRef = useRef<string | null>(null);
  const sessionRef = useRef({ accessToken: input.accessToken, deviceId: input.deviceId });
  const clientsRef = useRef<HomeFeedClients>({ ...defaultHomeClients, ...input.clients });
  const locationGate = useRef(new HomeRequestGate());
  const weatherGate = useRef(new HomeRequestGate());
  const recommendationGate = useRef(new HomeRequestGate());
  const mutationSession = useRef(new HomeLocationMutationSession());
  const mutationAbort = useRef<AbortController | null>(null);
  const cache = useRef(new HomeFeedSessionCache<WeatherOverview, HomeRecommendationResult>());
  const refreshFeedRef = useRef<() => void>(() => undefined);

  feedActiveRef.current = input.active;
  locationActiveRef.current = input.locationActive ?? input.active;
  selectedDateRef.current = selectedDate;
  windowRef.current = window;
  workspaceRevisionRef.current = input.workspaceRevision;
  sessionRef.current = { accessToken: input.accessToken, deviceId: input.deviceId };
  clientsRef.current = { ...defaultHomeClients, ...input.clients };

  const citySearchRef = useRef<HomeCitySearchSession | null>(null);
  if (!citySearchRef.current) {
    citySearchRef.current = new HomeCitySearchSession({
      request: (query, signal) => clientsRef.current.searchHomeCities(query, sessionRef.current, signal),
      onState: (state) => {
        if (!mountedRef.current) return;
        setCityQuery(state.query);
        setCityCandidates(state.candidates);
        setCitySearchState(state.status === "ready" ? "idle" : state.status);
        setCitySearchMessage("message" in state ? state.message : null);
        setCitySearchRetryAfter(state.status === "rate_limited" ? state.retryAfterSeconds ?? null : null);
      },
    });
  }
  const citySearch = citySearchRef.current;

  const applyServerLocationSnapshot = useCallback((next: HomeLocationSnapshot, refreshDependencies: boolean) => {
    const previous = locationSnapshotRef.current;
    const changed = previous === null || homeLocationRevisionKey(previous) !== homeLocationRevisionKey(next);
    locationSnapshotRef.current = next;
    if (!mountedRef.current) return changed;
    setLocationSnapshot(next);
    setLocationState({ status: "ready", data: next });
    if (changed) {
      cache.current.clear();
      weatherGate.current.cancel();
      recommendationGate.current.cancel();
      if (feedActiveRef.current) {
        setWeather({ status: "loading" });
        setRecommendation({ status: "loading" });
      }
      if (refreshDependencies && feedActiveRef.current) queueMicrotask(() => refreshFeedRef.current());
    }
    return changed;
  }, []);

  const loadLocation = useCallback(async (refreshDependencies = false): Promise<HomeLocationSnapshot | null> => {
    const accountId = accountRef.current;
    const session = sessionRef.current;
    if (!locationActiveRef.current || !session.accessToken) return null;
    const ticket = locationGate.current.begin(accountId, selectedDateRef.current);
    if (mountedRef.current) setLocationState({ status: "loading" });
    try {
      const next = await clientsRef.current.readHomeLocation(session, ticket.signal);
      if (!locationGate.current.isCurrent(ticket) || accountRef.current !== accountId) return null;
      applyServerLocationSnapshot(next, refreshDependencies);
      return next;
    } catch (error) {
      if (locationGate.current.isCurrent(ticket) && mountedRef.current) {
        setLocationState({ status: "error", message: onlineErrorMessage(error) });
      }
      return null;
    }
  }, [applyServerLocationSnapshot]);

  const loadWeatherFor = useCallback(async (snapshot: HomeLocationSnapshot, selected: string) => {
    const accountId = accountRef.current;
    const session = sessionRef.current;
    if (!feedActiveRef.current || !session.accessToken) return;
    const locationRevision = homeLocationRevisionKey(snapshot);
    const ticket = weatherGate.current.begin(accountId, `${selected}:${locationRevision}`);
    const cachedLocationRevision = locationRevision;
    const businessWindow = windowRef.current;
    const dates = selected === businessWindow.today ? [businessWindow.today, businessWindow.tomorrow] : [selected];
    const cached = cache.current.getWeather(accountId, snapshot, selected);
    if (cached && mountedRef.current) setWeather({ status: "ready", data: cached });
    else if (mountedRef.current) setWeather({ status: "loading" });
    const missingDates = dates.filter((date) => !cache.current.getWeather(accountId, snapshot, date));
    if (missingDates.length === 0) return;
    const isWeatherContextCurrent = () =>
      weatherGate.current.isCurrent(ticket)
      && accountRef.current === accountId
      && locationSnapshotRef.current !== null
      && homeLocationRevisionKey(locationSnapshotRef.current) === cachedLocationRevision;
    try {
      const settled = await loadHomeWeatherDates(
        missingDates,
        (date) => clientsRef.current.readHomeWeather(date, session, ticket.signal),
        (date, result) => {
          if (!isWeatherContextCurrent()) return;
          if (result.status === "fulfilled") cache.current.setWeather(accountId, snapshot, date, result.value);
          if (date !== selected || !mountedRef.current) return;
          if (date === selected) {
            setWeather(result.status === "fulfilled"
              ? { status: "ready", data: result.value }
              : { status: "error", message: onlineErrorMessage(result.reason) });
          }
        },
      );
      if (!isWeatherContextCurrent() || selectedDateRef.current !== selected || !mountedRef.current) return;
      const next = cache.current.getWeather(accountId, snapshot, selected);
      if (next) setWeather({ status: "ready", data: next });
      else setWeather({ status: "error", message: onlineErrorMessage(settled.errors.get(selected) ?? new Error("天气响应缺少目标日期")) });
    } catch (error) {
      if (isWeatherContextCurrent() && selectedDateRef.current === selected && mountedRef.current) {
        setWeather({ status: "error", message: onlineErrorMessage(error) });
      }
    }
  }, []);

  const loadRecommendationFor = useCallback(async (snapshot: HomeLocationSnapshot, selected: string, workspaceRevision: number) => {
    const accountId = accountRef.current;
    const session = sessionRef.current;
    if (!feedActiveRef.current || !session.accessToken) return;
    const locationRevision = homeLocationRevisionKey(snapshot);
    const cachedWorkspaceRevision = workspaceRevision;
    const ticket = recommendationGate.current.begin(accountId, `${selected}:${locationRevision}:${workspaceRevision}`);
    const isRecommendationContextCurrent = () =>
      recommendationGate.current.isCurrent(ticket)
      && accountRef.current === accountId
      && workspaceRevisionRef.current === cachedWorkspaceRevision
      && locationSnapshotRef.current !== null
      && homeLocationRevisionKey(locationSnapshotRef.current) === locationRevision;
    const cached = cache.current.getRecommendation(accountId, snapshot, workspaceRevision, selected);
    if (cached) {
      if (mountedRef.current) setRecommendation({ status: "ready", data: cached });
      return;
    }
    if (mountedRef.current) setRecommendation({ status: "loading" });
    const businessWindow = windowRef.current;
    const dates = selected === businessWindow.today ? [businessWindow.today, businessWindow.tomorrow] : [selected];
    try {
      try {
        const current = await clientsRef.current.readHomeRecommendations(dates[0]!, dates.at(-1)!, session, ticket.signal);
        if (!isRecommendationContextCurrent()) return;
        current.items.forEach((existing) => {
          if (!("recommendationRevision" in existing)) return;
          if (!isRecommendationContextCurrent()) return;
          cache.current.setRecommendation(accountId, snapshot, workspaceRevision, existing.targetDate, {
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
        });
        const currentResult = cache.current.getRecommendation(accountId, snapshot, workspaceRevision, selected);
        if (currentResult) {
          if (isRecommendationContextCurrent() && selectedDateRef.current === selected && mountedRef.current) {
            setRecommendation({ status: "ready", data: currentResult });
          }
          return;
        }
      } catch (readError) {
        if (!(readError instanceof OnlineRequestError) || readError.status !== 404) throw readError;
      }
      const response = await clientsRef.current.resolveHomeRecommendations(dates, session, ticket.signal);
      if (!isRecommendationContextCurrent()) return;
      response.results.forEach((result) => {
        if (!isRecommendationContextCurrent()) return;
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
        cache.current.setRecommendation(accountId, snapshot, workspaceRevision, result.targetDate, mapped);
      });
      if (!isRecommendationContextCurrent() || selectedDateRef.current !== selected || !mountedRef.current) return;
      const result = cache.current.getRecommendation(accountId, snapshot, workspaceRevision, selected);
      if (!result) throw new Error("推荐响应缺少目标日期");
      setRecommendation({ status: "ready", data: result });
    } catch (error) {
      if (isRecommendationContextCurrent() && selectedDateRef.current === selected && mountedRef.current) {
        setRecommendation({ status: "error", message: onlineErrorMessage(error) });
      }
    }
  }, []);

  const refreshFeed = useCallback(() => {
    const snapshot = locationSnapshotRef.current;
    if (!snapshot || !feedActiveRef.current) return;
    const latestDate = selectedDateRef.current;
    void loadWeatherFor(snapshot, latestDate);
    void loadRecommendationFor(snapshot, latestDate, workspaceRevisionRef.current);
  }, [loadRecommendationFor, loadWeatherFor]);
  refreshFeedRef.current = refreshFeed;

  const refresh = useCallback(() => {
    cache.current.clear();
    void loadLocation(false).then((snapshot) => {
      if (snapshot) refreshFeedRef.current();
    });
  }, [loadLocation]);

  const retryWeather = useCallback(() => {
    const snapshot = locationSnapshotRef.current;
    if (!snapshot) return;
    cache.current.deleteWeather(accountRef.current, snapshot, selectedDateRef.current);
    void loadWeatherFor(snapshot, selectedDateRef.current);
  }, [loadWeatherFor]);

  const retryRecommendation = useCallback(() => {
    const snapshot = locationSnapshotRef.current;
    if (!snapshot) return;
    cache.current.deleteRecommendation(accountRef.current, snapshot, workspaceRevisionRef.current, selectedDateRef.current);
    void loadRecommendationFor(snapshot, selectedDateRef.current, workspaceRevisionRef.current);
  }, [loadRecommendationFor]);

  const deactivateLocationLifecycle = useCallback((nextAccountId: string) => {
    locationGate.current.cancel();
    weatherGate.current.cancel();
    recommendationGate.current.cancel();
    citySearch.reset(nextAccountId);
    mutationAbort.current?.abort();
    mutationAbort.current = null;
    mutationSession.current.reset();
    cityMutationRef.current = null;
    locationSnapshotRef.current = null;
    cache.current.clear();
    if (!mountedRef.current) return;
    setLocationSnapshot(null);
    setLocationState(idle);
    setWeather(idle);
    setRecommendation(idle);
    setCityOpen(false);
    setCityMutation(null);
    setCityMutationError(null);
    setCityMutationConflict(false);
  }, [citySearch]);

  useLayoutEffect(() => {
    const locationActive = input.locationActive ?? input.active;
    const identity = `${input.accountId}\u0000${input.deviceId}`;
    const identityChanged = identityRef.current !== identity;
    const becameActive = locationActive && !lifecycleActiveRef.current;
    if (!locationActive) {
      if (lifecycleActiveRef.current || identityChanged) deactivateLocationLifecycle(input.accountId);
      lifecycleActiveRef.current = false;
      identityRef.current = identity;
      accountRef.current = input.accountId;
      return;
    }
    if (identityChanged || becameActive) {
      deactivateLocationLifecycle(input.accountId);
      lifecycleActiveRef.current = true;
      identityRef.current = identity;
      accountRef.current = input.accountId;
      void loadLocation(false).then((snapshot) => {
        if (snapshot && feedActiveRef.current) refreshFeedRef.current();
      });
    }
  }, [deactivateLocationLifecycle, input.accountId, input.active, input.deviceId, input.locationActive, loadLocation]);

  useLayoutEffect(() => {
    if (!input.active) {
      weatherGate.current.cancel();
      recommendationGate.current.cancel();
      return;
    }
    const snapshot = locationSnapshotRef.current;
    if (snapshot) refreshFeedRef.current();
    else void loadLocation(false).then((next) => { if (next) refreshFeedRef.current(); });
  }, [input.accessToken, input.active, input.workspaceRevision, loadLocation, selectedDate, window.today, window.tomorrow]);

  useEffect(() => {
    if (!(input.locationActive ?? input.active) || typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.hidden) {
        weatherGate.current.cancel();
        recommendationGate.current.cancel();
        citySearch.reset(input.accountId);
        return;
      }
      const next = homeBusinessWindow(new Date());
      if (next.today !== windowRef.current.today) {
        cache.current.clear();
        setWindow(next);
        setSelectedDate(next.today);
        return;
      }
      cache.current.clear();
      void loadLocation(false).then((snapshot) => {
        if (snapshot && feedActiveRef.current) refreshFeedRef.current();
      });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [citySearch, input.accountId, input.active, input.locationActive, loadLocation]);

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
    if (sessionRef.current.accessToken) citySearch.update(accountRef.current, query);
  }, [citySearch]);
  const startCityComposition = useCallback(() => citySearch.startComposition(), [citySearch]);
  const endCityComposition = useCallback((query: string) => citySearch.endComposition(accountRef.current, query), [citySearch]);

  const commitLocation = useCallback(async (kind: HomeLocationAction, locationId?: string): Promise<HomeLocationCommitStatus> => {
    const session = sessionRef.current;
    const snapshot = locationSnapshotRef.current;
    if (!session.accessToken || cityMutationRef.current || !snapshot) return "stale";
    cityMutationRef.current = kind;
    setCityMutation(kind);
    setCityMutationError(null);
    setCityMutationConflict(false);
    const expectedRevision = kind === "home" || kind === "clear_home" ? snapshot.profile.revision : snapshot.override.revision;
    const command: HomeLocationCommand = { accountId: accountRef.current, sessionId: session.deviceId, action: kind, locationId, expectedRevision };
    const controller = new AbortController();
    mutationAbort.current = controller;
    try {
      const result = await commitHomeLocation({
        session: mutationSession.current,
        command,
        signal: controller.signal,
        mutate: (clientMutationId, signal) => kind === "home"
          ? clientsRef.current.setHomeCity(locationId!, expectedRevision, clientMutationId, session, signal)
          : kind === "temporary"
            ? clientsRef.current.setTemporaryCity(locationId!, expectedRevision, clientMutationId, session, signal)
            : kind === "clear_home"
              ? clientsRef.current.clearHomeCity(expectedRevision, clientMutationId, session, signal)
              : clientsRef.current.clearTemporaryCity(expectedRevision, clientMutationId, session, signal),
        readLatest: (signal) => clientsRef.current.readHomeLocation(session, signal),
      });
      if (result.status === "stale") return "stale";
      if (result.status === "conflict_unresolved") {
        setCityMutationConflict(true);
        setCityMutationError(`地点设置发生冲突，读取最新设置失败：${onlineErrorMessage(result.error)}`);
        return "conflict_unresolved";
      }
      applyServerLocationSnapshot(result.snapshot, true);
      if (result.status === "conflict") {
        setCityMutationConflict(true);
        setCityMutationError("地点已在其他设备更新，已加载最新设置，请确认后重试。");
        return "conflict";
      }
      setCityOpen(false);
      setCityQuery("");
      setCityCandidates([]);
      return "committed";
    } catch (error) {
      if (!controller.signal.aborted && mountedRef.current) setCityMutationError(onlineErrorMessage(error));
      return controller.signal.aborted ? "stale" : "failed";
    } finally {
      if (!controller.signal.aborted && mountedRef.current) {
        cityMutationRef.current = null;
        setCityMutation(null);
      }
      if (mutationAbort.current === controller) mutationAbort.current = null;
    }
  }, [applyServerLocationSnapshot]);

  useEffect(() => {
    mountedRef.current = true;
    if (locationActiveRef.current && !locationSnapshotRef.current) {
      void loadLocation(false).then((snapshot) => {
        if (snapshot && feedActiveRef.current) refreshFeedRef.current();
      });
    }
    return () => {
      mountedRef.current = false;
      citySearch.dispose();
      locationGate.current.cancel();
      weatherGate.current.cancel();
      recommendationGate.current.cancel();
      mutationAbort.current?.abort();
      mutationSession.current.reset();
    };
  }, [citySearch, loadLocation]);

  return {
    window, selectedDate, setSelectedDate, viewModel,
    locationState, locationSnapshot,
    retryLocation: () => loadLocation(true),
    retryWeather, retryRecommendation, refresh,
    cityOpen, setCityOpen, cityQuery, cityCandidates, citySearchState, citySearchMessage, citySearchRetryAfter,
    searchCities, startCityComposition, endCityComposition,
    cityMutation, cityMutationError, cityMutationConflict, commitLocation,
  };
}

export type HomeFeedController = ReturnType<typeof useHomeFeedController>;
