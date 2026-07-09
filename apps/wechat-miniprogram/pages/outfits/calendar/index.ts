import {
  createOutfitPlanEntry,
  fetchPlanningSnapshot,
  getWorkspaceReadState,
  type MiniCalendarPlan,
  type MiniCalendarPlanTone,
  type MiniCalendarPlanType,
  type MiniOutfit,
  type MiniOutfitPlanEntry,
} from "../../../services/workspace";
import {
  formatDateLabel,
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
type SelectedEntryView = {
  id: string;
  outfitId: string;
  name: string;
  imageUrl: string;
  meta: string;
  statusLabel: string;
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
    days: [] as CalendarDayView[],
    loading: false,
    savingEntry: false,
    outfits: [] as MiniOutfit[],
    filteredOutfits: [] as MiniOutfit[],
    calendarPlans: [] as MiniCalendarPlan[],
    outfitPlanEntries: [] as MiniOutfitPlanEntry[],
    selectedPlans: [] as SelectedPlanView[],
    selectedEntries: [] as SelectedEntryView[],
    monthHasData: false,
    selectedEmptyTitle: "",
    selectedEmptyCopy: "",
    selectedActionLabel: "安排穿搭",
    statusActionLabel: "",
    outfitSearch: "",
    selectSheetOpen: false,
    addPlanSheetOpen: false,
    planOptions: PLAN_OPTIONS,
    error: "",
    touchStartX: 0,
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "穿搭计划" });
    this.setData({ titleTopRpx: getTitleTopRpx() });
    this.rebuildCalendar();
  },

  onShow() {
    void this.loadPlanning();
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  shiftMonth(event: DatasetEvent) {
    const delta = event.currentTarget.dataset.delta === "next" ? 1 : -1;
    this.shiftMonthBy(delta);
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

  openOutfitSelect() {
    this.setData({ selectSheetOpen: true, outfitSearch: "" });
    this.filterOutfits("");
  },

  closeOutfitSelect() {
    if (!this.data.savingEntry) this.setData({ selectSheetOpen: false });
  },

  onSearchOutfit(event: WechatMiniprogram.InputEvent) {
    const value = event.detail.value || "";
    this.setData({ outfitSearch: value });
    this.filterOutfits(value);
  },

  async chooseOutfit(event: DatasetEvent) {
    const outfitId = String(event.currentTarget.dataset.id || "");
    const outfit = this.data.outfits.find((item) => item.id === outfitId);
    if (!outfit || this.data.savingEntry) return;

    const duplicate = this.data.outfitPlanEntries.some((entry) =>
      entry.date === this.data.selectedDate && entry.outfitId === outfitId && entry.status === "planned"
    );
    if (duplicate) {
      wx.showToast({ title: "这天已经安排过这套", icon: "none" });
      return;
    }

    this.setData({ savingEntry: true });
    try {
      const sameDayPlanned = this.data.outfitPlanEntries.filter((entry) => entry.date === this.data.selectedDate && entry.status === "planned");
      await createOutfitPlanEntry({
        date: this.data.selectedDate,
        outfitId,
        calendarPlanId: this.data.selectedPlans[0]?.id,
        makePrimary: sameDayPlanned.length === 0,
        title: outfit.name,
      });
      wx.showToast({ title: "已安排穿搭", icon: "success" });
      this.setData({ selectSheetOpen: false, outfitSearch: "" });
      await this.loadPlanning();
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "保存穿搭计划失败", icon: "none" });
    } finally {
      this.setData({ savingEntry: false });
    }
  },

  openOutfit(event: DatasetEvent) {
    const id = String(event.currentTarget.dataset.id || "");
    if (id) wx.navigateTo({ url: `/pages/outfits/detail/index?id=${encodeURIComponent(id)}` });
  },

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

  async loadPlanning() {
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
      return;
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
    } catch (error) {
      this.setData({ loading: false, error: error instanceof Error ? error.message : "读取穿搭计划失败", statusActionLabel: "重试" });
      this.rebuildCalendar();
    }
  },

  rebuildCalendar() {
    const { firstDay, lastDay } = getMonthRange(this.data.monthKey);
    const monthHasData = this.data.outfitPlanEntries.some((entry) => entry.date >= firstDay && entry.date <= lastDay)
      || this.data.calendarPlans.some((plan) => rangeOverlaps(plan.startDate, plan.endDate, firstDay, lastDay));
    const days = getMonthGrid(this.data.monthKey, this.data.todayKey).map((cell) => {
      const entries = this.data.outfitPlanEntries.filter((entry) => entry.date === cell.dateKey && entry.status !== "skipped");
      const plans = this.plansForDate(cell.dateKey);
      return {
        key: cell.dateKey,
        label: String(cell.day),
        muted: cell.muted,
        active: cell.dateKey === this.data.selectedDate,
        today: cell.isToday,
        entryLabel: entryLabel(entries, cell.dateKey, this.data.todayKey),
        dots: plans.slice(0, 2).map((plan) => ({ id: plan.id, title: plan.title, className: TONE_CLASS[plan.tone] })),
      };
    });

    const selectedPlans = this.plansForDate(this.data.selectedDate).map((plan) => ({
      ...plan,
      toneClass: TONE_CLASS[plan.tone],
      dateText: plan.startDate === plan.endDate ? plan.startDate.replace(/-/g, "/") : `${plan.startDate.replace(/-/g, "/")} - ${plan.endDate.replace(/-/g, "/")}`,
    }));
    const selectedEntries = this.entriesForDate(this.data.selectedDate).map((entry) => {
      const outfit = this.data.outfits.find((item) => item.id === entry.outfitId);
      return {
        id: entry.id,
        outfitId: entry.outfitId,
        name: entry.title || outfit?.name || "未命名套装",
        imageUrl: outfit?.imageUrl || "",
        meta: outfit ? `${outfit.itemCount}件 · ${outfit.sceneText}` : entry.scene,
        statusLabel: entry.status === "worn" ? "实际已穿" : entry.status === "changed" ? "已变更" : entry.date < this.data.todayKey ? "计划未确认" : "计划",
      };
    });
    const isPast = this.data.selectedDate < this.data.todayKey;
    const isToday = this.data.selectedDate === this.data.todayKey;
    this.setData({
      monthTitle: monthTitle(this.data.monthKey),
      selectedDateLabel: formatDateLabel(this.data.selectedDate),
      days,
      selectedPlans,
      selectedEntries,
      monthHasData,
      selectedEmptyTitle: isToday ? "今天还没有安排套装" : isPast ? `${formatDateLabel(this.data.selectedDate)}还没有穿着记录` : `${formatDateLabel(this.data.selectedDate)}还没有安排套装`,
      selectedEmptyCopy: isPast ? "可以补记当天实际穿过的套装。" : "可以先把想穿的套装放进计划。",
      selectedActionLabel: isPast ? "补记已穿" : "安排穿搭",
    });
  },

  plansForDate(dateKey: string): MiniCalendarPlan[] {
    return this.data.calendarPlans
      .filter((plan) => dateKey >= plan.startDate && dateKey <= plan.endDate)
      .sort((a, b) => a.startDate === b.startDate ? b.updatedAt.localeCompare(a.updatedAt) : a.startDate.localeCompare(b.startDate));
  },

  entriesForDate(dateKey: string): MiniOutfitPlanEntry[] {
    return this.data.outfitPlanEntries
      .filter((entry) => entry.date === dateKey && entry.status !== "skipped")
      .sort((a, b) => {
        if (a.status !== b.status) return statusRank(a.status) - statusRank(b.status);
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return b.updatedAt.localeCompare(a.updatedAt);
      });
  },

  filterOutfits(keyword: string) {
    const q = keyword.trim().toLowerCase();
    const filtered = q
      ? this.data.outfits.filter((outfit) => outfit.name.toLowerCase().includes(q) || outfit.sceneText.toLowerCase().includes(q))
      : this.data.outfits;
    this.setData({ filteredOutfits: filtered });
  },
});

function entryLabel(entries: MiniOutfitPlanEntry[], dateKey: string, todayKey: string): string {
  if (entries.length === 0) return "";
  const primary = entries.find((entry) => entry.status === "worn")
    || entries.find((entry) => entry.status === "planned" && entry.isPrimary)
    || entries[0];
  if (!primary) return "";
  if (primary.status === "worn") return "已穿";
  if (primary.status === "changed") return "已变更";
  return dateKey < todayKey ? "未确认" : "计划";
}

function statusRank(status: MiniOutfitPlanEntry["status"]): number {
  if (status === "worn") return 0;
  if (status === "planned") return 1;
  if (status === "changed") return 2;
  return 3;
}

function getTitleTopRpx(): number {
  const systemInfo = wx.getSystemInfoSync();
  const menuRect = (wx as unknown as { getMenuButtonBoundingClientRect?: () => { top?: number } }).getMenuButtonBoundingClientRect?.();
  const windowWidth = (systemInfo as WechatMiniprogram.SystemInfo & { windowWidth?: number }).windowWidth || 375;
  return Math.round((menuRect?.top ?? (systemInfo.statusBarHeight ?? 0) + 8) * (750 / windowWidth));
}
