import {
  cancelOutfitWornOnDate,
  createOutfitPlanEntry,
  deleteWorkspaceEntity,
  fetchPlanningSnapshot,
  getWorkspaceReadState,
  markOutfitWornOnDate,
  updateOutfitPlanEntry,
  type MiniCalendarPlan,
  type MiniCalendarPlanType,
  type MiniOutfit,
  type MiniOutfitPlanEntry,
} from "../../../services/workspace";
import { getCapsuleGeometry } from "../../../utils/capsule-layout";
import { getRuntimeSessionScope } from "../../../stores/session";
import {
  getDisplayOutfitId,
  getOutfitPlanDateRelation,
  hasDuplicatePlannedOutfit,
  resolvePrimaryOutfitPlanEntry,
  type OutfitPlanSelectionMode,
} from "../../../utils/outfit-plan-state";
import { formatDateWithWeek, localDateKey, parseDateKey, ymd } from "../../../utils/calendar";
import { selectCustomTab, setCustomTabHidden } from "../../../utils/custom-tab-bar";
import {
  buildOutfitPlanDayCard,
  toPlanToneViews,
  type OutfitPlanDayCardView,
} from "../../../utils/outfit-plan-day";
import {
  getRuntimeRefreshSnapshot,
  markRuntimeDomainDirty,
  runRuntimeDomainRefresh,
} from "../../../utils/runtime-refresh";

type DatasetEvent = { currentTarget: { dataset: Record<string, unknown> } };
type TouchLikeEvent = { touches?: Array<{ clientX: number }>; changedTouches?: Array<{ clientX: number }> };
type WeekDayView = {
  key: string;
  week: string;
  day: string;
  active: boolean;
  thumbnails: string[];
  plans: ReturnType<typeof toPlanToneViews>;
};

