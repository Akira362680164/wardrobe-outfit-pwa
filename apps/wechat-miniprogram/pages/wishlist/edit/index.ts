import {
  fetchWishlistDetail,
  updateWishlistItem,
  WARDROBE_COLOR_CATALOG,
  type MiniWishlistDetail,
} from "../../../services/workspace";
import { buildSubcategoryChoices, CATEGORY_OPTIONS, isSubcategoryInCategory } from "../../../services/category-catalog";
import { MINI_SEASON_CATALOG, MINI_STYLE_CATALOG, MINI_WISHLIST_STATUS_LABELS } from "../../../generated/catalogs";

const COLOR_MODES = [
  { value: "single", label: "单主色" },
  { value: "main_with_accent", label: "主辅色" },
  { value: "multicolor", label: "拼色" },
];

const STATUSES = Object.entries(MINI_WISHLIST_STATUS_LABELS)
  .filter(([value]) => value !== "purchased")
  .map(([value, label]) => ({ value, label }));

const FIT_GENDERS = [
  { value: "unisex", label: "中性" },
  { value: "menswear", label: "男装" },
  { value: "womenswear", label: "女装" },
  { value: "unknown", label: "未判断" },
];

Page({
  data: {
    loading: false,
    saving: false,
    item: null as MiniWishlistDetail | null,
    error: "",
    colorOptions: WARDROBE_COLOR_CATALOG.map((item) => ({ ...item, style: `background:${item.bg}; border:${"border" in item ? item.border : "0"}` })),
    categories: CATEGORY_OPTIONS,
    subcategoryOptions: buildSubcategoryChoices("tops"),
    colorModes: COLOR_MODES,
    seasonsOptions: buildChoices(MINI_SEASON_CATALOG, []),
    styleOptions: buildChoices(MINI_STYLE_CATALOG, []),
    statusOptions: STATUSES,
    fitGenderOptions: FIT_GENDERS,
    name: "",
    category: "tops",
    subcategory: "",
    colorMode: "single",
    primaryColor: "黑",
    accentColor: "",
    seasons: [] as string[],
    styles: [] as string[],
    status: "interested",
    minTemp: 10,
    maxTemp: 25,
    formality: 3,
    warmth: 2,
    material: "",
    fitGender: "unisex",
    fitNotes: "",
    price: "",
    productUrl: "",
    notes: "",
  },

  onLoad(this: any, query?: { id?: string }) {
    wx.setNavigationBarTitle({ title: query?.id ? "编辑种草" : "新增种草" });
    if (query?.id) void this.load(query.id);
    else wx.redirectTo({ url: "/pages/intake/camera/index?kind=wishlist" });
  },

  async load(this: any, id: string) {
    this.setData({ loading: true, error: "" });
    try {
      const item = await fetchWishlistDetail(id);
      const statusOptions = item.status === "purchased" ? [{ value: "purchased", label: "已购买" }, ...STATUSES] : STATUSES;
      const category = CATEGORY_OPTIONS.some((option) => option.value === item.category) ? item.category : "tops";
      const subcategory = isSubcategoryInCategory(category, item.subcategory) ? item.subcategory : "";
      this.setData({
        loading: false,
        item,
        statusOptions,
        name: item.name,
        category,
        subcategory,
        subcategoryOptions: buildSubcategoryChoices(category, subcategory),
        colorMode: item.colorMode || "single",
        primaryColor: item.primaryColorChips[0]?.name || item.colorNames[0] || "黑",
        accentColor: item.accentColorChips[0]?.name || item.colorNames[1] || "",
        seasons: item.seasons,
        seasonsOptions: buildChoices(MINI_SEASON_CATALOG, item.seasons),
        styles: item.styles,
        styleOptions: buildChoices(MINI_STYLE_CATALOG, item.styles),
        status: item.status,
        minTemp: item.temperatureRange.minC ?? 10,
        maxTemp: item.temperatureRange.maxC ?? 25,
        formality: item.formality ?? 3,
        warmth: item.warmth ?? 2,
        material: item.material,
        fitGender: item.fitGender || "unisex",
        fitNotes: item.fitNotes,
        price: item.price !== undefined ? String(item.price) : "",
        productUrl: item.productUrl,
        notes: item.notes === "无备注" ? "" : item.notes,
      });
    } catch (error) {
      this.setData({ loading: false, error: error instanceof Error ? error.message : "读取种草失败" });
    }
  },

  updateField(this: any, event: WechatMiniprogram.InputEvent) {
    const field = (event as unknown as { currentTarget?: { dataset?: { field?: string } } }).currentTarget?.dataset?.field;
    if (typeof field === "string") this.setData({ [field]: event.detail.value });
  },

  chooseValue(this: any, event: any) {
    const field = event.currentTarget.dataset.field;
    const value = event.currentTarget.dataset.value;
    if (typeof field === "string" && typeof value === "string") this.setData({ [field]: value });
  },

  chooseCategory(this: any, event: any) {
    const value = event.currentTarget.dataset.value;
    if (typeof value !== "string") return;
    const nextCategory = CATEGORY_OPTIONS.some((option) => option.value === value) ? value : "tops";
    const subcategory = nextCategory === this.data.category ? this.data.subcategory : "";
    this.setData({
      category: nextCategory,
      subcategory,
      subcategoryOptions: buildSubcategoryChoices(nextCategory, subcategory),
    });
  },

  chooseSubcategory(this: any, event: any) {
    const value = event.currentTarget.dataset.value;
    const next = typeof value === "string" && isSubcategoryInCategory(this.data.category, value) ? value : "";
    const subcategory = next === this.data.subcategory ? "" : next;
    this.setData({
      subcategory,
      subcategoryOptions: buildSubcategoryChoices(this.data.category, subcategory),
    });
  },

  chooseColor(this: any, event: any) {
    const role = event.currentTarget.dataset.role;
    const value = event.currentTarget.dataset.value;
    if (typeof value !== "string") return;
    this.setData(role === "accent" ? { accentColor: value } : { primaryColor: value });
  },

  toggleArray(this: any, event: any) {
    const field = event.currentTarget.dataset.field;
    const value = event.currentTarget.dataset.value;
    if (typeof field !== "string" || typeof value !== "string") return;
    const current = Array.isArray(this.data[field]) ? this.data[field] as string[] : [];
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    const optionKey = field === "seasons" ? "seasonsOptions" : field === "styles" ? "styleOptions" : "";
    const source = field === "seasons" ? MINI_SEASON_CATALOG : field === "styles" ? MINI_STYLE_CATALOG : [];
    this.setData({ [field]: next, ...(optionKey ? { [optionKey]: buildChoices(source, next) } : {}) });
  },

  updateNumber(this: any, event: any) {
    const field = event.currentTarget.dataset.field;
    const value = Number(event.detail.value);
    if (typeof field === "string" && Number.isFinite(value)) this.setData({ [field]: value });
  },

  async save(this: any) {
    const item = this.data.item as MiniWishlistDetail | null;
    if (!item || this.data.saving) return;
    const name = this.data.name.trim();
    if (!name) {
      wx.showToast({ title: "先填写商品名称", icon: "none" });
      return;
    }
    const priceText = this.data.price.trim();
    const price = priceText ? Number(priceText) : undefined;
    if (priceText && (!Number.isFinite(price) || (price ?? 0) < 0)) {
      wx.showToast({ title: "价格格式不正确", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    try {
      await updateWishlistItem({
        id: item.id,
        expectedRevision: item.revision,
        currentPayload: item.rawPayload,
        name,
        category: this.data.category,
        subcategory: this.data.subcategory.trim() || undefined,
        colors: buildColors(this.data.colorMode, this.data.primaryColor, this.data.accentColor),
        seasons: this.data.seasons,
        styles: this.data.styles,
        temperatureRange: { minC: Number(this.data.minTemp), maxC: Number(this.data.maxTemp) },
        formality: Number(this.data.formality),
        warmth: Number(this.data.warmth),
        material: this.data.material.trim() || undefined,
        fitGender: this.data.fitGender,
        fitNotes: this.data.fitNotes.trim() || undefined,
        price,
        productUrl: this.data.productUrl.trim() || undefined,
        status: this.data.status,
        notes: this.data.notes.trim() || undefined,
        aiTag: item.rawPayload.aiRecognition as Record<string, unknown> | undefined,
      });
      wx.showToast({ title: "已保存", icon: "success" });
      wx.redirectTo({ url: `/pages/wishlist/detail/index?id=${encodeURIComponent(item.id)}` });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "保存失败", icon: "none" });
      this.setData({ saving: false });
    }
  },
});

function buildColors(mode: string, primary: string, accent: string): Record<string, unknown> {
  const safePrimary = primary || "未标注";
  const accents = accent ? [accent] : [];
  if (mode === "main_with_accent") return { mode, primary: safePrimary, accents };
  if (mode === "multicolor") return { mode, primaries: [safePrimary, ...accents] };
  return { mode: "single", primary: safePrimary };
}

function buildChoices(options: ReadonlyArray<{ value: string; label: string }>, selected: string[]) {
  return options.map((option) => ({ ...option, selected: selected.includes(option.value) }));
}
