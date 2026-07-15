import {
  cancelOutfitWornOnDate,
  createOutfitPlanEntry,
  fetchPlanningSnapshot,
  getWorkspaceReadState,
  markOutfitWornOnDate,
  markOutfitPlanWorn,
  cancelOutfitPlanWorn,
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
  getRecommendationPlanAvailabilityMessage,
  getRecommendationPlanSnapshotNames,
  isSnapshotRecommendationPlan,
  getOutfitPlanDateRelation,
  hasDuplicatePlannedOutfit,
  resolvePrimaryOutfitPlanEntry,
  type OutfitPlanSelectionMode,
} from "../../../utils/outfit-plan-state";
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
type BackupWeekEntry = {
  id: string;
  outfitId: string;
  name: string;
  itemImages: string[];
  imageUrl: string;
};
type SelectedWeekEntry = {
  id: string;
  outfitId: string;
  planId: string;
  planTitle: string;
  planTypeLabel: string;
  name: string;
  imageUrl: string;
  itemImages: string[];
  statusLabel: string;
  statusClass: string;
  primaryAction: "mark_worn" | "cancel_worn" | "";
  primaryActionLabel: string;
  canChangePlan: boolean;
  canAddBackup: boolean;
  backups: BackupWeekEntry[];
  availabilityMessage: string;
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
    selectedWeekEntry: null as SelectedWeekEntry | null,
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

  async loadOutfits(): Promise<boolean> {
    const state = getWorkspaceReadState();
    if (state !== "ready") {
      this.setData({
        loading: false,
        outfits: [],
        filteredOutfits: [],
        error: "",
        emptyTitle: state === "logged_out" ? "登录后同步套装" : "请先配置后端 API 域名",
        emptyAction: state === "logged_out" ? "去登录" : "去设置",
      });
      this.rebuildWeek();
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
        outfitCountLabel: `${snapshot.outfits.length} 套`,
      });
      this.rebuildWeek();
      return true;
    } catch (error) {
      this.setData({ loading: false, outfits: [], filteredOutfits: [], outfitCountLabel: "0 套", error: error instanceof Error ? error.message : "读取套装失败" });
      this.rebuildWeek();
      return false;
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

  openSelectedDateSelector() {
    const relation = getOutfitPlanDateRelation(this.data.selectedDate, localDateKey());
    const hasBrokenPrimary = Boolean(this.entryForDate(this.data.selectedDate) && !this.data.selectedWeekEntry);
    this.openOutfitSelector(relation === "past" ? "worn" : hasBrokenPrimary ? "replace" : "primary");
  },

  openBackupSelector() {
    if (getOutfitPlanDateRelation(this.data.selectedDate, localDateKey()) === "past") return;
    this.openOutfitSelector("backup");
  },

  openChangeSelector() {
    if (getOutfitPlanDateRelation(this.data.selectedDate, localDateKey()) !== "future") return;
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
    setCustomTabBarHidden(this, true);
    this.setData({ selectSheetOpen: true, selectionMode: mode, selectionTitle: title, selectionDescription: description, outfitSearch: "" });
    this.filterOutfits("");
  },

  closeOutfitSelector() {
    if (this.data.savingEntry) return;
    setCustomTabBarHidden(this, false);
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
      if (!await this.loadOutfits()) throw new Error("已保存，但重新读取失败，请稍后重试");
      setCustomTabBarHidden(this, false);
      this.setData({ selectSheetOpen: false, outfitSearch: "" });
      wx.showToast({ title: mode === "worn" ? "已补记穿搭" : mode === "backup" ? "已添加备选穿搭" : mode === "replace" ? "已更改主计划" : "已安排主穿搭", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "保存穿搭失败", icon: "none" });
    } finally {
      this.setData({ savingEntry: false });
    }
  },

  async handlePrimaryAction() {
    const selected = this.data.selectedWeekEntry;
    if (!selected || !selected.primaryAction || this.data.savingEntry) return;
    const outfit = this.data.outfits.find((item) => item.id === selected.outfitId);
    const planEntry = this.data.outfitPlanEntries.find((item) => item.id === selected.id);
    if (!outfit && !planEntry) return;

    this.setData({ savingEntry: true });
    try {
      if (selected.primaryAction === "mark_worn") {
        if (outfit) await markOutfitWornOnDate(outfit.id, outfit.revision, this.data.selectedDate); else await markOutfitPlanWorn(planEntry!, this.data.selectedDate);
      } else {
        if (outfit) await cancelOutfitWornOnDate(outfit.id, outfit.revision, this.data.selectedDate); else await cancelOutfitPlanWorn(planEntry!, this.data.selectedDate);
      }
      if (!await this.loadOutfits()) throw new Error("已保存，但重新读取失败，请稍后重试");
      const relation = getOutfitPlanDateRelation(this.data.selectedDate, localDateKey());
      wx.showToast({ title: selected.primaryAction === "mark_worn" ? relation === "past" ? "已补记穿搭" : "已记录今天穿着" : relation === "past" ? "已撤销补记" : "已撤销今天穿着", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "更新穿着失败", icon: "none" });
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

  openDetail(event: DatasetEvent) {
    const id = String(event.currentTarget.dataset.id || "");
    if (id) wx.navigateTo({ url: `/pages/outfits/detail/index?id=${encodeURIComponent(id)}` });
  },

  entryForDate(date: string): MiniOutfitPlanEntry | undefined {
    return resolvePrimaryOutfitPlanEntry(this.entriesForDate(date));
  },

  entriesForDate(date: string): MiniOutfitPlanEntry[] {
    return this.data.outfitPlanEntries.filter((entry) => entry.date === date && entry.status !== "skipped");
  },

  planForDate(date: string): MiniCalendarPlan | undefined {
    return this.data.calendarPlans
      .filter((plan) => date >= plan.startDate && date <= plan.endDate)
      .sort((a, b) => a.startDate === b.startDate ? b.updatedAt.localeCompare(a.updatedAt) : a.startDate.localeCompare(b.startDate))[0];
  },

  rebuildWeek() {
    const todayKey = localDateKey();
    const weekDays = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(this.data.weekStart, index);
      const entry = this.entryForDate(date);
      const outfit = entry ? this.data.outfits.find((item) => item.id === getDisplayOutfitId(entry)) : undefined;
      const plan = this.planForDate(date);
      return {
        key: date,
        week: ["一", "二", "三", "四", "五", "六", "日"][index],
        day: String(parseDateKey(date).day),
        active: date === this.data.selectedDate,
        thumbnails: outfit?.itemImages?.length ? outfit.itemImages : outfit?.imageUrl ? [outfit.imageUrl] : [],
        entryLabel: entryLabel(entry, date, todayKey),
        toneClass: plan ? TONE_CLASS[plan.tone] : "",
      };
    });
    const selectedEntries = this.entriesForDate(this.data.selectedDate);
    const selectedEntry = resolvePrimaryOutfitPlanEntry(selectedEntries);
    const selectedOutfit = selectedEntry ? this.data.outfits.find((item) => item.id === getDisplayOutfitId(selectedEntry)) : undefined;
    const selectedPlan = this.planForDate(this.data.selectedDate);
    const relation = getOutfitPlanDateRelation(this.data.selectedDate, todayKey);
    const backups = getBackupOutfitPlanEntries(selectedEntries, selectedEntry)
      .map((entry) => {
        const outfit = this.data.outfits.find((item) => item.id === getDisplayOutfitId(entry));
        return outfit ? {
          id: entry.id,
          outfitId: outfit.id,
          name: entry.title || outfit.name,
          itemImages: outfit.itemImages,
          imageUrl: outfit.imageUrl,
        } : null;
      })
      .filter((entry): entry is BackupWeekEntry => entry !== null);
    const weekEnd = addDays(this.data.weekStart, 6);
    this.setData({
      weekDays,
      weekRangeLabel: formatWeekRange(this.data.weekStart, weekEnd),
      selectedDateLabel: formatDateWithWeek(this.data.selectedDate),
      selectedEmptyTitle: selectedEntry && !selectedOutfit && !isSnapshotRecommendationPlan(selectedEntry) ? "计划关联的套装已失效" : relation === "past" ? `${formatDateWithWeek(this.data.selectedDate)}还没有穿着记录` : `${formatDateWithWeek(this.data.selectedDate)}还没有安排穿搭`,
      selectedEmptyCopy: selectedEntry && !selectedOutfit && !isSnapshotRecommendationPlan(selectedEntry) ? "该计划无法找到对应套装，请重新选择。" : relation === "past" ? "可以补记当天实际穿过的套装。" : "先安排主计划，再添加备选穿搭。",
      selectedEmptyAction: selectedEntry && !selectedOutfit ? "重新选择套装" : relation === "past" ? "补记已穿" : "安排主穿搭",
      selectedWeekEntry: selectedEntry && (selectedOutfit || isSnapshotRecommendationPlan(selectedEntry)) ? {
        id: selectedEntry.id,
        outfitId: selectedOutfit?.id || "",
        planId: selectedPlan?.id || "",
        planTitle: selectedPlan?.title || "单日穿搭",
        planTypeLabel: selectedPlan?.typeLabel || "计划",
        name: selectedEntry.title || selectedOutfit?.name || getRecommendationPlanSnapshotNames(selectedEntry).join(" · "),
        imageUrl: selectedOutfit?.imageUrl || "",
        itemImages: selectedOutfit?.itemImages || [],
        statusLabel: selectedEntry.status === "worn" ? "实际已穿" : selectedEntry.status === "changed" ? "已变更" : relation === "past" ? "计划未确认" : "计划",
        statusClass: selectedEntry.status === "worn" ? "is-worn" : selectedEntry.status === "changed" ? "is-changed" : "is-planned",
        primaryAction: relation === "future" ? "" : selectedEntry.status === "worn" ? "cancel_worn" : "mark_worn",
        primaryActionLabel: selectedEntry.status === "worn" ? "撤销已穿" : relation === "past" ? "补记已穿" : "标记已穿",
        canChangePlan: relation === "future" && selectedEntry.status === "planned",
        canAddBackup: relation !== "past",
        backups,
        availabilityMessage: getRecommendationPlanAvailabilityMessage(selectedEntry, todayKey),
      } : null,
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

function entryLabel(entry: MiniOutfitPlanEntry | undefined, dateKey: string, todayKey: string): string {
  if (!entry) return "";
  if (entry.status === "worn") return "已穿";
  if (entry.status === "changed") return "已变更";
  return dateKey < todayKey ? "未确认" : "计划";
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
  return getCapsuleGeometry().topRpx;
}
