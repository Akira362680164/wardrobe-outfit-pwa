import type { RecommendationDisplayItemV3, WeatherLocationCandidate, WeatherOverview } from "@wardrobe/cloud-contracts";

import { getRuntimeSessionScope, getSession } from "../../stores/session";
import {
  clearMiniTemporaryCity,
  putMiniHomeCity,
  readMiniHomeLocation,
  readMiniHomeRecommendations,
  readMiniHomeWeather,
  resolveMiniDeviceLocation,
  resolveMiniHomeRecommendations,
  searchMiniHomeCities,
  type MiniHomeLocationSnapshot,
} from "../../services/home";
import {
  fetchGarments,
  fetchPlanningSnapshot,
  getWorkspaceReadState,
  type MiniGarment,
  type MiniOutfitPlanEntry,
  type PlanningSnapshot,
} from "../../services/workspace";
import {
  HomeGenerationGate,
  buildHomeDateStrip,
  buildHomeGreeting,
  buildHomeLocationLabel,
  createStableMutationSession,
  formatHomeBusinessDate,
  homeBusinessWindow,
  shouldRequestMiniLocationPermission,
} from "./model";

type WeatherCard = {
  status: "loading" | "ready" | "error" | "unavailable";
  label: string;
  temperature: string;
  summary: string;
  meta: string;
  stale: boolean;
  code: string;
};

type HomeRecommendationCard = {
  recommendationId: string;
  revision: number;
  candidateId: string;
  objective: string;
  title: string;
  reason: string;
  risk: string;
  garments: Array<{ id: string; name: string; imageUrl: string }>;
  blocked: boolean;
};

const readGate = new HomeGenerationGate();
const dateGate = new HomeGenerationGate();
const locationMutations = createStableMutationSession<{ kind: string; locationId?: string; expectedRevision: number }>();

