import {
  fetchPlanningSnapshot,
  getWorkspaceReadState,
  type MiniCalendarPlan,
  type MiniCalendarPlanTone,
  type MiniCalendarPlanType,
  type MiniOutfit,
  type MiniOutfitPlanEntry,
} from "../../../services/workspace";
import { formatDateWithWeek, localDateKey, parseDateKey, ymd } from "../../../utils/calendar";

type DatasetEvent = { currentTarget: { dataset: Record<string, unknown> } };
type TouchLikeEvent = { touches?: Array<{ clientX: number }>; changedTouches?: Array<{ clientX: number }> };
type WeekDayView = {
  key: string;
  week: string;
  day: string;
  active: boolean;
  thumbnails: string[];
  entryLabel: string;
  toneClass: string;
};
type SelectedWeekEntry = {
  id: string;
  outfitId: string;
  planId: string;
  dateLabel: string;
  planTitle: string;
  planTypeLabel: string;
  name: string;
  itemCount: number;
  sceneText: string;
  imageUrl: string;
  itemImages: string[];
  statusLabel: string;
  statusClass: string;
};

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
    loading: false,
    outfits: [] as MiniOutfit[],
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
    weekDays: [] as WeekDayView[],
    selectedWeekEntry: null as SelectedWeekEntry | null,
    outfitCountLabel: "0 套",
    createSheetOpen: false,
    addPlanSheetOpen: false,
    planOptions: PLAN_OPTIONS,
    titleTopRpx: 0,
    touchStartX: 0,
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "套装" });
    this.setData({ titleTopRpx: getTitleTopRpx() });
    setCustomTabBarSelected(this, 1);
    this.rebuildWeek();
    void this.loadOutfits();
  },

  onShow() {
    setCustomTabBarSelected(this, 1);
    void this.loadOutfits();
  },

  onHide() {
    setCustomTabBarHidden(this, false);
  },

  onReady() {
    setCustomTabBarSelected(this, 1);
  },

  async loadOutfits() {
    const state = getWorkspaceReadState();
    if (state !== "ready") {
      this.setData({
        loading: false,
        outfits: [],
        error: "",
        emptyTitle: state === "logged_out" ? "登录后同步套装" : "请先配置后端 API 域名",
        emptyAction: state === "logged_out" ? "去登录" : "去设置",
      });
      this.rebuildWeek();
      return;
    }

    this.setData({ loading: true, error: "" });
    try {
      const snapshot = await fetchPlanningSnapshot();
      this.setData({
        outfits: snapshot.outfits,
        calendarPlans: snapshot.calendarPlans,
        outfitPlanEntries: snapshot.outfitPlanEntries,
        loading: false,
        outfitCountLabel: `${snapshot.outfits.length} 套`,
      });
      this.rebuildWeek();
    } catch (error) {
      this.setData({ loading: false, outfits: [], outfitCountLabel: "0 套", error: error instanceof Error ? error.message : "读取套装失败" });
      this.rebuildWeek();
    }
  },

  openCalendar() {
    wx.navigateTo({ url: "/pages/outfits/calendar/index" });
  },

  openAddPlanSheet() {
    setCustomTabBarHidden(this, true);
    this.setData({ addPlanSheetOpen: true });
  },

  closeAddPlanSheet() {
    setCustomTabBarHidden(this, false);
    this.setData({ addPlanSheetOpen: false });
  },

  choosePlanType(event: DatasetEvent) {
    const type = String(event.currentTarget.dataset.type || "custom");
    setCustomTabBarHidden(this, false);
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

  markTodayWorn() {
    wx.showToast({ title: "穿着记录功能沿用详情页", icon: "none" });
  },

  rebuildWeek() {
    const weekDays = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(this.data.weekStart, index);
      const entry = this.entryForDate(date);
      const outfit = entry ? this.data.outfits.find((item) => item.id === entry.outfitId) : undefined;
      const plan = this.planForDate(date);
      return {
        key: date,
        week: ["一", "二", "三", "四", "五", "六", "日"][index],
        day: String(parseDateKey(date).day),
        active: date === this.data.selectedDate,
        thumbnails: outfit?.itemImages?.length ? outfit.itemImages : outfit?.imageUrl ? [outfit.imageUrl] : [],
        entryLabel: entry ? (entry.status === "worn" ? "已穿" : "计划") : "",
        toneClass: plan ? TONE_CLASS[plan.tone] : "",
      };
    });
    const selectedEntry = this.entryForDate(this.data.selectedDate);
    const selectedOutfit = selectedEntry ? this.data.outfits.find((item) => item.id === selectedEntry.outfitId) : undefined;
    const selectedPlan = this.planForDate(this.data.selectedDate);
    const weekEnd = addDays(this.data.weekStart, 6);
    this.setData({
      weekDays,
      weekRangeLabel: formatWeekRange(this.data.weekStart, weekEnd),
      selectedDateLabel: formatDateWithWeek(this.data.selectedDate),
      selectedWeekEntry: selectedEntry && selectedOutfit ? {
        id: selectedEntry.id,
        outfitId: selectedOutfit.id,
        planId: selectedPlan?.id || "",
        dateLabel: formatDateWithWeek(this.data.selectedDate),
        planTitle: selectedPlan?.title || "单日穿搭",
        planTypeLabel: selectedPlan?.typeLabel || "计划",
        name: selectedEntry.title || selectedOutfit.name,
        itemCount: selectedOutfit.itemCount,
        sceneText: selectedOutfit.sceneText,
        imageUrl: selectedOutfit.imageUrl,
        itemImages: selectedOutfit.itemImages,
        statusLabel: selectedEntry.status === "worn" ? "今天穿了" : "计划",
        statusClass: selectedEntry.status === "worn" ? "is-worn" : "is-planned",
      } : null,
    });
  },

  openCreateSheet() {
    this.setData({ createSheetOpen: true });
  },

  closeCreateSheet() {
    this.setData({ createSheetOpen: false });
  },

  openDetail(event: any) {
    const id = event.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: `/pages/outfits/detail/index?id=${encodeURIComponent(id)}` });
  },

  entryForDate(date: string): MiniOutfitPlanEntry | undefined {
    return this.data.outfitPlanEntries
      .filter((entry) => entry.date === date && entry.status !== "skipped")
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "worn" ? -1 : 1;
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return b.updatedAt.localeCompare(a.updatedAt);
      })[0];
  },

  planForDate(date: string): MiniCalendarPlan | undefined {
    return this.data.calendarPlans
      .filter((plan) => date >= plan.startDate && date <= plan.endDate)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
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

function setCustomTabBarSelected(page: unknown, selected: number) {
  const pageWithTabBar = page as { getTabBar?: () => ({ setData?: (data: { selected: number }) => void } | null) };
  const tabBar = pageWithTabBar.getTabBar?.();
  if (tabBar && typeof tabBar.setData === "function") tabBar.setData({ selected });
}

function setCustomTabBarHidden(page: unknown, hidden: boolean) {
  const pageWithTabBar = page as { getTabBar?: () => ({ setData?: (data: { hidden: boolean }) => void } | null) };
  const tabBar = pageWithTabBar.getTabBar?.();
  if (tabBar && typeof tabBar.setData === "function") tabBar.setData({ hidden });
  const tabBarApi = wx as typeof wx & {
    hideTabBar?: (options?: { animation?: boolean }) => void;
    showTabBar?: (options?: { animation?: boolean }) => void;
  };
  if (hidden) tabBarApi.hideTabBar?.({ animation: false });
  else tabBarApi.showTabBar?.({ animation: false });
}

function getTitleTopRpx() {
  const systemInfo = wx.getSystemInfoSync();
  const menuRect = (wx as unknown as { getMenuButtonBoundingClientRect?: () => { top?: number } }).getMenuButtonBoundingClientRect?.();
  const windowWidth = (systemInfo as WechatMiniprogram.SystemInfo & { windowWidth?: number }).windowWidth || 375;
  const pixelRatio = 750 / windowWidth;
  return Math.round((menuRect?.top ?? (systemInfo.statusBarHeight ?? 0) + 8) * pixelRatio);
}
