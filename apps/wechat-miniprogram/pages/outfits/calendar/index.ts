import {
  cancelOutfitWornOnDate,
  createOutfitPlanEntry,
  fetchPlanningSnapshot,
  getWorkspaceReadState,
  markOutfitWornOnDate,
  updateOutfitPlanEntry,
  type MiniCalendarPlan,
  type MiniCalendarPlanTone,
  type MiniCalendarPlanType,
  type MiniOutfit,
  type MiniOutfitPlanEntry,
} from "../../../services/workspace";
import { getCapsuleGeometry } from "../../../utils/capsule-layout";
import {
  getBackupOutfitPlanEntries,
  getDisplayOutfitId,
  getOutfitPlanDateRelation,
  hasDuplicatePlannedOutfit,
  resolvePrimaryOutfitPlanEntry,
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

type DayDot = { id: string; className: string; title: string };
type CalendarDayView = {
  key: string;
  label: string;
  muted: boolean;
  active: boolean;
  today: boolean;
  entryLabel: string;
  dots: DayDot[];
};
type CalendarWeekView = {
  key: string;
  days: CalendarDayView[];
  containsSelectedDate: boolean;
};
type SelectedEntryView = {
  id: string;
  outfitId: string;
  name: string;
  imageUrl: string;
  itemImages: string[];
  meta: string;
  statusLabel: string;
  statusClass: string;
  primaryAction: "mark_worn" | "cancel_worn" | "";
  primaryActionLabel: string;
  canChangePlan: boolean;
  canAddBackup: boolean;
};
type BackupEntryView = {
  id: string;
  outfitId: string;
  name: string;
  imageUrl: string;
  itemImages: string[];
};
type SelectedPlanView = MiniCalendarPlan & {
  toneClass: string;
  dateText: string;
};
type DatasetEvent = { currentTarget: { dataset: Record<string, unknown> } };
type TouchLikeEvent = { touches?: Array<{ clientX: number }>; changedTouches?: Array<{ clientX: number }> };

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
const PLAN_OPTIONS: Array<{ type: MiniCalendarPlanType; label: string; desc: string }> = [
  { type: "travel", label: "旅行", desc: "多天出行，可按日期安排穿搭并生成打包清单" },
  { type: "business", label: "出差", desc: "商务出行，可按日期安排偏正式穿搭" },
  { type: "custom", label: "自定义", desc: "自定义日期范围，用于活动、通勤周期及其他安排" },
];
const TONE_CLASS: Record<MiniCalendarPlanTone, string> = {
  denim: "tone-denim",
  moss: "tone-moss",
  clay: "tone-clay",
  amber: "tone-amber",
  rose: "tone-rose",
  purple: "tone-purple",
  slate: "tone-slate",
};

Page({
  data: {
    titleTopRpx: 0,
    todayKey: localDateKey(),
    monthKey: localDateKey().slice(0, 7),
    monthTitle: "",
    selectedDate: localDateKey(),
    selectedDateLabel: "",
    weekdays: WEEKDAYS,
    calendarWeeks: [] as CalendarWeekView[],
    loading: false,
    savingEntry: false,
    outfits: [] as MiniOutfit[],
    filteredOutfits: [] as MiniOutfit[],
    calendarPlans: [] as MiniCalendarPlan[],
    outfitPlanEntries: [] as MiniOutfitPlanEntry[],
    selectedPlans: [] as SelectedPlanView[],
    selectedPrimaryEntry: null as SelectedEntryView | null,
    selectedBackupEntries: [] as BackupEntryView[],
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
    this.setData({ titleTopRpx: getTitleTopRpx(), selectedDate, monthKey: selectedDate.slice(0, 7) });
    this.rebuildCalendar();
  },

  onShow() {
    void this.loadPlanning();
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
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
    this.openOutfitSelector(relation === "past" ? "worn" : "primary");
  },

  openBackupSelector() {
    if (getOutfitPlanDateRelation(this.data.selectedDate, this.data.todayKey) === "past") return;
    this.openOutfitSelector("backup");
  },

  openChangeSelector() {
    if (getOutfitPlanDateRelation(this.data.selectedDate, this.data.todayKey) !== "future") return;
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
      if (!await this.loadPlanning()) throw new Error("已保存，但重新读取失败，请稍后重试");
      this.setData({ selectSheetOpen: false, outfitSearch: "" });
      wx.showToast({ title: mode === "worn" ? "已补记穿搭" : mode === "backup" ? "已添加备选穿搭" : mode === "replace" ? "已更改主计划" : "已安排主穿搭", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "保存穿搭失败", icon: "none" });
    } finally {
      this.setData({ savingEntry: false });
    }
  },

  async handlePrimaryAction() {
    const primary = this.data.selectedPrimaryEntry;
    if (!primary || !primary.primaryAction || this.data.savingEntry) return;
    const outfit = this.data.outfits.find((item) => item.id === primary.outfitId);
    if (!outfit) return;

    this.setData({ savingEntry: true });
    try {
      if (primary.primaryAction === "mark_worn") {
        await markOutfitWornOnDate(outfit.id, outfit.revision, this.data.selectedDate);
      } else {
        await cancelOutfitWornOnDate(outfit.id, outfit.revision, this.data.selectedDate);
      }
      if (!await this.loadPlanning()) throw new Error("已保存，但重新读取失败，请稍后重试");
      const relation = getOutfitPlanDateRelation(this.data.selectedDate, this.data.todayKey);
      wx.showToast({ title: primary.primaryAction === "mark_worn" ? relation === "past" ? "已补记穿搭" : "已记录今天穿着" : relation === "past" ? "已撤销补记" : "已撤销今天穿着", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "更新穿着失败", icon: "none" });
    } finally {
      this.setData({ savingEntry: false });
    }
  },

  openOutfit(event: DatasetEvent) {
    const id = String(event.currentTarget.dataset.id || "");
    if (id) wx.navigateTo({ url: `/pages/outfits/detail/index?id=${encodeURIComponent(id)}` });
  },

  noop() {},

  openPlanDetail(event: DatasetEvent) {
    const id = String(event.currentTarget.dataset.id || "");
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

  async loadPlanning(): Promise<boolean> {
    const state = getWorkspaceReadState();
    if (state !== "ready") {
      this.setData({
        loading: false,
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

    this.setData({ loading: true, error: "" });
    try {
      const snapshot = await fetchPlanningSnapshot();
      this.setData({
        outfits: snapshot.outfits,
        filteredOutfits: snapshot.outfits,
        calendarPlans: snapshot.calendarPlans,
        outfitPlanEntries: snapshot.outfitPlanEntries,
        loading: false,
      });
      this.rebuildCalendar();
      return true;
    } catch (error) {
      this.setData({ loading: false, error: error instanceof Error ? error.message : "读取穿搭计划失败", statusActionLabel: "重试" });
      this.rebuildCalendar();
      return false;
    }
  },

  rebuildCalendar() {
    const { firstDay, lastDay } = getMonthRange(this.data.monthKey);
    const monthHasData = this.data.outfitPlanEntries.some((entry) => entry.date >= firstDay && entry.date <= lastDay)
      || this.data.calendarPlans.some((plan) => rangeOverlaps(plan.startDate, plan.endDate, firstDay, lastDay));
    const dayViews = getMonthGrid(this.data.monthKey, this.data.todayKey).map((cell) => {
      const entry = this.primaryEntryForDate(cell.dateKey);
      const plans = this.plansForDate(cell.dateKey);
      return {
        key: cell.dateKey,
        label: String(cell.day),
        muted: cell.muted,
        active: cell.dateKey === this.data.selectedDate,
        today: cell.isToday,
        entryLabel: entryLabel(entry, cell.dateKey, this.data.todayKey),
        dots: plans.slice(0, 2).map((plan) => ({ id: plan.id, title: plan.title, className: TONE_CLASS[plan.tone] })),
      };
    });
    const calendarWeeks = chunkIntoWeeks(dayViews).map((days) => ({
      key: days[0]?.key || "",
      days,
      containsSelectedDate: days.some((day) => day.key === this.data.selectedDate),
    }));
    const selectedPlans = this.plansForDate(this.data.selectedDate).map((plan) => ({
      ...plan,
      toneClass: TONE_CLASS[plan.tone],
      dateText: plan.startDate === plan.endDate ? plan.startDate.replace(/-/g, "/") : `${plan.startDate.replace(/-/g, "/")} - ${plan.endDate.replace(/-/g, "/")}`,
    }));
    const selectedEntries = this.entriesForDate(this.data.selectedDate);
    const primaryEntry = resolvePrimaryOutfitPlanEntry(selectedEntries);
    const primaryOutfit = primaryEntry ? this.data.outfits.find((item) => item.id === getDisplayOutfitId(primaryEntry)) : undefined;
    const relation = getOutfitPlanDateRelation(this.data.selectedDate, this.data.todayKey);
    const primaryAction: SelectedEntryView["primaryAction"] = relation === "future"
      ? ""
      : primaryEntry?.status === "worn"
        ? "cancel_worn"
        : "mark_worn";
    const selectedBackupEntries = getBackupOutfitPlanEntries(selectedEntries, primaryEntry)
      .map((entry) => {
        const outfit = this.data.outfits.find((item) => item.id === getDisplayOutfitId(entry));
        return outfit ? { id: entry.id, outfitId: outfit.id, name: entry.title || outfit.name, imageUrl: outfit.imageUrl, itemImages: outfit.itemImages } : null;
      })
      .filter((entry): entry is BackupEntryView => entry !== null);
    const selectedPrimaryEntry = primaryEntry && primaryOutfit ? {
      id: primaryEntry.id,
      outfitId: primaryOutfit.id,
      name: primaryEntry.title || primaryOutfit.name,
      imageUrl: primaryOutfit.imageUrl,
      itemImages: primaryOutfit.itemImages,
      meta: `${primaryOutfit.itemCount}件 · ${primaryOutfit.sceneText}`,
      statusLabel: primaryEntry.status === "worn" ? "实际已穿" : primaryEntry.status === "changed" ? "已变更" : relation === "past" ? "计划未确认" : "计划",
      statusClass: primaryEntry.status === "worn" ? "is-worn" : primaryEntry.status === "changed" ? "is-changed" : "is-planned",
      primaryAction,
      primaryActionLabel: primaryEntry.status === "worn" ? "撤销已穿" : relation === "past" ? "补记已穿" : "标记已穿",
      canChangePlan: relation === "future" && primaryEntry.status === "planned",
      canAddBackup: relation !== "past",
    } : null;
    this.setData({
      monthTitle: monthTitle(this.data.monthKey),
      selectedDateLabel: formatDateLabel(this.data.selectedDate),
      calendarWeeks,
      selectedPlans,
      selectedPrimaryEntry,
      selectedBackupEntries,
      monthHasData,
      selectedEmptyTitle: relation === "past"
        ? `${formatDateWithWeek(this.data.selectedDate)}还没有穿着记录`
        : relation === "today"
          ? "今天还没有安排穿搭"
          : `${formatDateWithWeek(this.data.selectedDate)}还没有安排穿搭`,
      selectedEmptyCopy: relation === "past" ? "可以补记当天实际穿过的套装。" : "可以先把想穿的套装放进计划。",
      selectedActionLabel: relation === "past" ? "补记已穿" : "安排穿搭",
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

function entryLabel(entry: MiniOutfitPlanEntry | undefined, dateKey: string, todayKey: string): string {
  if (!entry) return "";
  if (entry.status === "worn") return "已穿";
  if (entry.status === "changed") return "已变更";
  return dateKey < todayKey ? "未确认" : "计划";
}

function chunkIntoWeeks(days: CalendarDayView[]): CalendarDayView[][] {
  const weeks: CalendarDayView[][] = [];
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7));
  return weeks;
}

function getTitleTopRpx(): number {
  return getCapsuleGeometry().topRpx;
}
