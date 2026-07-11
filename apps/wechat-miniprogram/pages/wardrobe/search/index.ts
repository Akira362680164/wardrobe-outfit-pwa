import { MINI_CATEGORY_LABELS } from "../../../generated/catalogs";
import { fetchClosetLocations, fetchGarments, type MiniClosetLocation, type MiniGarment } from "../../../services/workspace";

let searchHistory: string[] = [];

Page({
  data: { loading: false, error: "", query: "", scope: "all", category: "all", garments: [] as MiniGarment[], results: [] as MiniGarment[], locations: [] as MiniClosetLocation[], categories: [] as Array<{ value: string; label: string }>, history: [] as string[] },
  onLoad(this: any, query?: { scope?: string; category?: string }) { this.setData({ scope: query?.scope || "all", category: query?.category || "all", history: searchHistory }); void this.load(); },
  async load(this: any) { this.setData({ loading: true, error: "" }); try { const [garments, locations] = await Promise.all([fetchGarments(), fetchClosetLocations()]); const categories = [...new Set(garments.map((item) => item.category))].map((value) => ({ value, label: MINI_CATEGORY_LABELS[value] || value })); this.setData({ garments, locations, categories, loading: false }); this.apply(); } catch (error) { this.setData({ loading: false, error: error instanceof Error ? error.message : "搜索加载失败" }); } },
  updateQuery(this: any, event: WechatMiniprogram.InputEvent) { this.setData({ query: event.detail.value }); this.apply(); },
  chooseFilter(this: any, event: any) { const field = event.currentTarget.dataset.field; const value = event.currentTarget.dataset.value; this.setData({ [field]: value }); this.apply(); },
  useHistory(this: any, event: any) { this.setData({ query: event.currentTarget.dataset.value || "" }); this.apply(); },
  clearHistory() { searchHistory = []; this.setData({ history: [] }); },
  apply(this: any) { const query = String(this.data.query || "").trim().toLowerCase(); const results = (this.data.garments as MiniGarment[]).filter((item) => (this.data.scope === "all" || item.locationId === this.data.scope) && (this.data.category === "all" || item.category === this.data.category) && (!query || [item.name, item.categoryLabel, item.subcategoryLabel, item.colorText, item.styleLabels.join(" ")].join(" ").toLowerCase().includes(query))); if (query && !searchHistory.includes(query)) searchHistory = [query, ...searchHistory].slice(0, 8); this.setData({ results, history: searchHistory }); },
  openDetail(event: any) { const id = event.detail?.id; if (id) wx.navigateTo({ url: `/pages/wardrobe/detail/index?id=${encodeURIComponent(id)}` }); },
});