Page({
  data: {
    loading: true,
    error: "",
    greeting: "",
    businessDateLabel: "",
    today: "",
    tomorrow: "",
    selectedDate: "",
    dateItems: [] as ReturnType<typeof buildHomeDateStrip>,
    activeSection: "recommendation" as "recommendation" | "wardrobe",
    locationLabel: "未设置城市",
    locationSheetOpen: false,
    locationSnapshot: null as MiniHomeLocationSnapshot | null,
    cityQuery: "",
    citySearching: false,
    cityCandidates: [] as WeatherLocationCandidate[],
    locationBusy: false,
    locationMessage: "",
    locationNeedsSettings: false,
    todayWeather: loadingWeather("今天"),
    tomorrowWeather: loadingWeather("明天"),
    weatherAttribution: "",
    recommendationLoading: true,
    recommendationError: "",
    recommendationMode: "",
    recommendationCards: [] as HomeRecommendationCard[],
    travelDates: [] as Array<{ date: string; title: string; destination: string; dateLabel: string }>,
    plan: null as ReturnType<typeof mapPlan> | null,
    garments: [] as MiniGarment[],
    wardrobeEmpty: false,
    createSheetOpen: false,
    canvasVisible: false,
    canvasStaticFallback: true,
  },

  onLoad(this: any) {
    wx.setNavigationBarTitle({ title: "首页" });
    const window = homeBusinessWindow(new Date());
    this.sessionScope = getRuntimeSessionScope();
    this.planning = null;
    this.setData({
      greeting: buildHomeGreeting(new Date()),
      businessDateLabel: formatHomeBusinessDate(window.today),
      today: window.today,
      tomorrow: window.tomorrow,
      selectedDate: window.today,
      dateItems: buildHomeDateStrip(window),
    });
  },

  onShow(this: any) {
    const nextScope = getRuntimeSessionScope();
    const nextWindow = homeBusinessWindow(new Date());
    const crossedMidnight = this.data.today && this.data.today !== nextWindow.today;
    const accountChanged = this.sessionScope !== nextScope;
    if (crossedMidnight || accountChanged) {
      readGate.reset(nextScope);
      dateGate.reset(nextScope);
      locationMutations.clear();
      this.sessionScope = nextScope;
      this.planning = null;
      this.setData({
        selectedDate: nextWindow.today,
        today: nextWindow.today,
        tomorrow: nextWindow.tomorrow,
        dateItems: buildHomeDateStrip(nextWindow),
        businessDateLabel: formatHomeBusinessDate(nextWindow.today),
        garments: [],
        recommendationCards: [],
        plan: null,
      });
    }
    this.loadHome(accountChanged || crossedMidnight || !this.data.garments.length);
    this.resumeWeatherCanvas();
  },

  onHide(this: any) { this.pauseWeatherCanvas(); },
  onUnload(this: any) {
    readGate.reset();
    dateGate.reset();
    locationMutations.clear();
    this.pauseWeatherCanvas();
  },

  async loadHome(this: any, force = false) {
    const state = getWorkspaceReadState();
    if (state !== "ready") {
      this.setData({ loading: false, error: state === "logged_out" ? "登录后即可查看今日穿搭" : "服务暂未配置，请稍后再试" });
      return;
    }
    if (this.loadingHome && !force) return;
    this.loadingHome = true;
    const accountId = getSession()?.user?.id ?? getRuntimeSessionScope();
    const ticket = readGate.begin(accountId, this.data.selectedDate);
    this.setData({ loading: true, error: "" });
    const [garmentsResult, planningResult, locationResult] = await Promise.allSettled([
      fetchGarments(500), fetchPlanningSnapshot(), readMiniHomeLocation(ticket.signal),
    ]);
    this.loadingHome = false;
    if (!readGate.isCurrent(ticket)) return;
    if (garmentsResult.status === "rejected" || planningResult.status === "rejected") {
      const failure = garmentsResult.status === "rejected"
        ? garmentsResult.reason
        : planningResult.status === "rejected" ? planningResult.reason : new Error("首页读取失败");
      this.setData({ loading: false, error: messageOf(failure, "读取首页失败，请重试") });
      return;
    }
    const garments = garmentsResult.value;
    this.planning = planningResult.value;
    const location = locationResult.status === "fulfilled" ? locationResult.value : null;
    this.setData({
      loading: false,
      garments,
      wardrobeEmpty: garments.length === 0,
      travelDates: buildFarTravelDates(planningResult.value, this.data.dateItems),
      locationSnapshot: location,
      locationLabel: profileLocationLabel(location),
      locationMessage: locationResult.status === "rejected" ? "地点暂时无法读取，你仍可重试天气与推荐。" : "",
    });
    await this.loadSelectedDate(this.data.selectedDate, true);
  },

  async loadSelectedDate(this: any, date: string, preloadPair = false) {
    const accountId = getSession()?.user?.id ?? getRuntimeSessionScope();
    const ticket = dateGate.begin(accountId, date);
    const dates = preloadPair && date === this.data.today ? [this.data.today, this.data.tomorrow] : [date];
    this.setData({ selectedDate: date, recommendationLoading: true, recommendationError: "" });
    const weatherResults = await Promise.allSettled(dates.map((target) => readMiniHomeWeather(target, ticket.signal)));
    if (!dateGate.isCurrent(ticket)) return;
    const weatherPatch: Record<string, unknown> = {};
    dates.forEach((target, index) => {
      const result = weatherResults[index]!;
      const key = target === this.data.today ? "todayWeather" : target === this.data.tomorrow ? "tomorrowWeather" : null;
      if (key) weatherPatch[key] = result.status === "fulfilled" ? mapWeather(result.value, target === this.data.today ? "今天" : "明天", target === this.data.today) : errorWeather(target === this.data.today ? "今天" : "明天");
    });
    const selectedWeather = weatherResults[dates.indexOf(date)];
    if (selectedWeather?.status === "fulfilled") {
      const overview = selectedWeather.value;
      weatherPatch.locationLabel = overview.resolvedLocation && overview.locationSource
        ? buildHomeLocationLabel({ displayName: overview.resolvedLocation.displayName, source: overview.locationSource })
        : this.data.locationLabel;
      weatherPatch.weatherAttribution = overview.attribution?.label ?? "";
      weatherPatch.canvasVisible = date === this.data.today && overview.availabilityReason === "available";
    }
    this.setData(weatherPatch);

    try {
      let item: RecommendationDisplayItemV3 | undefined;
      try {
        const current = await readMiniHomeRecommendations(dates[0]!, dates[dates.length - 1]!, ticket.signal);
        item = current.items.find((entry): entry is RecommendationDisplayItemV3 => entry.targetDate === date && "recommendationRevision" in entry);
      } catch {
        // A missing current recommendation is resolved by the server coordinator below.
      }
      if (!item) {
        const resolved = await resolveMiniHomeRecommendations(dates, ticket.signal);
        const result = resolved.results.find((entry) => entry.targetDate === date);
        if (!dateGate.isCurrent(ticket)) return;
        if (result?.status === "protected_plan" || result?.status === "actual_wear") {
          this.setData({
            recommendationLoading: false,
            recommendationMode: result.status,
            recommendationCards: [],
            plan: mapPlan(findPlan(this.planning, date, result.protectedPlanEntryId), this.data.garments),
          });
          return;
        }
        item = result?.recommendation;
      }
      if (!dateGate.isCurrent(ticket)) return;
      this.setData({
        recommendationLoading: false,
        recommendationMode: item?.contextMode ?? (selectedWeather?.status === "fulfilled" ? selectedWeather.value.contextMode : "weather_fallback"),
        recommendationCards: item ? mapRecommendationCards(item, this.data.garments) : [],
        plan: mapPlan(findPlan(this.planning, date), this.data.garments),
      });
    } catch (error) {
      if (!dateGate.isCurrent(ticket)) return;
      this.setData({ recommendationLoading: false, recommendationError: messageOf(error, "推荐暂时无法读取") });
    }
  },

  selectDate(this: any, event: any) {
    const date = String(event.currentTarget.dataset.date || "");
    if (!date || date === this.data.selectedDate) return;
    this.loadSelectedDate(date, false);
  },
  selectTravelDate(this: any, event: any) {
    const date = String(event.currentTarget.dataset.date || "");
    if (date) this.loadSelectedDate(date, false);
  },
  selectWeatherDate(this: any, event: any) {
    const date = event.currentTarget.dataset.date === "tomorrow" ? this.data.tomorrow : this.data.today;
    this.loadSelectedDate(date, false);
  },
  retryHome(this: any) { this.loadHome(true); },
  retrySelectedDate(this: any) { this.loadSelectedDate(this.data.selectedDate, this.data.selectedDate === this.data.today); },
  setSection(this: any, event: any) { this.setData({ activeSection: event.currentTarget.dataset.section }); },
  openGarment(this: any, event: any) { wx.navigateTo({ url: `/pages/wardrobe/detail/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}` }); },
  openIntake() { wx.navigateTo({ url: "/pages/intake/camera/index" }); },
  openCreateSheet(this: any) { this.setData({ createSheetOpen: true }); },
  closeCreateSheet(this: any) { this.setData({ createSheetOpen: false }); },

  openLocationSheet(this: any) {
    this.setData({ locationSheetOpen: true, locationMessage: "", locationNeedsSettings: false });
  },
  closeLocationSheet(this: any) { if (!this.data.locationBusy) this.setData({ locationSheetOpen: false }); },
  inputCityQuery(this: any, event: any) { this.setData({ cityQuery: event.detail.value }); },
  async searchCity(this: any) {
    const query = String(this.data.cityQuery || "").trim();
    if (query.length < 2) {
      this.setData({ locationMessage: "请至少输入 2 个字搜索城市。" });
      return;
    }
    this.setData({ citySearching: true, locationMessage: "", locationNeedsSettings: false });
    try {
      const candidates = await searchMiniHomeCities(query);
      this.setData({ citySearching: false, cityCandidates: candidates, locationMessage: candidates.length ? "" : "没有找到匹配城市，请换个关键词。" });
    } catch (error) {
      this.setData({ citySearching: false, locationMessage: messageOf(error, "城市搜索失败") });
    }
  },
  async useCurrentLocation(this: any) {
    if (!shouldRequestMiniLocationPermission({ sheetOpened: this.data.locationSheetOpen, purposeSeen: true, userTappedUseCurrent: true })) return;
    this.setData({ locationBusy: true, locationMessage: "正在获取粗略位置并解析城市…", locationNeedsSettings: false });
    try {
      await requirePrivacyAuthorization();
      const position = await getCoarseLocation();
      const candidates = await resolveMiniDeviceLocation(position.longitude, position.latitude);
      this.setData({
        locationBusy: false,
        cityCandidates: candidates,
        locationMessage: candidates.length ? "请确认候选城市，再选择临时或常驻。坐标不会保存。" : "未解析到城市，请使用手工搜索。",
      });
    } catch (error) {
      const message = messageOf(error, "无法获取位置，仍可手工搜索城市。");
      this.setData({ locationBusy: false, locationMessage: message, locationNeedsSettings: /deny|denied|auth|permission/i.test(message) });
    }
  },
  openLocationSettings(this: any) {
    const openSetting = (wx as any).openSetting;
    if (typeof openSetting !== "function") {
      this.setData({ locationMessage: "当前微信版本无法打开设置，请使用手工城市搜索。" });
      return;
    }
    this.setData({ locationMessage: "请在微信设置中允许位置；返回后仍需再次主动点击“使用当前位置”。" });
    openSetting({
      success: (result: any) => {
        const allowed = result?.authSetting?.["scope.userLocation"] === true;
        this.setData({
          locationNeedsSettings: !allowed,
          locationMessage: allowed
            ? "位置权限已允许。请再次点击“使用当前位置”，首页不会自动获取。"
            : "位置权限仍未允许，手工城市搜索和无城市推荐可继续使用。",
        });
      },
      fail: () => this.setData({ locationMessage: "无法打开微信设置，请使用手工城市搜索。" }),
    });
  },
  async chooseCity(this: any, event: any) {
    const locationId = String(event.currentTarget.dataset.id || "");
    const kind = event.currentTarget.dataset.kind === "temporary" ? "temporary" : "home";
    const location = (this.data.cityCandidates as WeatherLocationCandidate[]).find((candidate) => candidate.locationId === locationId);
    const snapshot = this.data.locationSnapshot as MiniHomeLocationSnapshot | null;
    if (!location || !snapshot) return;
    const expectedRevision = kind === "home" ? snapshot.profile.revision : snapshot.override.revision;
    const draft = { kind, locationId, expectedRevision };
    const clientMutationId = locationMutations.idFor(draft);
    this.setData({ locationBusy: true, locationMessage: "正在保存，确认成功后生效…" });
    try {
      const next = await putMiniHomeCity(kind, location, expectedRevision, clientMutationId);
      locationMutations.confirm(draft);
      this.setData({ locationBusy: false, locationSheetOpen: false, locationSnapshot: next, locationLabel: profileLocationLabel(next), cityCandidates: [], cityQuery: "" });
      this.loadSelectedDate(this.data.selectedDate, this.data.selectedDate === this.data.today);
    } catch (error) {
      this.setData({ locationBusy: false, locationMessage: messageOf(error, "保存城市失败，请重试") });
    }
  },
  async clearTemporary(this: any) {
    const snapshot = this.data.locationSnapshot as MiniHomeLocationSnapshot | null;
    if (!snapshot?.override.override) return;
    const draft = { kind: "clear_temporary", expectedRevision: snapshot.override.revision };
    const clientMutationId = locationMutations.idFor(draft);
    this.setData({ locationBusy: true, locationMessage: "正在恢复常驻城市…" });
    try {
      const next = await clearMiniTemporaryCity(snapshot.override.revision, clientMutationId);
      locationMutations.confirm(draft);
      this.setData({ locationBusy: false, locationSheetOpen: false, locationSnapshot: next, locationLabel: profileLocationLabel(next) });
      this.loadSelectedDate(this.data.selectedDate, this.data.selectedDate === this.data.today);
    } catch (error) {
      this.setData({ locationBusy: false, locationMessage: messageOf(error, "恢复常驻城市失败") });
    }
  },

  resumeWeatherCanvas(this: any) {
    // P3 shared engine is attached after the main dependency lands. The host stays static until then.
    this.weatherCanvasRuntime?.resume?.();
  },
  pauseWeatherCanvas(this: any) { this.weatherCanvasRuntime?.pause?.(); },
});

