import type {
  AcceptRecommendationCommand,
  CancelPrimaryPlanCommand,
  RecommendationDisplayItemV3,
  RejectRecommendationCommand,
  WeatherLocationCandidate,
  WeatherOverview,
} from "../../generated/wardora-home-contracts";

import { getRuntimeSessionScope, getSession } from "../../stores/session";
import { currentAccessibilityFontStyle } from "../../utils/accessibility-font";
import { selectCustomTab, setCustomTabHidden } from "../../utils/custom-tab-bar";
import {
  clearMiniTemporaryCity,
  acceptMiniHomeRecommendation,
  cancelMiniHomePrimaryPlan,
  markMiniHomePlanWorn,
  putMiniHomeCity,
  readMiniHomeLocation,
  readMiniHomeRecommendations,
  readMiniHomeWeather,
  resolveMiniDeviceLocation,
  resolveMiniHomeRecommendations,
  rejectMiniHomeRecommendation,
  searchMiniHomeCities,
  undoMiniHomePlanWorn,
  type MiniHomeLocationSnapshot,
} from "../../services/home";
import {
  fetchGarments,
  createOutfit,
  fetchOutfits,
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
import { createMiniWeatherCanvasRuntime } from "./weather-canvas-runtime";
import {
  buildReplacementChoices,
  hasAcceptedPlanReadback,
  hasWornStateReadback,
  homeActionErrorMessage,
  isPlanCanceledReadback,
} from "./p2-model";
import {
  recommendationSourceSummary,
  shouldResolveRecommendationForWeather,
} from "./recommendation-source";
import { recommendationReasonLabel, recommendationRiskLabel } from "./risk-label";

type WeatherCard = {
  status: "loading" | "ready" | "error" | "unavailable";
  label: string;
  temperature: string;
  high: string;
  highCompact: string;
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
  garments: Array<{ id: string; legacyItemId: number; name: string; imageUrl: string; category: string }>;
  garmentIds: string[];
  blocked: boolean;
};

const readGate = new HomeGenerationGate();
const dateGate = new HomeGenerationGate();
const locationMutations = createStableMutationSession<{ kind: string; locationId?: string; expectedRevision: number }>();
const recommendationMutations = createStableMutationSession<Record<string, unknown>>();
const planMutations = createStableMutationSession<Record<string, unknown>>();
const outfitMutations = createStableMutationSession<Record<string, unknown>>();

Page({
  data: {
    fontStyle: currentAccessibilityFontStyle(),
    loading: true,
    error: "",
    greeting: "",
    businessDateLabel: "",
    today: "",
    tomorrow: "",
    selectedDate: "",
    recommendationHeading: "今天",
    recommendationSubtitle: "天气增强推荐 · 横向滑动",
    recommendationActionLabel: "设为今日穿搭",
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
    recommendationSourceSummary: "通用建议",
    recommendationCards: [] as HomeRecommendationCard[],
    travelDates: [] as Array<{ date: string; title: string; destination: string; dateLabel: string }>,
    plan: null as ReturnType<typeof mapPlan> | null,
    planBackups: [] as ReturnType<typeof mapBackupPlans>,
    garments: [] as MiniGarment[],
    wardrobeEmpty: false,
    createSheetOpen: false,
    canvasVisible: false,
    canvasStaticFallback: true,
    recommendationSheetOpen: false,
    selectedRecommendation: null as HomeRecommendationCard | null,
    actionBusy: false,
    actionMessage: "",
    replacementSourceIndex: 0,
    replacementSourceLabels: [] as string[],
    replacementChoiceIndex: 0,
    replacementChoices: [] as Array<{ id: string; label: string }>,
    cancelSheetOpen: false,
    cancelBackupId: "",
    postAcceptSheetOpen: false,
    postAcceptRecommendation: null as HomeRecommendationCard | null,
    planActionHint: "",
  },

  onLoad(this: any) {
    wx.setNavigationBarTitle({ title: "首页" });
    const window = homeBusinessWindow(new Date());
    this.sessionScope = getRuntimeSessionScope();
    this.planning = null;
    this.canvasGeneration = 0;
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
    selectCustomTab(this, 0);
    setCustomTabHidden(this, Boolean(this.data.recommendationSheetOpen || this.data.postAcceptSheetOpen || this.data.cancelSheetOpen || this.data.locationSheetOpen || this.data.createSheetOpen));
    this.canvasForeground = true;
    const nextScope = getRuntimeSessionScope();
    const nextWindow = homeBusinessWindow(new Date());
    const crossedMidnight = this.data.today && this.data.today !== nextWindow.today;
    const accountChanged = this.sessionScope !== nextScope;
    if (crossedMidnight || accountChanged) {
      readGate.reset(nextScope);
      dateGate.reset(nextScope);
      locationMutations.clear();
      recommendationMutations.clear();
      planMutations.clear();
      outfitMutations.clear();
      this.sessionScope = nextScope;
      this.planning = null;
      this.setData({
        selectedDate: nextWindow.today,
        recommendationHeading: recommendationHeading(nextWindow.today, nextWindow.today, nextWindow.tomorrow),
        recommendationActionLabel: recommendationActionLabel(nextWindow.today, nextWindow.today, nextWindow.tomorrow),
        today: nextWindow.today,
        tomorrow: nextWindow.tomorrow,
        dateItems: buildHomeDateStrip(nextWindow),
        businessDateLabel: formatHomeBusinessDate(nextWindow.today),
        garments: [],
        recommendationCards: [],
        plan: null,
        planBackups: [],
      });
    }
    this.loadHome(accountChanged || crossedMidnight || !this.data.garments.length);
    this.resumeWeatherCanvas();
  },

  onHide(this: any) { this.canvasForeground = false; this.pauseWeatherCanvas(); },
  onUnload(this: any) {
    readGate.reset();
    dateGate.reset();
    locationMutations.clear();
    recommendationMutations.clear();
    planMutations.clear();
    outfitMutations.clear();
    this.destroyWeatherCanvas();
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
    this.setData({
      selectedDate: date,
      recommendationHeading: recommendationHeading(date, this.data.today, this.data.tomorrow),
      recommendationActionLabel: recommendationActionLabel(date, this.data.today, this.data.tomorrow),
      recommendationLoading: true,
      recommendationError: "",
      recommendationSourceSummary: "通用建议",
      recommendationCards: [],
    });
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
      weatherPatch.weatherAttribution = weatherAttributionLabel(overview);
      weatherPatch.canvasVisible = date === this.data.today && overview.availabilityReason === "available";
    }
    this.setData(weatherPatch, () => {
      if (selectedWeather?.status === "fulfilled" && date === this.data.today) this.syncWeatherCanvas(selectedWeather.value);
      else if (date === this.data.today) this.destroyWeatherCanvas(true);
    });

    try {
      let item: RecommendationDisplayItemV3 | undefined;
      try {
        const current = await readMiniHomeRecommendations(dates[0]!, dates[dates.length - 1]!, ticket.signal);
        item = current.items.find((entry): entry is RecommendationDisplayItemV3 => entry.targetDate === date && "recommendationRevision" in entry);
      } catch {
        // A missing current recommendation is resolved by the server coordinator below.
      }
      const weatherForSelectedDate = selectedWeather?.status === "fulfilled"
        ? selectedWeather.value
        : undefined;
      if (!item || shouldResolveRecommendationForWeather(item, weatherForSelectedDate)) {
        const resolved = await resolveMiniHomeRecommendations(dates, ticket.signal);
        const result = resolved.results.find((entry) => entry.targetDate === date);
        if (!dateGate.isCurrent(ticket)) return;
        if (result?.status === "protected_plan" || result?.status === "actual_wear") {
          this.setData({
            recommendationLoading: false,
            recommendationMode: result.status,
            recommendationSubtitle: "已有安排 · 可继续切换日期",
            recommendationCards: [],
            plan: mapPlan(findPlan(this.planning, date, result.protectedPlanEntryId), this.data.garments),
            planBackups: mapBackupPlans(this.planning, date, this.data.garments),
          });
          return;
        }
        item = result?.recommendation ?? item;
      }
      if (!dateGate.isCurrent(ticket)) return;
      const mode = item?.contextMode ?? (selectedWeather?.status === "fulfilled" ? selectedWeather.value.contextMode : "weather_fallback");
      this.setData({
        recommendationLoading: false,
        recommendationMode: mode,
        recommendationSourceSummary: recommendationSourceSummary(item),
        recommendationSubtitle: recommendationSubtitle(mode),
        recommendationCards: item ? mapRecommendationCards(item, this.data.garments) : [],
        plan: mapPlan(findPlan(this.planning, date), this.data.garments),
        planBackups: mapBackupPlans(this.planning, date, this.data.garments),
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
  openCreateSheet(this: any) { setCustomTabHidden(this, true); this.setData({ createSheetOpen: true }); },
  closeCreateSheet(this: any) { setCustomTabHidden(this, false); this.setData({ createSheetOpen: false }); },

  openRecommendationSheet(this: any, event: any) {
    const candidateId = String(event.currentTarget.dataset.candidate || "");
    const selected = (this.data.recommendationCards as HomeRecommendationCard[]).find((card) => card.candidateId === candidateId);
    if (!selected) return;
    setCustomTabHidden(this, true);
    this.setData({
      recommendationSheetOpen: true,
      selectedRecommendation: selected,
      actionMessage: "",
      replacementSourceIndex: 0,
      replacementSourceLabels: selected.garments.map((garment) => garment.name),
      replacementChoiceIndex: 0,
      replacementChoices: buildReplacementChoices(selected, 0, this.data.garments),
    });
  },
  closeRecommendationSheet(this: any) {
    if (!this.data.actionBusy) {
      setCustomTabHidden(this, false);
      this.setData({ recommendationSheetOpen: false, selectedRecommendation: null, actionMessage: "" });
    }
  },
  async applyRecommendation(this: any, event: any) {
    const candidateId = String(event.currentTarget.dataset.candidate || "");
    const selected = (this.data.recommendationCards as HomeRecommendationCard[]).find((card) => card.candidateId === candidateId);
    if (!selected || selected.blocked) return;
    await this.commitRecommendation(selected, selected.garmentIds.slice());
  },
  selectReplacementSource(this: any, event: any) {
    const selected = this.data.selectedRecommendation as HomeRecommendationCard | null;
    if (!selected) return;
    const index = Number(event.detail.value) || 0;
    this.setData({ replacementSourceIndex: index, replacementChoiceIndex: 0, replacementChoices: buildReplacementChoices(selected, index, this.data.garments) });
  },
  selectReplacementChoice(this: any, event: any) { this.setData({ replacementChoiceIndex: Number(event.detail.value) || 0 }); },
  async applySelectedRecommendation(this: any) {
    const selected = this.data.selectedRecommendation as HomeRecommendationCard | null;
    if (!selected || selected.blocked) return;
    const selectedGarmentIds = selected.garmentIds.slice();
    const replacement = this.data.replacementChoices[this.data.replacementChoiceIndex] as { id: string } | undefined;
    if (replacement?.id) selectedGarmentIds[this.data.replacementSourceIndex] = replacement.id;
    await this.commitRecommendation(selected, selectedGarmentIds);
  },
  async commitRecommendation(this: any, selected: HomeRecommendationCard, selectedGarmentIds: string[]) {
    const currentPlan = this.data.plan as ReturnType<typeof mapPlan> | null;
    const draft = {
      kind: "accept",
      targetDate: this.data.selectedDate,
      recommendationId: selected.recommendationId,
      revision: selected.revision,
      candidateId: selected.candidateId,
      selectedGarmentIds,
      replacePlanId: currentPlan?.status === "planned" ? currentPlan.id : "",
      replaceRevision: currentPlan?.status === "planned" ? currentPlan.revision : 0,
    };
    const clientMutationId = recommendationMutations.idFor(draft);
    const command: AcceptRecommendationCommand = {
      clientMutationId,
      recommendationId: selected.recommendationId,
      expectedRecommendationRevision: selected.revision,
      candidateId: selected.candidateId,
      selectedGarmentIds,
      ...(currentPlan?.status === "planned" ? { replaceExistingPrimary: { planEntryId: currentPlan.id, expectedRevision: currentPlan.revision } } : {}),
    };
    this.setData({ actionBusy: true, actionMessage: "正在安排，确认后显示…" });
    try {
      let committedPlanId = "";
      try {
        committedPlanId = (await acceptMiniHomeRecommendation(this.data.selectedDate, command)).plan.id;
      } catch (error) {
        const recovered = await fetchPlanningSnapshot();
        if (!hasAcceptedPlanReadback(recovered, this.data.selectedDate, selected.candidateId, selectedGarmentIds)) throw error;
      }
      const planning = await this.refreshPlanningReadback();
      if (!hasAcceptedPlanReadback(planning, this.data.selectedDate, selected.candidateId, selectedGarmentIds, committedPlanId)) throw new Error("readback_missing");
      recommendationMutations.confirm(draft);
      setCustomTabHidden(this, true);
      this.setData({
        actionBusy: false,
        actionMessage: "",
        recommendationSheetOpen: false,
        selectedRecommendation: null,
        postAcceptSheetOpen: true,
        postAcceptRecommendation: cardWithGarmentIds(selected, selectedGarmentIds, this.data.garments),
        planActionHint: "",
      });
    } catch (error) {
      this.setData({ actionBusy: false, actionMessage: homeActionErrorMessage(error) });
    }
  },
  async rejectSelectedRecommendation(this: any) {
    const selected = this.data.selectedRecommendation as HomeRecommendationCard | null;
    if (!selected) return;
    const draft = { kind: "reject", recommendationId: selected.recommendationId, revision: selected.revision, candidateId: selected.candidateId, reason: "not_for_me" };
    const command: RejectRecommendationCommand = {
      clientMutationId: recommendationMutations.idFor(draft), recommendationId: selected.recommendationId,
      expectedRecommendationRevision: selected.revision, candidateId: selected.candidateId, reason: "not_for_me",
    };
    this.setData({ actionBusy: true, actionMessage: "正在记录…" });
    try {
      await rejectMiniHomeRecommendation(command);
      await this.loadSelectedDate(this.data.selectedDate, false);
      recommendationMutations.confirm(draft);
      setCustomTabHidden(this, false);
      this.setData({ actionBusy: false, recommendationSheetOpen: false, selectedRecommendation: null, actionMessage: "" });
      wx.showToast({ title: "已记录", icon: "success" });
    } catch (error) {
      this.setData({ actionBusy: false, actionMessage: homeActionErrorMessage(error) });
    }
  },
  async saveSelectedOutfit(this: any) {
    let selected = (this.data.selectedRecommendation || this.data.postAcceptRecommendation) as HomeRecommendationCard | null;
    if (!selected) return;
    if (this.data.selectedRecommendation) {
      const selectedGarmentIds = selected.garmentIds.slice();
      const replacement = this.data.replacementChoices[this.data.replacementChoiceIndex] as { id: string } | undefined;
      if (replacement?.id) selectedGarmentIds[this.data.replacementSourceIndex] = replacement.id;
      selected = cardWithGarmentIds(selected, selectedGarmentIds, this.data.garments);
    }
    const draft = { kind: "save_outfit", candidateId: selected.candidateId, garmentIds: selected.garmentIds };
    const clientMutationId = outfitMutations.idFor(draft);
    this.setData({ actionBusy: true, actionMessage: "正在保存套装…" });
    try {
      const entity = await createOutfit({
        name: `${formatHomeBusinessDate(this.data.selectedDate)}穿搭`,
        legacyItemIds: selected.garments.map((garment) => garment.legacyItemId).filter((id) => Number.isInteger(id)),
        notes: "来自 Wardora 首页推荐",
        clientMutationId,
      });
      const outfits = await fetchOutfits(200);
      if (!outfits.some((outfit) => outfit.id === entity.id)) throw new Error("readback_missing");
      outfitMutations.confirm(draft);
      setCustomTabHidden(this, false);
      this.setData({ actionBusy: false, actionMessage: "", recommendationSheetOpen: false, selectedRecommendation: null, postAcceptSheetOpen: false, postAcceptRecommendation: null });
      wx.showToast({ title: "已保存到套装", icon: "success" });
    } catch (error) {
      this.setData({ actionBusy: false, actionMessage: homeActionErrorMessage(error) });
    }
  },
  closePostAcceptSheet(this: any) {
    if (!this.data.actionBusy) {
      setCustomTabHidden(this, false);
      this.setData({ postAcceptSheetOpen: false, postAcceptRecommendation: null, actionMessage: "" });
    }
  },
  beginChangePlan(this: any) {
    const first = (this.data.recommendationCards as HomeRecommendationCard[])[0];
    if (!first) { this.setData({ planActionHint: "当前没有可用于更换的建议，请稍后重试。" }); return; }
    this.setData({ planActionHint: "选择建议并确认后，原穿搭会保留为备选。" });
    this.openRecommendationSheet({ currentTarget: { dataset: { candidate: first.candidateId } } });
  },
  openCancelPlanSheet(this: any) {
    const plan = this.data.plan as ReturnType<typeof mapPlan> | null;
    if (!plan || plan.status === "worn") return;
    setCustomTabHidden(this, true);
    this.setData({ cancelSheetOpen: true, cancelBackupId: "", actionMessage: "" });
  },
  closeCancelPlanSheet(this: any) { if (!this.data.actionBusy) { setCustomTabHidden(this, false); this.setData({ cancelSheetOpen: false, actionMessage: "" }); } },
  chooseCancelBackup(this: any, event: any) { if (!this.data.actionBusy) this.setData({ cancelBackupId: String(event.currentTarget.dataset.id || "") }); },
  async cancelCurrentPlan(this: any) {
    const plan = this.data.plan as ReturnType<typeof mapPlan> | null;
    if (!plan || plan.status === "worn") return;
    const backup = (this.data.planBackups as ReturnType<typeof mapBackupPlans>).find((item) => item.id === this.data.cancelBackupId);
    const draft = { kind: "cancel_plan", date: this.data.selectedDate, planId: plan.id, revision: plan.revision, backupId: backup?.id ?? "", backupRevision: backup?.revision ?? 0 };
    const command: CancelPrimaryPlanCommand = {
      clientMutationId: planMutations.idFor(draft), targetDate: this.data.selectedDate,
      primary: { planEntryId: plan.id, expectedRevision: plan.revision },
      ...(backup ? { promoteBackup: { planEntryId: backup.id, expectedRevision: backup.revision } } : {}),
    };
    this.setData({ actionBusy: true, actionMessage: "正在取消安排…" });
    try {
      try { await cancelMiniHomePrimaryPlan(command); } catch (error) {
        const recovered = await fetchPlanningSnapshot();
        if (!isPlanCanceledReadback(recovered, this.data.selectedDate, plan.id, backup?.id)) throw error;
      }
      const planning = await this.refreshPlanningReadback();
      if (!isPlanCanceledReadback(planning, this.data.selectedDate, plan.id, backup?.id)) throw new Error("readback_missing");
      planMutations.confirm(draft);
      setCustomTabHidden(this, false);
      this.setData({ actionBusy: false, actionMessage: "", cancelSheetOpen: false, cancelBackupId: "" });
    } catch (error) { this.setData({ actionBusy: false, actionMessage: homeActionErrorMessage(error) }); }
  },
  async markCurrentPlanWorn(this: any) { await this.setCurrentPlanWornState(true); },
  async undoCurrentPlanWorn(this: any) { await this.setCurrentPlanWornState(false); },
  async setCurrentPlanWornState(this: any, worn: boolean) {
    const plan = this.data.plan as ReturnType<typeof mapPlan> | null;
    if (!plan || (worn && plan.availability === "blocked")) return;
    const draft = { kind: worn ? "mark_worn" : "undo_worn", planId: plan.id, revision: plan.revision, date: this.data.selectedDate };
    const clientMutationId = planMutations.idFor(draft);
    this.setData({ actionBusy: true, planActionHint: worn ? "正在确认穿着…" : "正在撤销穿着记录…" });
    try {
      try {
        if (worn) await markMiniHomePlanWorn(plan.id, plan.revision, clientMutationId, `${this.data.selectedDate}T12:00:00.000Z`);
        else await undoMiniHomePlanWorn(plan.id, plan.revision, clientMutationId);
      } catch (error) {
        const recovered = await fetchPlanningSnapshot();
        if (!hasWornStateReadback(recovered, plan.id, worn)) throw error;
      }
      const planning = await this.refreshPlanningReadback();
      if (!hasWornStateReadback(planning, plan.id, worn)) throw new Error("readback_missing");
      planMutations.confirm(draft);
      this.setData({ actionBusy: false, planActionHint: "" });
    } catch (error) { this.setData({ actionBusy: false, planActionHint: homeActionErrorMessage(error) }); }
  },
  async refreshPlanningReadback(this: any) {
    const planning = await fetchPlanningSnapshot();
    this.planning = planning;
    this.setData({
      plan: mapPlan(findPlan(planning, this.data.selectedDate), this.data.garments),
      planBackups: mapBackupPlans(planning, this.data.selectedDate, this.data.garments),
      travelDates: buildFarTravelDates(planning, this.data.dateItems),
    });
    return planning;
  },

  openLocationSheet(this: any) {
    setCustomTabHidden(this, true);
    this.setData({ locationSheetOpen: true, locationMessage: "", locationNeedsSettings: false });
  },
  closeLocationSheet(this: any) { if (!this.data.locationBusy) { setCustomTabHidden(this, false); this.setData({ locationSheetOpen: false }); } },
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
      const denied = isLocationPermissionDenied(error);
      this.setData({
        locationBusy: false,
        locationMessage: denied
          ? "位置权限未允许，你仍可搜索城市；如需使用当前位置，请前往微信设置。"
          : "暂时无法获取位置，请稍后重试或搜索城市。",
        locationNeedsSettings: denied,
      });
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
      setCustomTabHidden(this, false);
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
      setCustomTabHidden(this, false);
      this.setData({ locationBusy: false, locationSheetOpen: false, locationSnapshot: next, locationLabel: profileLocationLabel(next) });
      this.loadSelectedDate(this.data.selectedDate, this.data.selectedDate === this.data.today);
    } catch (error) {
      this.setData({ locationBusy: false, locationMessage: messageOf(error, "恢复常驻城市失败") });
    }
  },

  resumeWeatherCanvas(this: any) {
    this.weatherCanvasRuntime?.setForeground?.(true);
  },
  pauseWeatherCanvas(this: any) { this.weatherCanvasRuntime?.setForeground?.(false); },
  async syncWeatherCanvas(this: any, overview: WeatherOverview) {
    const evidence = overview.weatherEvidence;
    const code = evidence.weatherCode ?? "998";
    const stale = overview.endpointFreshness.some((entry) => entry.freshness === "stale");
    const forecast = overview.availabilityReason === "available" && overview.contextMode === "forecast";
    if (!forecast || stale) { this.destroyWeatherCanvas(true); return; }
    const generation = ++this.canvasGeneration;
    this.weatherCanvasRuntime?.destroy?.();
    this.canvasObserver?.disconnect?.();
    this.weatherCanvasRuntime = null;
    this.setData({ canvasVisible: true, canvasStaticFallback: false }, async () => {
      try {
        const runtime = await createMiniWeatherCanvasRuntime({
          page: this, code, stale, forecast, reducedMotion: prefersReducedMotion(),
          onFailure: () => { if (generation === this.canvasGeneration) this.destroyWeatherCanvas(true); },
        });
        if (generation !== this.canvasGeneration) { runtime.destroy(); return; }
        this.weatherCanvasRuntime = runtime;
        runtime.setForeground(this.canvasForeground !== false);
        this.canvasObserver = this.createIntersectionObserver({ thresholds: [0, .01] })
          .relativeToViewport()
          .observe(".weather-card--today", (result: any) => runtime.setVisible(Number(result?.intersectionRatio ?? 0) > 0));
      } catch {
        if (generation === this.canvasGeneration) this.destroyWeatherCanvas(true);
      }
    });
  },
  destroyWeatherCanvas(this: any, fallback = false) {
    this.canvasGeneration = (this.canvasGeneration ?? 0) + 1;
    this.weatherCanvasRuntime?.destroy?.();
    this.canvasObserver?.disconnect?.();
    this.weatherCanvasRuntime = null;
    this.canvasObserver = null;
    if (fallback) this.setData({ canvasVisible: false, canvasStaticFallback: true });
  },
});

function mapWeather(value: WeatherOverview, label: string, today: boolean): WeatherCard {
  if (value.availabilityReason !== "available") return unavailableWeather(label, value.contextMode === "locationless" ? "未设置城市" : "天气暂时不可用");
  const evidence = value.weatherEvidence;
  const temperature = today && evidence.currentTemperatureC !== undefined
    ? `${Math.round(evidence.currentTemperatureC)}°`
    : evidence.temperatureMinC !== undefined && evidence.temperatureMaxC !== undefined
      ? `${Math.round(evidence.temperatureMaxC)}°/${Math.round(evidence.temperatureMinC)}°`
      : "--°";
  const stale = value.endpointFreshness.some((entry) => entry.freshness === "stale");
  const baseMeta = today
    ? [evidence.currentFeelsLikeC !== undefined ? `体感 ${Math.round(evidence.currentFeelsLikeC)}°` : "", evidence.windLevel !== undefined ? `${evidence.windLevel} 级风` : ""].filter(Boolean).join(" · ")
    : evidence.temperatureMinC !== undefined ? `最低 ${Math.round(evidence.temperatureMinC)}° · 日间预报` : "日间预报";
  return {
    status: "ready", label, temperature, high: evidence.temperatureMaxC !== undefined ? `最高 ${Math.round(evidence.temperatureMaxC)}°` : "", highCompact: evidence.temperatureMaxC !== undefined ? `高 ${Math.round(evidence.temperatureMaxC)}°` : "", summary: evidence.summary,
    meta: baseMeta,
    stale,
    code: (today ? evidence.weatherCode : evidence.dayWeatherCode) ?? "998",
  };
}

function latestWeatherUpdate(value: WeatherOverview): string {
  return value.endpointFreshness.map((entry) => entry.providerUpdatedAt).sort().at(-1) ?? value.weatherEvidence.weatherUpdatedAt;
}

function formatWeatherTime(value: string): string {
  try { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)); }
  catch { return ""; }
}