const PLAN_OPTIONS: Array<{ type: MiniCalendarPlanType; label: string; desc: string }> = [
  { type: "travel", label: "旅行", desc: "多天出行，可按日期安排穿搭并生成打包清单" },
  { type: "business", label: "出差", desc: "商务出行，可按日期安排偏正式穿搭" },
  { type: "custom", label: "自定义", desc: "自定义日期范围，用于活动、通勤周期及其他安排" },
];
Page({
  data: {
    initialLoading: false,
    refreshing: false,
    savingEntry: false,
    outfits: [] as MiniOutfit[],
    filteredOutfits: [] as MiniOutfit[],
    calendarPlans: [] as MiniCalendarPlan[],
    outfitPlanEntries: [] as MiniOutfitPlanEntry[],
    error: "",
    emptyTitle: "",
    emptyAction: "",
    filters: ["全部", "最近穿过", "未穿过", "通勤", "旅行", "春秋"],
    activeFilter: "全部",
    weekStart: startOfWeek(localDateKey()),
    selectedDate: localDateKey(),
    weekRangeLabel: "",
    selectedDateLabel: "",
    selectedEmptyTitle: "",
    selectedEmptyCopy: "",
    selectedEmptyAction: "安排穿搭",
    weekDays: [] as WeekDayView[],
    selectedDayCard: null as OutfitPlanDayCardView | null,
    outfitCountLabel: "0 套",
    createSheetOpen: false,
    addPlanSheetOpen: false,
    selectSheetOpen: false,
    selectionMode: "primary" as OutfitPlanSelectionMode,
    selectionTitle: "",
    selectionDescription: "",
    outfitSearch: "",
    planOptions: PLAN_OPTIONS,
    titleTopRpx: 0,
    touchStartX: 0,
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "套装" });
    this.setData({ titleTopRpx: getTitleTopRpx() });
    selectCustomTab(this, 1);
    this.rebuildWeek();
  },

  onShow() {
    this.resetForRuntimeSession();
    selectCustomTab(this, 1);
    void this.loadOutfits();
  },

  onHide() {
    setCustomTabHidden(this, false);
  },

  onReady() {
    selectCustomTab(this, 1);
  },

  resetForRuntimeSession(this: any) {
    const scope = getRuntimeSessionScope();
    if (this.runtimeSessionScope && this.runtimeSessionScope !== scope) {
      this.hasLoadedPlanning = false;
      this.snapshotSignature = "";
      this.setData({ outfits: [], filteredOutfits: [], calendarPlans: [], outfitPlanEntries: [], outfitCountLabel: "0 套" });
      this.rebuildWeek();
    }
    this.runtimeSessionScope = scope;
  },

  async loadOutfits(options: { force?: boolean } = {}): Promise<boolean> {
    const state = getWorkspaceReadState();
    if (state !== "ready") {
      (this as any).hasLoadedPlanning = false;
      this.setData({
        initialLoading: false,
        refreshing: false,
        outfits: [],
        filteredOutfits: [],
        error: "",
        emptyTitle: state === "logged_out" ? "登录后同步套装" : "请先配置后端 API 域名",
        emptyAction: state === "logged_out" ? "去登录" : "去设置",
      });
      this.rebuildWeek();
      return false;
    }

    const hasData = Boolean((this as any).hasLoadedPlanning);
    this.setData({ initialLoading: !hasData, refreshing: hasData, error: "" });
    try {
      const result = await runRuntimeDomainRefresh("planning", fetchPlanningSnapshot, {
        force: options.force,
        hasData,
      });
      if (result.status === "skipped") {
        this.setData({ initialLoading: false, refreshing: false });
        return true;
      }
      if (!result.accepted) {
        this.setData({ initialLoading: false, refreshing: false });
        return false;
      }
      if (getRuntimeRefreshSnapshot("planning").dirty) return this.loadOutfits({ force: true });
      const snapshot = result.value;
      (this as any).hasLoadedPlanning = true;
      const signature = planningSnapshotSignature(snapshot);
      if ((this as any).snapshotSignature === signature) {
        this.setData({ initialLoading: false, refreshing: false });
        return true;
      }
      (this as any).snapshotSignature = signature;
      this.setData({
        outfits: snapshot.outfits,
        filteredOutfits: snapshot.outfits,
        calendarPlans: snapshot.calendarPlans,
        outfitPlanEntries: snapshot.outfitPlanEntries,
        initialLoading: false,
        refreshing: false,
        outfitCountLabel: `${snapshot.outfits.length} 套`,
      });
      this.rebuildWeek();
      return true;
    } catch (error) {
      markRuntimeDomainDirty("planning");
      this.setData({ initialLoading: false, refreshing: false, error: error instanceof Error ? error.message : "读取套装失败" });
      if (hasData) wx.showToast({ title: "套装刷新失败，已保留当前内容", icon: "none" });
      return false;
    }
  },

  openCalendar() {
    wx.navigateTo({ url: "/pages/outfits/calendar/index" });
  },

  openAddPlanSheet() {
    setCustomTabHidden(this, true);
    this.setData({ addPlanSheetOpen: true });
  },

  closeAddPlanSheet() {
    setCustomTabHidden(this, false);
    this.setData({ addPlanSheetOpen: false });
  },

  choosePlanType(event: DatasetEvent) {
    const type = String(event.currentTarget.dataset.type || "custom");
    setCustomTabHidden(this, false);
    this.setData({ addPlanSheetOpen: false });
    wx.navigateTo({ url: `/pages/trips/edit/index?type=${encodeURIComponent(type)}&date=${encodeURIComponent(this.data.selectedDate)}` });
  },

  handleEmptyAction() {
    const state = getWorkspaceReadState();
    if (state === "logged_out") {
      wx.redirectTo({ url: "/pages/login/index" });
      return;
    }
    if (state === "api_not_configured") {
      wx.switchTab({ url: "/pages/settings/index/index" });
      return;
    }
    wx.navigateTo({ url: "/pages/outfits/compose/index" });
  },

  openCompose() {
    wx.navigateTo({ url: "/pages/outfits/compose/index" });
  },

  selectWeekDate(event: DatasetEvent) {
    const date = String(event.currentTarget.dataset.date || "");
    if (!date) return;
    this.setData({ selectedDate: date });
    this.rebuildWeek();
  },

  shiftWeek(event: DatasetEvent) {
    this.shiftWeekBy(event.currentTarget.dataset.delta === "next" ? 1 : -1);
  },

  onWeekTouchStart(event: TouchLikeEvent) {
    this.setData({ touchStartX: event.touches?.[0]?.clientX ?? 0 });
  },

  onWeekTouchEnd(event: TouchLikeEvent) {
    const startX = this.data.touchStartX;
    const endX = event.changedTouches?.[0]?.clientX ?? startX;
    const delta = endX - startX;
    if (Math.abs(delta) < 48) return;
    this.shiftWeekBy(delta < 0 ? 1 : -1);
  },

  shiftWeekBy(delta: -1 | 1) {
    const currentIndex = Math.max(0, Math.min(6, daysBetween(this.data.weekStart, this.data.selectedDate)));
    const nextStart = addDays(this.data.weekStart, delta * 7);
    this.setData({ weekStart: nextStart, selectedDate: addDays(nextStart, currentIndex) });
    this.rebuildWeek();
  },

  openSelectedDateSelector() {
    const relation = getOutfitPlanDateRelation(this.data.selectedDate, localDateKey());
    const hasBrokenPrimary = Boolean(this.entryForDate(this.data.selectedDate) && !this.data.selectedDayCard?.primary);
    this.openOutfitSelector(relation === "past" ? "worn" : hasBrokenPrimary ? "replace" : "primary");
  },

  openBackupSelector() {
    if (getOutfitPlanDateRelation(this.data.selectedDate, localDateKey()) === "past") return;
    this.openOutfitSelector("backup");
  },

  openChangeSelector() {
    if (getOutfitPlanDateRelation(this.data.selectedDate, localDateKey()) === "past") return;
    this.openOutfitSelector("replace");
  },

  openOutfitSelector(mode: OutfitPlanSelectionMode) {
    const relation = getOutfitPlanDateRelation(this.data.selectedDate, localDateKey());
    const dateLabel = formatDateWithWeek(this.data.selectedDate);
    const title = mode === "worn"
      ? `补记 ${dateLabel} 实际穿着`
      : mode === "backup"
        ? `为 ${dateLabel} 添加备选穿搭`
        : mode === "replace"
          ? `更改 ${dateLabel} 主计划`
          : `为 ${dateLabel} 安排主穿搭`;
    const description = relation === "past"
      ? "选择后会同步套装及其中衣物的穿着记录。"
      : mode === "backup"
        ? "备选穿搭不会计入穿着次数。"
        : "选择的套装会作为当天主计划，不计入穿着次数。";
    setCustomTabHidden(this, true);
    this.setData({ selectSheetOpen: true, selectionMode: mode, selectionTitle: title, selectionDescription: description, outfitSearch: "" });
    this.filterOutfits("");
  },

  closeOutfitSelector() {
    if (this.data.savingEntry) return;
    setCustomTabHidden(this, false);
    this.setData({ selectSheetOpen: false, outfitSearch: "" });
  },

  onSearchOutfit(event: WechatMiniprogram.InputEvent) {
    const value = event.detail.value || "";
    this.setData({ outfitSearch: value });
    this.filterOutfits(value);
  },

  filterOutfits(keyword: string) {
    const q = keyword.trim().toLowerCase();
    this.setData({
      filteredOutfits: q
        ? this.data.outfits.filter((outfit) => outfit.name.toLowerCase().includes(q) || outfit.sceneText.toLowerCase().includes(q))
        : this.data.outfits,
    });
  },

  async chooseOutfit(event: DatasetEvent) {
    const outfitId = String(event.currentTarget.dataset.id || "");
    const outfit = this.data.outfits.find((item) => item.id === outfitId);
    if (!outfit || this.data.savingEntry) return;

    const mode = this.data.selectionMode;
    const dateKey = this.data.selectedDate;
    const primaryEntry = this.entryForDate(dateKey);
    if (hasDuplicatePlannedOutfit(this.data.outfitPlanEntries, dateKey, outfitId, mode, primaryEntry)) {
      wx.showToast({ title: "这天已经安排过这套", icon: "none" });
      return;
    }
    if (mode === "replace" && !primaryEntry) {
      wx.showToast({ title: "当前主计划已变化，请刷新后重试", icon: "none" });
      return;
    }

    this.setData({ savingEntry: true });
    try {
      if (mode === "worn") {
        await markOutfitWornOnDate(outfit.id, outfit.revision, dateKey);
      } else if (mode === "replace" && primaryEntry) {
        await updateOutfitPlanEntry({
          id: primaryEntry.id,
          expectedRevision: primaryEntry.revision,
          currentPayload: primaryEntry.rawPayload,
          outfitId: outfit.id,
          title: outfit.name,
          makePrimary: true,
          role: "primary",
        });
      } else {
        const isPrimary = mode === "primary";
        await createOutfitPlanEntry({
          date: dateKey,
          outfitId: outfit.id,
          calendarPlanId: this.planForDate(dateKey)?.id,
          makePrimary: isPrimary,
          role: isPrimary ? "primary" : "backup",
          title: outfit.name,
        });
      }
      markRuntimeDomainDirty("planning");
      markRuntimeDomainDirty("outfits");
      if (!await this.loadOutfits({ force: true })) throw new Error("已保存，但重新读取失败，请稍后重试");
      setCustomTabHidden(this, false);
      this.setData({ selectSheetOpen: false, outfitSearch: "" });
      wx.showToast({ title: mode === "worn" ? "已补记穿搭" : mode === "backup" ? "已添加备选穿搭" : mode === "replace" ? "已更改主计划" : "已安排主穿搭", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "保存穿搭失败", icon: "none" });
    } finally {
      this.setData({ savingEntry: false });
    }
  },

  async handleDayCardAction(event: { detail?: { action?: string } }) {
    const action = event.detail?.action;
    if (!action || this.data.savingEntry) return;
    if (action === "view_plan") {
      const planId = String((event.detail as { planId?: string } | undefined)?.planId || "");
      if (planId) this.openPlanDetail({ detail: { id: planId }, currentTarget: { dataset: {} } });
      return;
    }
    if (action === "empty_primary") {
      this.openSelectedDateSelector();
      return;
    }
    if (action === "change") {
      this.openChangeSelector();
      return;
    }
    if (action === "backup") {
      this.openBackupSelector();
      return;
    }
    const selected = this.data.selectedDayCard?.primary;
    if (!selected) return;
    const outfit = this.data.outfits.find((item) => item.id === selected.outfitId);
    if (!outfit) return;
    if (action === "delete_worn") {
      const confirmed = await confirmAction("删除这天的已穿记录？", "删除后只会移除当天穿着记录，套装本身会保留。");
      if (!confirmed) return;
    }
    this.setData({ savingEntry: true });
    try {
      if (action === "delete_worn") {
        await cancelOutfitWornOnDate(outfit.id, outfit.revision, this.data.selectedDate);
      } else {
        await markOutfitWornOnDate(outfit.id, outfit.revision, this.data.selectedDate);
      }
      markRuntimeDomainDirty("planning");
      markRuntimeDomainDirty("outfits");
      if (!await this.loadOutfits({ force: true })) throw new Error("已保存，但重新读取失败，请稍后重试");
      wx.showToast({ title: action === "delete_worn" ? "已删除已穿记录" : "已记录穿着", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "更新穿着失败", icon: "none" });
    } finally {
      this.setData({ savingEntry: false });
    }
  },

  async handleBackupDelete(event: { detail?: { id?: string } }) {
    const entryId = event.detail?.id;
    if (!entryId || this.data.savingEntry) return;
    const entry = this.data.outfitPlanEntries.find((item) => item.id === entryId);
    if (!entry) return;
    const confirmed = await confirmAction("删除这条备选穿搭？", "只会移除当天的备选计划，不会删除套装。");
    if (!confirmed) return;
    this.setData({ savingEntry: true });
    try {
      await deleteWorkspaceEntity("outfit-plans", entry.id, entry.revision);
      markRuntimeDomainDirty("planning");
      if (!await this.loadOutfits({ force: true })) throw new Error("已删除，但重新读取失败，请稍后重试");
      wx.showToast({ title: "已删除备选", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "删除备选失败", icon: "none" });
    } finally {
      this.setData({ savingEntry: false });
    }
  },

  openCreateSheet() {
    this.setData({ createSheetOpen: true });
  },

  closeCreateSheet() {
    this.setData({ createSheetOpen: false });
  },

  openDetail(event: DatasetEvent & { detail?: { id?: string } }) {
    const id = String(event.detail?.id || event.currentTarget.dataset.id || "");
    if (id) wx.navigateTo({ url: `/pages/outfits/detail/index?id=${encodeURIComponent(id)}` });
  },

  openPlanDetail(event: { detail?: { id?: string }; currentTarget?: { dataset?: Record<string, unknown> } }) {
    const id = String(event.detail?.id || event.currentTarget?.dataset?.id || "");
    if (id) wx.navigateTo({ url: `/pages/trips/detail/index?id=${encodeURIComponent(id)}` });
  },

  entryForDate(date: string): MiniOutfitPlanEntry | undefined {
    return resolvePrimaryOutfitPlanEntry(this.entriesForDate(date));
  },

  entriesForDate(date: string): MiniOutfitPlanEntry[] {
    return this.data.outfitPlanEntries.filter((entry) => entry.date === date && entry.status !== "skipped");
  },

  planForDate(date: string): MiniCalendarPlan | undefined {
    return this.plansForDate(date)[0];
  },

  plansForDate(date: string): MiniCalendarPlan[] {
    return this.data.calendarPlans
      .filter((plan) => date >= plan.startDate && date <= plan.endDate)
      .sort((a, b) => a.startDate === b.startDate ? b.updatedAt.localeCompare(a.updatedAt) : a.startDate.localeCompare(b.startDate));
  },

  rebuildWeek() {
    const todayKey = localDateKey();
    const weekDays = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(this.data.weekStart, index);
      const entry = this.entryForDate(date);
      const outfit = entry ? this.data.outfits.find((item) => item.id === getDisplayOutfitId(entry)) : undefined;
      const plans = this.plansForDate(date);
      return {
        key: date,
        week: ["一", "二", "三", "四", "五", "六", "日"][index],
        day: String(parseDateKey(date).day),
        active: date === this.data.selectedDate,
        thumbnails: outfit?.itemImages?.length ? outfit.itemImages : outfit?.imageUrl ? [outfit.imageUrl] : [],
        plans: toPlanToneViews(plans),
      };
    });
    const selectedEntries = this.entriesForDate(this.data.selectedDate);
    const relation = getOutfitPlanDateRelation(this.data.selectedDate, todayKey);
    const selectedDayCard = buildOutfitPlanDayCard({
      dateKey: this.data.selectedDate,
      todayKey,
      plans: this.plansForDate(this.data.selectedDate),
      entries: selectedEntries,
      outfits: this.data.outfits,
    });
    const weekEnd = addDays(this.data.weekStart, 6);
    this.setData({
      weekDays,
      weekRangeLabel: formatWeekRange(this.data.weekStart, weekEnd),
      selectedDateLabel: formatDateWithWeek(this.data.selectedDate),
      selectedDayCard,
      selectedEmptyTitle: selectedDayCard.empty?.title || "",
      selectedEmptyCopy: selectedDayCard.empty?.copy || "",
      selectedEmptyAction: selectedDayCard.empty?.actionLabel || (relation === "past" ? "补记已穿" : "安排穿搭"),
    });
  },
});