function mapWeather(value: WeatherOverview, label: string, today: boolean): WeatherCard {
  if (value.availabilityReason !== "available") return unavailableWeather(label, value.contextMode === "locationless" ? "未设置城市" : "天气暂时不可用");
  const evidence = value.weatherEvidence;
  const temperature = today && evidence.currentTemperatureC !== undefined
    ? `${Math.round(evidence.currentTemperatureC)}°`
    : evidence.temperatureMinC !== undefined && evidence.temperatureMaxC !== undefined
      ? `${Math.round(evidence.temperatureMaxC)}°/${Math.round(evidence.temperatureMinC)}°`
      : "--°";
  return {
    status: "ready", label, temperature, summary: evidence.summary,
    meta: today
      ? [evidence.currentFeelsLikeC !== undefined ? `体感 ${Math.round(evidence.currentFeelsLikeC)}°` : "", evidence.windLevel !== undefined ? `${evidence.windLevel} 级风` : ""].filter(Boolean).join(" · ")
      : evidence.temperatureMinC !== undefined ? `最低 ${Math.round(evidence.temperatureMinC)}° · 日间预报` : "日间预报",
    stale: value.endpointFreshness.some((entry) => entry.freshness === "stale"),
    code: (today ? evidence.weatherCode : evidence.dayWeatherCode) ?? "998",
  };
}