function weatherAttributionLabel(value: WeatherOverview): string {
  if (!value.attribution) return "";
  const updatedAt = latestWeatherUpdate(value);
  const stale = value.endpointFreshness.some((entry) => entry.freshness === "stale");
  return `${value.attribution.label}${updatedAt ? ` · ${stale ? "缓存" : "更新"} ${formatWeatherTime(updatedAt)}` : ""}`;
}

function loadingWeather(label: string): WeatherCard { return { status: "loading", label, temperature: "--°", high: "", highCompact: "", summary: "正在读取", meta: "", stale: false, code: "998" }; }
function errorWeather(label: string): WeatherCard { return { status: "error", label, temperature: "--°", high: "", highCompact: "", summary: "天气读取失败", meta: "点击重试", stale: false, code: "998" }; }
function unavailableWeather(label: string, summary: string): WeatherCard { return { status: "unavailable", label, temperature: "--°", high: "", highCompact: "", summary, meta: "使用通用推荐", stale: false, code: "998" }; }

function mapRecommendationCards(item: RecommendationDisplayItemV3, garments: MiniGarment[]): HomeRecommendationCard[] {
  const byId = new Map(garments.map((garment) => [garment.id, garment]));
  return item.recommendations.map((candidate) => ({
    recommendationId: item.recommendationId,
    revision: item.recommendationRevision,
    candidateId: candidate.candidateId,
    objective: objectiveLabel(candidate.objective),
    title: `${objectiveLabel(candidate.objective)}搭配`,
    reason: recommendationReasonLabel(candidate.reasonCodes[0], item.contextMode),
    risk: recommendationRiskLabel(candidate.riskCodes[0], item.contextMode),
    garments: candidate.garmentIds.map((id) => byId.get(id)).filter((garment): garment is MiniGarment => Boolean(garment)).map((garment) => ({ id: garment.id, legacyItemId: garment.legacyItemId, name: garment.name, imageUrl: garment.imageUrl, category: garment.category })),
    garmentIds: candidate.garmentIds.slice(),
    blocked: candidate.riskCodes.some((code) => String(code).includes("blocked") || String(code).includes("severe")),
  }));
}

