import {
  fetchCalendarPlanDetail,
  saveCalendarPlan,
  type MiniCalendarPlan,
  type MiniCalendarPlanTone,
  type MiniCalendarPlanType,
} from "../../../services/workspace";
import { enumerateDateRange, localDateKey } from "../../../utils/calendar";

type ToneOption = { tone: MiniCalendarPlanTone; className: string };
type DatasetEvent = { currentTarget: { dataset: Record<string, unknown> } };
type PickerEvent = { detail: { value: string } };
type SwitchEvent = { detail: { value: boolean } };

const TONES: ToneOption[] = [
  { tone: "denim", className: "tone-denim" },
  { tone: "moss", className: "tone-moss" },
  { tone: "clay", className: "tone-clay" },
  { tone: "amber", className: "tone-amber" },
  { tone: "rose", className: "tone-rose" },
  { tone: "purple", className: "tone-purple" },
  { tone: "slate", className: "tone-slate" },
];

Page({
  data: {
    titleTopRpx: 0,
    pageTitle: "添加旅行计划",
    planId: "",
    expectedRevision: 0,
    currentPayload: null as Record<string, unknown> | null,
    type: "travel" as MiniCalendarPlanType,
    title: "",
    titlePlaceholder: "未命名旅行",
    destinationLabel: "目的地",
    destinationPlaceholder: "如 伊宁 / 夏塔",
    destination: "",
    startDate: localDateKey(),
    endDate: localDateKey(),
    activityInput: "",
    activities: [] as string[],
    noteLabel: "天气备注",
    notePlaceholder: "如 早晚温差大",
    noteValue: "",
    tone: "clay" as MiniCalendarPlanTone,
    toneOptions: TONES,
    packingEnabled: true,
    loading: false,
    saving: false,
    error: "",
  },

  onLoad(query?: { id?: string; type?: string; date?: string }) {
    this.setData({ titleTopRpx: getTitleTopRpx() });
    if (query?.id) {
      void this.loadPlan(query.id);
      return;
    }
    const type = normalizeType(query?.type);
    const date = validDateKey(query?.date) ? query!.date! : localDateKey();
    this.applyTypeDefaults(type);
    this.setData({ type, startDate: date, endDate: date });
  },

  async loadPlan(id: string) {
    this.setData({ loading: true, error: "" });
    try {
      const plan = await fetchCalendarPlanDetail(id);
      this.applyLoadedPlan(plan);
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "读取计划失败" });
    } finally {
      this.setData({ loading: false });
    }
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  onTitleInput(event: WechatMiniprogram.InputEvent) {
    this.setData({ title: event.detail.value || "" });
  },

  onDestinationInput(event: WechatMiniprogram.InputEvent) {
    this.setData({ destination: event.detail.value || "" });
  },

  onStartDateChange(event: PickerEvent) {
    const startDate = String(event.detail.value);
    this.setData({ startDate, endDate: this.data.endDate < startDate ? startDate : this.data.endDate });
  },

  onEndDateChange(event: PickerEvent) {
    this.setData({ endDate: String(event.detail.value) });
  },

  onActivityInput(event: WechatMiniprogram.InputEvent) {
    this.setData({ activityInput: event.detail.value || "" });
  },

  addActivity() {
    const value = this.data.activityInput.trim();
    if (!value || this.data.activities.includes(value) || this.data.activities.length >= 8) return;
    this.setData({ activities: [...this.data.activities, value], activityInput: "" });
  },

  removeActivity(event: DatasetEvent) {
    const value = String(event.currentTarget.dataset.value || "");
    this.setData({ activities: this.data.activities.filter((item) => item !== value) });
  },

  onNoteInput(event: WechatMiniprogram.InputEvent) {
    this.setData({ noteValue: event.detail.value || "" });
  },

  chooseTone(event: DatasetEvent) {
    const tone = String(event.currentTarget.dataset.tone || "denim") as MiniCalendarPlanTone;
    this.setData({ tone });
  },

  onPackingChange(event: SwitchEvent) {
    this.setData({ packingEnabled: event.detail.value });
  },

  async save() {
    if (this.data.saving) return;
    const error = validateDateRange(this.data.startDate, this.data.endDate);
    if (error) {
      this.setData({ error });
      return;
    }

    this.setData({ saving: true, error: "" });
    try {
      await saveCalendarPlan({
        id: this.data.planId || undefined,
        expectedRevision: this.data.expectedRevision || undefined,
        currentPayload: this.data.currentPayload ?? undefined,
        type: this.data.type,
        title: this.data.title,
        startDate: this.data.startDate,
        endDate: this.data.endDate,
        tone: this.data.tone,
        destination: this.data.type === "custom" ? undefined : this.data.destination,
        activities: this.data.activities,
        weatherNote: this.data.type === "travel" ? this.data.noteValue : undefined,
        notes: this.data.type === "travel" ? undefined : this.data.noteValue,
        packingEnabled: this.data.packingEnabled,
      });
      wx.showToast({ title: "计划已保存", icon: "success" });
      wx.navigateBack({ delta: 1 });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "计划保存失败" });
    } finally {
      this.setData({ saving: false });
    }
  },

  applyLoadedPlan(plan: MiniCalendarPlan) {
    this.applyTypeDefaults(plan.type, true);
    this.setData({
      planId: plan.id,
      expectedRevision: plan.revision,
      currentPayload: plan.rawPayload,
      type: plan.type,
      title: plan.title,
      destination: plan.destination,
      startDate: plan.startDate,
      endDate: plan.endDate,
      activities: plan.activities,
      noteValue: plan.type === "travel" ? plan.weatherNote : plan.notes,
      tone: plan.tone,
      packingEnabled: plan.packingEnabled,
    });
  },

  applyTypeDefaults(type: MiniCalendarPlanType, editing = false) {
    const typeText = type === "travel" ? "旅行" : type === "business" ? "出差" : "自定义";
    this.setData({
      type,
      pageTitle: `${editing ? "编辑" : "添加"}${typeText}计划`,
      titlePlaceholder: type === "travel" ? "未命名旅行" : type === "business" ? "未命名出差" : "未命名计划",
      destinationLabel: type === "travel" ? "目的地" : "地点",
      destinationPlaceholder: type === "travel" ? "如 伊宁 / 夏塔" : "如 上海",
      noteLabel: type === "travel" ? "天气备注" : "备注",
      notePlaceholder: type === "travel" ? "如 早晚温差大" : type === "business" ? "如 需要偏正式" : "可选",
      tone: type === "travel" ? "clay" : type === "business" ? "moss" : "denim",
      packingEnabled: type !== "custom",
    });
    wx.setNavigationBarTitle({ title: `${editing ? "编辑" : "添加"}${typeText}计划` });
  },
});

function normalizeType(value: unknown): MiniCalendarPlanType {
  return value === "business" || value === "custom" || value === "travel" ? value : "travel";
}

function validDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validateDateRange(startDate: string, endDate: string): string {
  if (!validDateKey(startDate) || !validDateKey(endDate)) return "请选择日期范围";
  if (endDate < startDate) return "结束日期不能早于开始日期";
  if (enumerateDateRange(startDate, endDate).length > 365) return "计划最长支持 365 天";
  return "";
}

function getTitleTopRpx(): number {
  const systemInfo = wx.getSystemInfoSync();
  const menuRect = (wx as unknown as { getMenuButtonBoundingClientRect?: () => { top?: number } }).getMenuButtonBoundingClientRect?.();
  const windowWidth = (systemInfo as WechatMiniprogram.SystemInfo & { windowWidth?: number }).windowWidth || 375;
  return Math.round((menuRect?.top ?? (systemInfo.statusBarHeight ?? 0) + 8) * (750 / windowWidth));
}