function loadingWeather(label: string): WeatherCard { return { status: "loading", label, temperature: "--°", summary: "正在读取", meta: "", stale: false, code: "998" }; }
function errorWeather(label: string): WeatherCard { return { status: "error", label, temperature: "--°", summary: "天气读取失败", meta: "点击重试", stale: false, code: "998" }; }
function unavailableWeather(label: string, summary: string): WeatherCard { return { status: "unavailable", label, temperature: "--°", summary, meta: "使用通用推荐", stale: false, code: "998" }; }

function mapRecommendationCards(item: RecommendationDisplayItemV3, garments: MiniGarment[]): HomeRecommendationCard[] {
  const byId = new Map(garments.map((garment) => [garment.id, garment]));
  return item.recommendations.map((candidate) => ({
    recommendationId: item.recommendationId,
    revision: item.recommendationRevision,
    candidateId: candidate.candidateId,
    objective: objectiveLabel(candidate.objective),
    title: `${objectiveLabel(candidate.objective)}搭配`,
    reason: reasonLabel(candidate.reasonCodes[0]),
    risk: riskLabel(candidate.riskCodes[0], item.contextMode),
    garments: candidate.garmentIds.map((id) => byId.get(id)).filter((garment): garment is MiniGarment => Boolean(garment)).map((garment) => ({ id: garment.id, name: garment.name, imageUrl: garment.imageUrl })),
    blocked: candidate.riskCodes.some((code) => String(code).includes("blocked") || String(code).includes("severe")),
  }));
}