function cardWithGarmentIds(card: HomeRecommendationCard, garmentIds: string[], garments: MiniGarment[]): HomeRecommendationCard {
  const byId = new Map(garments.map((garment) => [garment.id, garment]));
  return {
    ...card,
    garmentIds: garmentIds.slice(),
    garments: garmentIds
      .map((id) => byId.get(id))
      .filter((garment): garment is MiniGarment => Boolean(garment))
      .map((garment) => ({ id: garment.id, legacyItemId: garment.legacyItemId, name: garment.name, imageUrl: garment.imageUrl, category: garment.category })),
  };
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
    revision: plan.revision,
    status: plan.status,
    availability: plan.availability,
    title: plan.status === "worn" ? "今天已穿" : "当日穿搭",
    risk: plan.availability === "blocked" ? "部分衣物已不可用，请先调整穿搭。" : plan.availability === "historical" ? "当前显示历史快照。" : "",
    garments: ids.slice(0, 3).map((id) => ({ id, name: byId.get(id)?.name ?? "已删除衣物", imageUrl: byId.get(id)?.imageUrl ?? "" })),
  };
}

function mapBackupPlans(planning: PlanningSnapshot | null, date: string, garments: MiniGarment[]) {
  return (planning?.outfitPlanEntries ?? [])
    .filter((entry) => entry.date === date && entry.role === "backup" && entry.status !== "worn")
    .map((entry) => ({ ...mapPlan(entry, garments)!, id: entry.id, revision: entry.revision }));
}

