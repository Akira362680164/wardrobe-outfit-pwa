import { aiEnhance, hasMiniMaxKey } from "../../../services/ai";
import {
  fetchGarments,
  fetchOutfits,
  fetchTryOnProfile,
  type MiniGarment,
} from "../../../services/workspace";

type Recommendation = {
  title: string;
  itemIds: string[];
  reason: string;
  sceneTips: string[];
  items: MiniGarment[];
};
Page({
  data: {
    loading: false,
    error: "",
    summary: "",
    warnings: [] as string[],
    results: [] as Recommendation[],
    destination: "",
    activity: "",
    weather: "",
    temperature: "20",
    timeOfDay: "day",
    timeOptions: ["白天", "晚上"],
    formality: "3",
    style: "",
    items: [] as MiniGarment[],
  },
  onLoad() {
    wx.setNavigationBarTitle({ title: "场景穿搭推荐" });
    void this.load();
  },
  async load(this: any) {
    try {
      this.setData({ items: await fetchGarments() });
    } catch (error) {
      this.setData({
        error: error instanceof Error ? error.message : "读取衣橱失败",
      });
    }
  },
  input(this: any, event: any) {
    this.setData({ [event.currentTarget.dataset.field]: event.detail.value });
  },
  chooseTime(this: any, event: any) {
    this.setData({ timeOfDay: Number(event.detail.value) === 1 ? "night" : "day" });
  },
  async generate(this: any) {
    if (this.data.loading) return;
    if (!hasMiniMaxKey()) {
      this.setData({ error: "请先在设置中填写 MiniMax Key" });
      return;
    }
    if (!this.data.activity.trim()) {
      this.setData({ error: "请填写活动或场景" });
      return;
    }
    this.setData({ loading: true, error: "", results: [] });
    try {
      const items = (this.data.items as MiniGarment[]).map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        subcategory: item.subcategory,
        colors: item.colorsRaw,
        seasons: item.seasons,
        styles: item.styles,
        temperatureRange: item.temperatureRange,
        formality: item.formality,
        warmth: item.warmth,
        fitGender: item.fitGender,
        status: item.status,
        locationId: item.locationId,
        wornDates: item.wornDates,
      }));
      const [outfits, profile] = await Promise.all([
        fetchOutfits(),
        fetchTryOnProfile().catch(() => null),
      ]);
      const response = await aiEnhance<{
        summary: string;
        recommendedOutfits: Array<{
          title: string;
          itemIds: string[];
          reason: string;
          sceneTips: string[];
        }>;
        warnings: string[];
      }>("outfit-recommendation", {
        request: {
          destination: this.data.destination,
          activity: this.data.activity,
          weather: this.data.weather,
          temperatureC: Number(this.data.temperature),
          timeOfDay: this.data.timeOfDay,
          formality: Number(this.data.formality),
          style: this.data.style,
        },
        items,
        outfits: outfits.map((outfit) => ({
          id: outfit.id,
          name: outfit.name,
          itemEntityIds: outfit.itemEntityIds,
          sceneText: outfit.sceneText,
          wornDates: outfit.wornDates,
        })),
        profile: profile
          ? {
              fitGender: profile.fitGender,
              heightCm: profile.heightCm,
              bodyType: profile.bodyType,
              styleNote: profile.styleNote,
            }
          : null,
      });
      const byId = new Map(
        (this.data.items as MiniGarment[]).map((item) => [item.id, item]),
      );
      this.setData({
        summary: response.summary || "已生成推荐",
        warnings: response.warnings || [],
        results: (response.recommendedOutfits || []).map((result) => ({
          ...result,
          items: result.itemIds.flatMap((id) =>
            byId.get(id) ? [byId.get(id)!] : [],
          ),
        })),
      });
    } catch (error) {
      this.setData({
        error: error instanceof Error ? error.message : "推荐失败，请重试",
      });
    } finally {
      this.setData({ loading: false });
    }
  },
  openItem(event: any) {
    wx.navigateTo({
      url: `/pages/wardrobe/detail/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}`,
    });
  },
  openSettings() {
    wx.switchTab({ url: "/pages/settings/index/index" });
  },
  refresh() {
    void this.generate();
  },
});
