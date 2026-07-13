import { fetchGarments, fetchOutfits, fetchWishlist } from "../../../services/workspace";
import { buildStatistics } from "../../../utils/wear-statistics";

Page({
  data: { loading: false, error: "", monthLabel: "", itemCount: 0, outfitCount: 0, monthlyOutfitCount: 0, monthlyOutfitEvents: 0, monthlyItemCount: 0, monthlyItemEvents: 0, idleCount: 0, recentRows: [], idleRows: [], purchaseRows: [] },
  onLoad(this: any) { void this.load(); },
  async load(this: any) { this.setData({ loading: true, error: "" }); try { const [items, outfits, wishlist] = await Promise.all([fetchGarments(), fetchOutfits(), fetchWishlist()]); this.setData(buildStatistics(items, outfits, wishlist)); } catch (error) { this.setData({ loading: false, error: error instanceof Error ? error.message : "统计读取失败" }); } },
});
