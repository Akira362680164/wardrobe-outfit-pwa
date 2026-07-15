import {
  cancelOutfitWornOnDate,
  createOutfitPlanEntry,
  deleteWorkspaceEntity,
  fetchPlanningSnapshot,
  getWorkspaceReadState,
  markOutfitWornOnDate,
  markOutfitPlanWorn,
  cancelOutfitPlanWorn,
  updateOutfitPlanEntry,
  type MiniCalendarPlan,
  type MiniCalendarPlanType,
  type MiniOutfit,
  type MiniOutfitPlanEntry,
} from "../../../services/workspace";
import {
  getOutfitPlanDateRelation,
  hasDuplicatePlannedOutfit,
  resolvePrimaryOutfitPlanEntry,
  getDisplayOutfitId,
  type OutfitPlanSelectionMode,
} from "../../../utils/outfit-plan-state";
import {
  formatDateLabel,
  formatDateWithWeek,
  getMonthGrid,
  getMonthRange,
  localDateKey,
  monthTitle,
  parseDateKey,
  rangeOverlaps,
  shiftMonthKey,
} from "../../../utils/calendar";
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

type CalendarDayView = {
  key: string;
  label: string;
  muted: boolean;
  active: boolean;
  today: boolean;
  thumbnails: string[];
  plans: ReturnType<typeof toPlanToneViews>;
};
type CalendarWeekView = {
  key: string;
  days: CalendarDayView[];
  containsSelectedDate: boolean;
};
type DatasetEvent = { currentTarget: { dataset: Record<string, unknown> } };
type TouchLikeEvent = { touches?: Array<{ clientX: number }>; changedTouches?: Array<{ clientX: number }> };

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
const PLAN_OPTIONS: Array<{ type: MiniCalendarPlanType; label: string; desc: string }> = [
  { type: "travel", label: "旅行", desc: "多天出行，可按日期安排穿搭并生成打包清单" },
  { type: "business", label: "出差", desc: "商务出行，可按日期安排偏正式穿搭" },
  { type: "custom", label: "自定义", desc: "自定义日期范围，用于活动、通勤周期及其他安排" },
];
Page({
  data: {
    todayKey: localDateKey(),
    monthKey: localDateKey().slice(0, 7),
    monthTitle: "",
    selectedDate: localDateKey(),
    selectedDateLabel: "",
    weekdays: WEEKDAYS,
    calendarWeeks: [] as CalendarWeekView[],
    initialLoading: false,
    refreshing: false,
    savingEntry: false,
    outfits: [] as MiniOutfit[],
    filteredOutfits: [] as MiniOutfit[],
    calendarPlans: [] as MiniCalendarPlan[],
    outfitPlanEntries: [] as MiniOutfitPlanEntry[],
    selectedDayCard: null as OutfitPlanDayCardView | null,
    monthHasData: false,
    selectedEmptyTitle: "",
    selectedEmptyCopy: "",
    selectedActionLabel: "安排主穿搭",
    statusActionLabel: "",
    outfitSearch: "",
    selectSheetOpen: false,
    selectionMode: "primary" as OutfitPlanSelectionMode,
    selectionTitle: "",
    selectionDescription: "",
    addPlanSheetOpen: false,
    planOptions: PLAN_OPTIONS,
    error: "",
    touchStartX: 0,
  },

  onLoad(query?: { date?: string }) {
    wx.setNavigationBarTitle({ title: "穿搭计划" });
    const selectedDate = query?.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : localDateKey();
    this.setData({ selectedDate, monthKey: selectedDate.slice(0, 7) });
    this.rebuildCalendar();
  },

  onShow() {
    void this.loadPlanning();
  },

  shiftMonth(event: DatasetEvent) {
    this.shiftMonthBy(event.currentTarget.dataset.delta === "next" ? 1 : -1);
  },

  onMonthTouchStart(event: TouchLikeEvent) {
    this.setData({ touchStartX: event.touches?.[0]?.clientX ?? 0 });
  },

  onMonthTouchEnd(event: TouchLikeEvent) {
    const startX = this.data.touchStartX;
    const endX = event.changedTouches?.[0]?.clientX ?? startX;
    const delta = endX - startX;
    if (Math.abs(delta) < 48) return;
    this.shiftMonthBy(delta < 0 ? 1 : -1);
  },

  shiftMonthBy(delta: -1 | 1) {
    const nextMonthKey = shiftMonthKey(this.data.monthKey, delta);
    const selectedDay = parseDateKey(this.data.selectedDate).day;
    const lastDay = parseDateKey(getMonthRange(nextMonthKey).lastDay).day;
    const selectedDate = `${nextMonthKey}-${String(Math.min(selectedDay, lastDay)).padStart(2, "0")}`;
    this.setData({ monthKey: nextMonthKey, selectedDate });
    this.rebuildCalendar();
  },

  selectDate(event: DatasetEvent) {
    const dateKey = String(event.currentTarget.dataset.date || "");
    if (!dateKey) return;
    this.setData({ selectedDate: dateKey, monthKey: dateKey.slice(0, 7) });
    this.rebuildCalendar();
  },

  openAddPlanSheet() {
    this.setData({ addPlanSheetOpen: true });
  },

  closeAddPlanSheet() {
    this.setData({ addPlanSheetOpen: false });
  },

  choosePlanType(event: DatasetEvent) {
    const type = String(event.currentTarget.dataset.type || "custom") as MiniCalendarPlanType;
    this.setData({ addPlanSheetOpen: false });
    wx.navigateTo({ url: `/pages/trips/edit/index?type=${encodeURIComponent(type)}&date=${encodeURIComponent(this.data.selectedDate)}` });
  },

  openSelectedDateSelector() {
    const relation = getOutfitPlanDateRelation(this.data.selectedDate, this.data.todayKey);
    const hasBrokenPrimary = Boolean(this.primaryEntryForDate(this.data.selectedDate) && !this.data.selectedDayCard?.primary);
    this.openOutfitSelector(relation === "past" ? "worn" : hasBrokenPrimary ? "replace" : "primary");
  },

  openBackupSelector() {
    if (getOutfitPlanDateRelation(this.data.selectedDate, this.data.todayKey) === "past") return;
    this.openOutfitSelector("backup");
  },

  openChangeSelector() {
    if (getOutfitPlanDateRelation(this.data.selectedDate, this.data.todayKey) === "past") return;
    this.openOutfitSelector("replace");
  },

  openOutfitSelector(mode: OutfitPlanSelectionMode) {
    const relation = getOutfitPlanDateRelation(this.data.selectedDate, this.data.todayKey);
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
    this.setData({ selectSheetOpen: true, selectionMode: mode, selectionTitle: title, selectionDescription: description, outfitSearch: "" });
    this.filterOutfits("");
  },

  closeOutfitSelector() {
    if (!this.data.savingEntry) this.setData({ selectSheetOpen: false, outfitSearch: "" });
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
    const primaryEntry = this.primaryEntryForDate(dateKey);
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
          calendarPlanId: this.plansForDate(dateKey)[0]?.id,
          makePrimary: isPrimary,
          role: isPrimary ? "primary" : "backup",
          title: outfit.name,
        });
      }
      markRuntimeDomainDirty("planning");
      markRuntimeDomainDirty("outfits");
      if (!await this.loadPlanning({ force: true })) throw new Error("已保存，但重新读取失败，请稍后重试");
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
    const primary = this.data.selectedDayCard?.primary;
    if (!primary) return;
    const outfit = this.data.outfits.find((item) => item.id === primary.outfitId);
    const planEntry = this.data.outfitPlanEntries.find((item) => item.id === primary.entryId);
    if (!outfit && !planEntry) return;
    if (action === "delete_worn" && !await confirmAction("删除这天的已穿记录？", "删除后只会移除当天穿着记录，套装本身会保留。")) return;
    this.setData({ savingEntry: true });
    try {
      if (action === "delete_worn") {
        if (outfit) await cancelOutfitWornOnDate(outfit.id, outfit.revision, this.data.selectedDate); else await cancelOutfitPlanWorn(planEntry!, this.data.selectedDate);
      } else {
        if (outfit) await markOutfitWornOnDate(outfit.id, outfit.revision, this.data.selectedDate); else await markOutfitPlanWorn(planEntry!, this.data.selectedDate);
      }
      markRuntimeDomainDirty("planning");
      markRuntimeDomainDirty("outfits");
      if (!await this.loadPlanning({ force: true })) throw new Error("已保存，但重新读取失败，请稍后重试");
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
    if (!entry || !await confirmAction("删除这条备选穿搭？", "只会移除当天的备选计划，不会删除套装。")) return;
    this.setData({ savingEntry: true });
    try {
      await deleteWorkspaceEntity("outfit-plans", entry.id, entry.revision);
      markRuntimeDomainDirty("planning");
      if (!await this.loadPlanning({ force: true })) throw new Error("已删除，但重新读取失败，请稍后重试");
      wx.showToast({ title: "已删除备选", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "删除备选失败", icon: "none" });
    } finally {
      this.setData({ savingEntry: false });
    }
  },

  openOutfit(event: DatasetEvent) {
    const id = String((event as DatasetEvent & { detail?: { id?: string } }).detail?.id || event.currentTarget.dataset.id || "");
    if (id) wx.navigateTo({ url: `/pages/outfits/detail/index?id=${encodeURIComponent(id)}` });
  },

  openPlanDetail(event: DatasetEvent & { detail?: { id?: string } }) {
    const id = String(event.detail?.id || event.currentTarget.dataset.id || "");
    if (id) wx.navigateTo({ url: `/pages/trips/detail/index?id=${encodeURIComponent(id)}` });
  },

  handleStatusAction() {
    const state = getWorkspaceReadState();
    if (state === "logged_out") {
      wx.redirectTo({ url: "/pages/login/index" });
      return;
    }
    if (state === "api_not_configured") {
      wx.switchTab({ url: "/pages/settings/index/index" });
      return;
    }
    void this.loadPlanning();
  },

  async loadPlanning(options: { force?: boolean } = {}): Promise<boolean> {
    const state = getWorkspaceReadState();
    if (state !== "ready") {
      (this as any).hasLoadedPlanning = false;
      this.setData({
        initialLoading: false,
        refreshing: false,
        outfits: [],
        filteredOutfits: [],
        calendarPlans: [],
        outfitPlanEntries: [],
        error: state === "logged_out" ? "请先登录后查看穿搭计划" : "请先配置后端 API 域名",
        statusActionLabel: state === "logged_out" ? "去登录" : "去设置",
      });
      this.rebuildCalendar();
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
      if (getRuntimeRefreshSnapshot("planning").dirty) return this.loadPlanning({ force: true });
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
      });
      this.rebuildCalendar();
      return true;
    } catch (error) {
      markRuntimeDomainDirty("planning");
      this.setData({ initialLoading: false, refreshing: false, error: error instanceof Error ? error.message : "读取穿搭计划失败", statusActionLabel: "重试" });
      if (hasData) wx.showToast({ title: "计划刷新失败，已保留当前内容", icon: "none" });
      return false;
    }
  },

  rebuildCalendar() {
    const { firstDay, lastDay } = getMonthRange(this.data.monthKey);
    const monthHasData = this.data.outfitPlanEntries.some((entry) => entry.date >= firstDay && entry.date <= lastDay)
      || this.data.calendarPlans.some((plan) => rangeOverlaps(plan.startDate, plan.endDate, firstDay, lastDay));
    const dayViews = getMonthGrid(this.data.monthKey, this.data.todayKey).map((cell) => {
      const entry = this.primaryEntryForDate(cell.dateKey);
      const outfit = entry ? this.data.outfits.find((item) => item.id === getDisplayOutfitId(entry)) : undefined;
      const plans = this.plansForDate(cell.dateKey);
      return {
        key: cell.dateKey,
        label: String(cell.day),
        muted: cell.muted,
        active: cell.dateKey === this.data.selectedDate,
        today: cell.isToday,
        thumbnails: outfit?.itemImages?.length ? outfit.itemImages : outfit?.imageUrl ? [outfit.imageUrl] : [],
        plans: toPlanToneViews(plans),
      };
    });
    const calendarWeeks = chunkIntoWeeks(dayViews).map((days) => ({
      key: days[0]?.key || "",
      days,
      containsSelectedDate: days.some((day) => day.key === this.data.selectedDate),
    }));
    const selectedEntries = this.entriesForDate(this.data.selectedDate);
    const selectedDayCard = buildOutfitPlanDayCard({
      dateKey: this.data.selectedDate,
      todayKey: this.data.todayKey,
      plans: this.plansForDate(this.data.selectedDate),
      entries: selectedEntries,
      outfits: this.data.outfits,
    });
    const relation = getOutfitPlanDateRelation(this.data.selectedDate, this.data.todayKey);
    this.setData({
      monthTitle: monthTitle(this.data.monthKey),
      selectedDateLabel: formatDateLabel(this.data.selectedDate),
      calendarWeeks,
      selectedDayCard,
      monthHasData,
      selectedEmptyTitle: selectedDayCard.empty?.title || "",
      selectedEmptyCopy: selectedDayCard.empty?.copy || "",
      selectedActionLabel: selectedDayCard.empty?.actionLabel || (relation === "past" ? "补记已穿" : "安排穿搭"),
    });
  },

  plansForDate(dateKey: string): MiniCalendarPlan[] {
    return this.data.calendarPlans
      .filter((plan) => dateKey >= plan.startDate && dateKey <= plan.endDate)
      .sort((a, b) => a.startDate === b.startDate ? b.updatedAt.localeCompare(a.updatedAt) : a.startDate.localeCompare(b.startDate));
  },

  entriesForDate(dateKey: string): MiniOutfitPlanEntry[] {
    return this.data.outfitPlanEntries.filter((entry) => entry.date === dateKey && entry.status !== "skipped");
  },

  primaryEntryForDate(dateKey: string): MiniOutfitPlanEntry | undefined {
    return resolvePrimaryOutfitPlanEntry(this.entriesForDate(dateKey));
  },
});

function chunkIntoWeeks(days: CalendarDayView[]): CalendarDayView[][] {
  const weeks: CalendarDayView[][] = [];
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7));
  return weeks;
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
