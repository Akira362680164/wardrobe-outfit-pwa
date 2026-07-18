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
  type HomeRecommendationCandidate,
  type HomeRecommendationResult,
} from "@/lib/home/home-feed-model";
import { createUuid } from "@/lib/uuid";
import { readCoarseDeviceCoordinates, sanitizeResolvedLocationCandidates } from "@/lib/home/device-location";
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
  acceptHomeRecommendation,
  cancelHomePlanWorn,
  cancelHomePrimaryPlan,
  clearTemporaryCity,
  readHomeLocation,
  readHomeRecommendations,
  readHomeWeather,
  markHomePlanWorn,
  rejectHomeRecommendation,
  resolveDeviceLocation,
  resolveHomeRecommendations,
  searchHomeCities,
  setHomeCity,
  setTemporaryCity,
  type HomeLocationSnapshot,
} from "@/lib/online/online-home-client";
import { OnlineRequestError } from "@/lib/online/online-error";

function homeErrorMessage(error: unknown): string {
  if (!(error instanceof OnlineRequestError)) return "暂时无法完成，请稍后重试。";
  switch (error.code) {
    case "network": return "网络连接失败，请检查网络后重试。";
    case "timeout": return "请求超时，请稍后重试。";
    case "auth": return "登录状态已失效，请重新登录。";
    case "conflict": return "内容已更新，请刷新后重试。";
    case "not_found": return "内容不存在或已被删除。";
    case "invalid_request": return "提交内容有误，请检查后重试。";
    case "mutation_in_progress": return "正在保存，请稍后再试。";
    case "rate_limited": return "操作过于频繁，请稍后重试。";
    case "weather_unavailable": return "天气暂时不可用，请稍后重试。";
    case "image_upload": return "图片处理失败，请重新选择后重试。";
    case "server": return "暂时无法完成，请稍后重试。";
  }
}