function findPlan(planning: PlanningSnapshot | null, date: string, id?: string): MiniOutfitPlanEntry | undefined {
  return planning?.outfitPlanEntries.find((entry) => id ? entry.id === id : entry.date === date && entry.isPrimary);
}

function buildFarTravelDates(planning: PlanningSnapshot, dateItems: Array<{ date: string }>) {
  const regular = new Set(dateItems.map((item) => item.date));
  return planning.calendarPlans
    .filter((trip) => !regular.has(trip.startDate) && trip.startDate > (dateItems[0]?.date ?? ""))
    .sort((left, right) => left.startDate.localeCompare(right.startDate))
    .slice(0, 6)
    .map((trip) => ({
      date: trip.startDate,
      title: trip.title || "出行建议",
      destination: trip.destination || "行程地点",
      dateLabel: formatHomeBusinessDate(trip.startDate),
    }));
}

function mapPlan(plan: MiniOutfitPlanEntry | undefined, garments: MiniGarment[]) {
  if (!plan) return null;
  const byId = new Map(garments.map((garment) => [garment.id, garment]));
  const ids = plan.status === "worn" && plan.actualGarmentIds.length ? plan.actualGarmentIds : plan.garmentIds;
  return {
    id: plan.id,
    title: plan.status === "worn" ? "今天已穿" : "当日穿搭",
    stateText: plan.status === "worn" ? "已经确认穿过，之后的建议不会覆盖" : "这套已安排；天气有变化时会提醒你，不会自动更换",
    risk: plan.availability === "blocked" ? "部分衣物已不可用，请先调整穿搭。" : plan.availability === "historical" ? "当前显示历史快照。" : "",
    garments: ids.slice(0, 3).map((id) => ({ id, name: byId.get(id)?.name ?? "已删除衣物", imageUrl: byId.get(id)?.imageUrl ?? "" })),
  };
}