function startOfWeek(dateKey: string): string {
  const { year, month, day } = parseDateKey(dateKey);
  const date = new Date(year, month - 1, day);
  const offset = (date.getDay() + 6) % 7;
  return toDateKey(new Date(year, month - 1, day - offset));
}

function addDays(dateKey: string, delta: number): string {
  const { year, month, day } = parseDateKey(dateKey);
  return toDateKey(new Date(year, month - 1, day + delta));
}

function daysBetween(start: string, end: string): number {
  const a = parseDateKey(start);
  const b = parseDateKey(end);
  return Math.round((new Date(b.year, b.month - 1, b.day).getTime() - new Date(a.year, a.month - 1, a.day).getTime()) / 86400000);
}

function formatWeekRange(start: string, end: string): string {
  const currentYear = new Date().getFullYear();
  const startYear = parseDateKey(start).year;
  const endYear = parseDateKey(end).year;
  const includeYear = startYear !== currentYear || endYear !== currentYear;
  return `${dateRangeText(start, includeYear)} - ${dateRangeText(end, includeYear)}`;
}

function dateRangeText(dateKey: string, includeYear: boolean): string {
  const { year, month, day } = parseDateKey(dateKey);
  return includeYear ? `${year}年${month}月${day}日` : `${month}月${day}日`;
}

function toDateKey(date: Date): string {
  return ymd(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function getTitleTopRpx() {
  return getCapsuleGeometry().topRpx;
}

function confirmAction(title: string, content: string): Promise<boolean> {
  return new Promise((resolve) => {
    wx.showModal({ title, content, success: (result) => resolve(result.confirm === true), fail: () => resolve(false) });
  });
}

function planningSnapshotSignature(snapshot: Awaited<ReturnType<typeof fetchPlanningSnapshot>>): string {
  return JSON.stringify({
    outfits: snapshot.outfits.map((item) => [item.id, item.revision, item.updatedAt, item.imageUrl, item.itemImages]),
    plans: snapshot.calendarPlans.map((item) => [item.id, item.revision, item.updatedAt]),
    entries: snapshot.outfitPlanEntries.map((item) => [item.id, item.revision, item.updatedAt, item.outfitId, item.actualOutfitId]),
  });
}