const defaultHomeClients = {
  acceptHomeRecommendation, cancelHomePlanWorn, cancelHomePrimaryPlan, clearHomeCity, clearTemporaryCity,
  markHomePlanWorn, readHomeLocation, readHomeRecommendations, readHomeWeather, rejectHomeRecommendation,
  resolveDeviceLocation, resolveHomeRecommendations, searchHomeCities, setHomeCity, setTemporaryCity,
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
  onWorkspaceRefresh?: () => Promise<unknown>;
  onSaveOutfit?: (input: { name: string; garmentIds: readonly string[]; clientMutationId: string }) => Promise<unknown>;
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
  const [weatherByDate, setWeatherByDate] = useState<Record<string, HomeAsyncState<WeatherOverview>>>({});
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
  const [deviceLocation, setDeviceLocation] = useState<{ status: "idle" | "requesting" | "ready" | "denied" | "error"; candidates: readonly WeatherLocationRef[]; message?: string }>({ status: "idle", candidates: [] });
  const [homeMutation, setHomeMutation] = useState<{ kind: string; key: string; status: "pending" | "error" | "success"; message?: string } | null>(null);

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
  const businessMutationIds = useRef(new Map<string, string>());

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
      setWeatherByDate({});
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
        setLocationState({ status: "error", message: homeErrorMessage(error) });
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
    if (cached && mountedRef.current) {
      const ready = { status: "ready", data: cached } as const;
      if (selectedDateRef.current === selected) setWeather(ready);
      setWeatherByDate((current) => ({ ...current, [selected]: ready }));
    } else if (mountedRef.current) {
      if (selectedDateRef.current === selected) setWeather({ status: "loading" });
      setWeatherByDate((current) => ({ ...current, [selected]: { status: "loading" } }));
    }
    if (mountedRef.current) {
      for (const date of dates) {
        const dayCached = cache.current.getWeather(accountId, snapshot, date);
        setWeatherByDate((current) => ({ ...current, [date]: dayCached ? { status: "ready", data: dayCached } : { status: "loading" } }));
      }
    }
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
          if (mountedRef.current) {
            setWeatherByDate((current) => ({ ...current, [date]: result.status === "fulfilled"
              ? { status: "ready", data: result.value }
              : { status: "error", message: homeErrorMessage(result.reason) } }));
          }
          if (date !== selected || !mountedRef.current) return;
          if (date === selected) {
            setWeather(result.status === "fulfilled"
              ? { status: "ready", data: result.value }
              : { status: "error", message: homeErrorMessage(result.reason) });
          }
        },
      );
      if (!isWeatherContextCurrent() || selectedDateRef.current !== selected || !mountedRef.current) return;
      const next = cache.current.getWeather(accountId, snapshot, selected);
      if (next) setWeather({ status: "ready", data: next });
      else {
        const message = homeErrorMessage(settled.errors.get(selected) ?? new Error("天气响应缺少目标日期"));
        setWeather({ status: "error", message });
        setWeatherByDate((current) => ({ ...current, [selected]: { status: "error", message } }));
      }
    } catch (error) {
      if (isWeatherContextCurrent() && selectedDateRef.current === selected && mountedRef.current) {
        const message = homeErrorMessage(error);
        setWeather({ status: "error", message });
        setWeatherByDate((current) => ({ ...current, [selected]: { status: "error", message } }));
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
              resolvedLocation: existing.resolvedLocation,
              locationSource: existing.locationSource,
              weatherUpdatedAt: existing.weatherEvidence?.weatherUpdatedAt,
              endpointFreshness: existing.endpointFreshness ?? [],
              attribution: existing.attribution,
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
                  resolvedLocation: result.recommendation.resolvedLocation,
                  locationSource: result.recommendation.locationSource,
                  weatherUpdatedAt: result.recommendation.weatherEvidence?.weatherUpdatedAt,
                  endpointFreshness: result.recommendation.endpointFreshness ?? [],
                  attribution: result.recommendation.attribution,
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
        setRecommendation({ status: "error", message: homeErrorMessage(error) });
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

  const mutationIdFor = useCallback((key: string) => {
    const current = businessMutationIds.current.get(key);
    if (current) return current;
    const next = createUuid();
    businessMutationIds.current.set(key, next);
    return next;
  }, []);

  const finishBusinessMutation = useCallback(async (kind: string, key: string, task: (clientMutationId: string) => Promise<unknown>) => {
    const clientMutationId = mutationIdFor(key);
    setHomeMutation({ kind, key, status: "pending" });
    try {
      await task(clientMutationId);
      await input.onWorkspaceRefresh?.();
      businessMutationIds.current.delete(key);
      cache.current.clear();
      setHomeMutation({ kind, key, status: "success" });
      queueMicrotask(() => refreshFeedRef.current());
      return true;
    } catch (error) {
      setHomeMutation({ kind, key, status: "error", message: homeErrorMessage(error) });
      return false;
    }
  }, [input, mutationIdFor]);

  const acceptCandidate = useCallback((candidate: HomeRecommendationCandidate, selectedGarmentIds: readonly string[], replacePlan?: HomePlan) => {
    const state = recommendation.status === "ready" ? recommendation.data : null;
    if (!state || !(state.status === "generated" || state.status === "reused" || state.status === "served_stale")) return Promise.resolve(false);
    const rec = state.recommendation;
    const key = `accept:${selectedDateRef.current}:${rec.recommendationId}:${rec.recommendationRevision}:${candidate.candidateId}:${[...selectedGarmentIds].sort().join(",")}:${replacePlan?.id ?? "none"}:${replacePlan?.revision ?? 0}`;
    return finishBusinessMutation("accept", key, (clientMutationId) => clientsRef.current.acceptHomeRecommendation(selectedDateRef.current, {
      clientMutationId, recommendationId: rec.recommendationId, expectedRecommendationRevision: rec.recommendationRevision,
      candidateId: candidate.candidateId, selectedGarmentIds: [...selectedGarmentIds],
      ...(replacePlan ? { replaceExistingPrimary: { planEntryId: replacePlan.id, expectedRevision: replacePlan.revision } } : {}),
    }, sessionRef.current));
  }, [finishBusinessMutation, recommendation]);

  const rejectCandidate = useCallback((candidate: HomeRecommendationCandidate) => {
    const state = recommendation.status === "ready" ? recommendation.data : null;
    if (!state || !(state.status === "generated" || state.status === "reused" || state.status === "served_stale")) return Promise.resolve(false);
    const rec = state.recommendation;
    const key = `reject:${rec.recommendationId}:${rec.recommendationRevision}:${candidate.candidateId}:not_for_me`;
    return finishBusinessMutation("reject", key, (clientMutationId) => clientsRef.current.rejectHomeRecommendation({ clientMutationId, recommendationId: rec.recommendationId, expectedRecommendationRevision: rec.recommendationRevision, candidateId: candidate.candidateId, reason: "not_for_me" }, sessionRef.current));
  }, [finishBusinessMutation, recommendation]);

  const cancelPrimary = useCallback((primary: HomePlan, backup?: HomePlan) => {
    const key = `cancel:${primary.id}:${primary.revision}:${backup?.id ?? "none"}:${backup?.revision ?? 0}`;
    return finishBusinessMutation("cancel", key, (clientMutationId) => clientsRef.current.cancelHomePrimaryPlan({ clientMutationId, targetDate: primary.date, primary: { planEntryId: primary.id, expectedRevision: primary.revision }, ...(backup ? { promoteBackup: { planEntryId: backup.id, expectedRevision: backup.revision } } : {}) }, sessionRef.current));
  }, [finishBusinessMutation]);

  const markPlanWorn = useCallback((plan: HomePlan) => {
    const key = `wear:${plan.id}:${plan.revision}`;
    return finishBusinessMutation("wear", key, (clientMutationId) => clientsRef.current.markHomePlanWorn(plan.id, plan.revision, clientMutationId, `${plan.date}T12:00:00.000Z`, sessionRef.current));
  }, [finishBusinessMutation]);

  const undoPlanWorn = useCallback((plan: HomePlan) => {
    const key = `unwear:${plan.id}:${plan.revision}`;
    return finishBusinessMutation("unwear", key, (clientMutationId) => clientsRef.current.cancelHomePlanWorn(plan.id, plan.revision, clientMutationId, sessionRef.current));
  }, [finishBusinessMutation]);

  const saveCandidateOutfit = useCallback((candidate: HomeRecommendationCandidate, garmentIds: readonly string[]) => {
    const key = `save-outfit:${candidate.candidateId}:${[...garmentIds].sort().join(",")}`;
    return finishBusinessMutation("save_outfit", key, async (clientMutationId) => {
      if (!input.onSaveOutfit) throw new Error("当前版本未连接套装保存能力");
      await input.onSaveOutfit({ name: `${selectedDateRef.current} ${candidate.objective === "fresh" ? "变化" : candidate.objective === "comfort" ? "舒适" : "稳妥"}搭配`, garmentIds, clientMutationId });
    });
  }, [finishBusinessMutation, input]);

  const retryWeather = useCallback((date: string) => {
    const snapshot = locationSnapshotRef.current;
    if (!snapshot) return;
    cache.current.deleteWeather(accountRef.current, snapshot, date);
    void loadWeatherFor(snapshot, date);
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
    setWeatherByDate({});
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
    weatherByDate,
    recommendation,
    plans: input.plans,
  }), [activeLocation, input.garments, input.plans, input.workspaceRevision, recommendation, selectedDate, weather, weatherByDate, window.today]);

  const searchCities = useCallback((query: string) => {
    setCityQuery(query);
    if (sessionRef.current.accessToken) citySearch.update(accountRef.current, query);
  }, [citySearch]);
  const startCityComposition = useCallback(() => citySearch.startComposition(), [citySearch]);
  const endCityComposition = useCallback((query: string) => citySearch.endComposition(accountRef.current, query), [citySearch]);

  const requestDeviceLocation = useCallback(async () => {
    const session = sessionRef.current;
    if (!session.accessToken) { setDeviceLocation({ status: "error", candidates: [], message: "请先登录后使用当前位置。" }); return; }
    setDeviceLocation({ status: "requesting", candidates: [] });
    let coordinates: { longitude: number; latitude: number } | undefined;
    try {
      const result = await readCoarseDeviceCoordinates();
      coordinates = result.coordinates;
      if (result.permission !== "granted" || !coordinates) {
        setDeviceLocation({ status: "denied", candidates: [], message: "未获得大致位置权限。你仍可搜索城市，或在系统设置开启后重试。" });
        return;
      }
      const resolved = await clientsRef.current.resolveDeviceLocation(coordinates.longitude, coordinates.latitude, session);
      const candidates = sanitizeResolvedLocationCandidates(resolved);
      setDeviceLocation(candidates.length ? { status: "ready", candidates } : { status: "error", candidates: [], message: "没有解析到可确认的城市，请手动搜索。" });
    } catch (error) {
      const message = homeErrorMessage(error);
      const denied = /permission|denied|restricted|权限|拒绝/i.test(message);
      setDeviceLocation({ status: denied ? "denied" : "error", candidates: [], message: denied ? "大致位置权限被拒绝或受限。请在系统设置中调整后返回重试。" : "暂时无法获取位置，请稍后重试或搜索城市。" });
    } finally {
      coordinates = undefined;
    }
  }, []);

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
        setCityMutationError(`地点设置发生冲突，读取最新设置失败：${homeErrorMessage(result.error)}`);
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
      setDeviceLocation({ status: "idle", candidates: [] });
      return "committed";
    } catch (error) {
      if (!controller.signal.aborted && mountedRef.current) setCityMutationError(homeErrorMessage(error));
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
    deviceLocation, requestDeviceLocation,
    homeMutation, acceptCandidate, rejectCandidate, cancelPrimary, markPlanWorn, undoPlanWorn, saveCandidateOutfit,
  };
}

export type HomeFeedController = ReturnType<typeof useHomeFeedController>;