function profileLocationLabel(snapshot: MiniHomeLocationSnapshot | null): string {
  const temporary = snapshot?.override.override;
  if (temporary) return buildHomeLocationLabel({ displayName: temporary.location.displayName, source: "temporary_override" });
  const home = snapshot?.profile.homeCity;
  return home ? buildHomeLocationLabel({ displayName: home.displayName, source: "home_city" }) : "未设置城市";
}

function objectiveLabel(value: string): string { return value === "fresh" ? "变化" : value === "comfort" ? "舒适" : "稳妥"; }
function reasonLabel(value?: string): string {
  const labels: Record<string, string> = { weather_fit: "与当前天气证据匹配。", rain_ready: "已考虑降雨与路面情况。", activity_comfort: "活动空间与舒适度更充足。", new_combination: "在可靠结构中加入新的组合变化。", rotation_value: "优先带回近期较少穿着的衣物。" };
  return labels[value ?? ""] ?? "结合场景与衣橱状态整理。";
}
function riskLabel(value: string | undefined, mode: string): string {
  if (!value) return mode === "forecast" ? "未发现需要特别提醒的天气风险。" : "通用建议不作温度或降雨判断。";
  return `风险提示：${value}`;
}
function messageOf(error: unknown, fallback: string): string { return error instanceof Error && error.message ? error.message : fallback; }

async function requirePrivacyAuthorization(): Promise<void> {
  const api = wx as any;
  if (typeof api.requirePrivacyAuthorize !== "function") return;
  await new Promise<void>((resolve, reject) => api.requirePrivacyAuthorize({ success: resolve, fail: reject }));
}

async function getCoarseLocation(): Promise<{ longitude: number; latitude: number }> {
  const api = wx as any;
  return new Promise((resolve, reject) => api.getLocation({
    type: "wgs84",
    isHighAccuracy: false,
    success: (result: { longitude: number; latitude: number }) => resolve({ longitude: result.longitude, latitude: result.latitude }),
    fail: reject,
  }));
}
