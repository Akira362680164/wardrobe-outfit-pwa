import { MINI_CATEGORY_LABELS } from "../../../generated/catalogs";
import { fetchClosetLocations, fetchGarments, type MiniClosetLocation, type MiniGarment } from "../../../services/workspace";
import { getCapsuleGeometry } from "../../../utils/capsule-layout";

const HISTORY_KEY = "wardrobe-search-history";

Page({
  data: { contentTopRpx: 0, loading: false, error: "", query: "", scope: "all", category: "all", garments: [] as MiniGarment[], results: [] as MiniGarment[], locations: [] as MiniClosetLocation[], locationById: {} as Record<string, string>, categories: [] as Array<{ value: string; label: string }>, history: [] as string[] },
  onLoad(this: any) { const history = wx.getStorageSync(HISTORY_KEY); this.setData({ contentTopRpx: getCapsuleGeometry().contentTopRpx, history: Array.isArray(history) ? history.slice(0, 10) : [] }); void this.load(); },
  async load(this: any) { this.setData({ loading: true, error: "" }); try { const [garments, locations] = await Promise.all([fetchGarments(), fetchClosetLocations()]); const categories = [...new Set(garments.map((item) => item.category))].map((value) => ({ value, label: MINI_CATEGORY_LABELS[value] || value })); this.setData({ garments, locations, locationById: Object.fromEntries(locations.map((item) => [item.id, item.name])), categories, loading: false }); this.apply(); } catch (error) { this.setData({ loading: false, error: error instanceof Error ? error.message : "搜索加载失败" }); } },
  updateQuery(this: any, event: WechatMiniprogram.InputEvent) { this.setData({ query: event.detail.value }); this.apply(); },
  chooseFilter(this: any, event: any) { this.setData({ [event.currentTarget.dataset.field]: event.currentTarget.dataset.value }); this.apply(); },
  useHistory(this: any, event: any) { this.setData({ query: event.currentTarget.dataset.value || "" }); this.applySearch(); },
  clearHistory() { wx.setStorageSync(HISTORY_KEY, []); this.setData({ history: [] }); },
  applySearch(this: any) { const query = String(this.data.query || "").trim(); if (query) { const history = [query, ...(this.data.history as string[]).filter((item) => item !== query)].slice(0, 10); wx.setStorageSync(HISTORY_KEY, history); this.setData({ history }); } this.apply(); },
  apply(this: any) { const query = String(this.data.query || "").trim().toLowerCase(); const results = (this.data.garments as MiniGarment[]).filter((item) => (this.data.scope === "all" || item.locationId === this.data.scope) && (this.data.category === "all" || item.category === this.data.category) && (!query || item.name.toLowerCase().includes(query) || item.colorNames.some((color) => color.includes(query)))); this.setData({ results }); },
  openDetail(event: any) { const id = event.detail?.id; if (id) wx.navigateTo({ url: `/pages/wardrobe/detail/index?id=${encodeURIComponent(id)}` }); },
});