function prefersReducedMotion(): boolean {
  try {
    const info = (wx as any).getSystemInfoSync?.() ?? {};
    return info.reduceMotionEnabled === true || info.isReduceMotionEnabled === true;
  } catch { return false; }
}

function profileLocationLabel(snapshot: MiniHomeLocationSnapshot | null): string {
  const temporary = snapshot?.override.override;
  if (temporary) return buildHomeLocationLabel({ displayName: temporary.location.displayName, source: "temporary_override" });
  const home = snapshot?.profile.homeCity;
  return home ? buildHomeLocationLabel({ displayName: home.displayName, source: "home_city" }) : "未设置城市";
}

function objectiveLabel(value: string): string { return value === "fresh" ? "变化" : value === "comfort" ? "舒适" : "稳妥"; }
function recommendationHeading(date: string, today: string, tomorrow: string): string {
  if (date === today) return "今天";
  if (date === tomorrow) return "明天";
  return date.slice(5).replace("-", "/");
}
function recommendationActionLabel(date: string, today: string, tomorrow: string): string {
  if (date === today) return "设为今日穿搭";
  if (date === tomorrow) return "设为明日穿搭";
  return `安排到 ${date.slice(5).replace("-", "/")}`;
}
function recommendationSubtitle(mode: string): string {
  if (mode === "locationless") return "通用建议 · 横向滑动";
  if (mode === "weather_fallback") return "通用建议 · 天气暂不可用";
  return "天气增强推荐 · 横向滑动";
}
function messageOf(error: unknown, fallback: string): string { return error instanceof Error && error.message ? error.message : fallback; }
function isLocationPermissionDenied(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === "object" && "errMsg" in error ? String((error as { errMsg?: unknown }).errMsg ?? "") : "";
  return /deny|denied|auth|permission/i.test(message);
}

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
