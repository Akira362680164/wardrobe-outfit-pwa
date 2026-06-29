// workspace-ui-mapper.ts
// 账号工作区 DB 记录 → UI 模型转换（P0-N01）。
// 读取仍可在无工作区时降级到旧 Dexie，本文件仅处理工作区→UI 方向。

import type { AccountWorkspaceDatabase, WorkspaceAssetRecord, WorkspaceGarmentRecord, WorkspaceLocationRecord, WorkspaceOutfitPlanRecord, WorkspaceOutfitRecord, WorkspaceTripPlanRecord, WorkspaceWishlistItemRecord } from "@/lib/account-workspace-db";
import type { ClosetLocation, OutfitCalendarPlan, OutfitPlanEntry, PlanPackingChecklistItem, SavedOutfit, WardrobeItem, WishlistItem } from "@/lib/types";
import { resolveWorkspaceGarmentItemId } from "@/lib/cloud-sync/hash-workspace-id";

interface AssetImageBundle {
  original?: string;
  thumbnail?: string;
  _updatedAt?: string;
}

type AssetIndex = Map<string, AssetImageBundle>;

function readAssetBundle(asset: WorkspaceAssetRecord): AssetImageBundle {
  const payload = (asset.payload ?? {}) as Record<string, unknown>;
  const uploads = (payload.uploads ?? {}) as Record<string, unknown>;
  const originalUpload = (uploads.original ?? {}) as { dataUrl?: string };
  const thumbnailUpload = (uploads.thumbnail ?? {}) as { dataUrl?: string };
  return {
    ...(typeof originalUpload.dataUrl === "string" ? { original: originalUpload.dataUrl } : {}),
    ...(typeof thumbnailUpload.dataUrl === "string" ? { thumbnail: thumbnailUpload.dataUrl } : {}),
    _updatedAt: asset.updatedAt,
  };
}

function readAssetFieldName(asset: WorkspaceAssetRecord): string | undefined {
  const payload = (asset.payload ?? {}) as Record<string, unknown>;
  const source = (payload.source ?? {}) as { fieldName?: unknown };
  return typeof source.fieldName === "string" ? source.fieldName : undefined;
}

export function buildAssetIndex(assets: WorkspaceAssetRecord[]): AssetIndex {
  const index: AssetIndex = new Map();
  for (const asset of assets) {
    if (asset.deletedAt) continue;
    if (asset.ownerEntityType !== "garment" && asset.ownerEntityType !== "wishlistItem" && asset.ownerEntityType !== "outfit") continue;
    const fieldName = readAssetFieldName(asset);
    if (!fieldName) continue;
    const bundle = readAssetBundle(asset);
    if (!bundle.original && !bundle.thumbnail) continue;
    const key = asset.ownerEntityType + "::" + asset.ownerEntityId + "::" + fieldName;
    const existing = index.get(key);
    if (!existing) {
      index.set(key, bundle);
      continue;
    }
    if (asset.updatedAt && existing._updatedAt && asset.updatedAt > existing._updatedAt) {
      index.set(key, bundle);
    }
  }
  return index;
}

export function pickAssetImage(index: AssetIndex, ownerEntityType: "garment" | "wishlistItem" | "outfit", ownerEntityId: string, fieldName: string): AssetImageBundle | undefined {
  return index.get(ownerEntityType + "::" + ownerEntityId + "::" + fieldName);
}

function hydrateGarmentImages(index: AssetIndex, g: WorkspaceGarmentRecord): { imageDataUrl: string; thumbnailDataUrl?: string } {
  // v2.0.12-test: 只读当前资产架构 (imageAssetInputsForGarment 生成的 imageDataUrl 键)，
  // 不再从 entity.payload 兜底任何 base64 字段。资产缺失时返回空字符串。
  const main = pickAssetImage(index, "garment", g.id, "imageDataUrl");
  return {
    imageDataUrl: main?.original ?? "",
    thumbnailDataUrl: main?.thumbnail,
  };
}

function hydrateWishlistImages(index: AssetIndex, w: WorkspaceWishlistItemRecord): { imageDataUrl: string; thumbnailDataUrl?: string } {
  // v2.0.12-test: 只读当前资产架构 (imageAssetInputsForWishlist 生成的 imageDataUrl 键)。
  const main = pickAssetImage(index, "wishlistItem", w.id, "imageDataUrl");
  return {
    imageDataUrl: main?.original ?? "",
    thumbnailDataUrl: main?.thumbnail,
  };
}

function hydrateOutfitImages(index: AssetIndex, o: WorkspaceOutfitRecord): {
  coverImageDataUrl?: string;
  previewImageDataUrl?: string;
  sourceImageDataUrl?: string;
  thumbnailDataUrl?: string;
  autoCoverImageDataUrl?: string;
  outfitRealImages: SavedOutfit["outfitRealImages"];
} {
  // v2.0.12-test: 只读当前资产架构 (imageAssetInputsForOutfit 生成的键)；
  // outfitRealImages 仅保留 id + 来自资产的数据，丢失原 payload 字段。
  const cover = pickAssetImage(index, "outfit", o.id, "coverImageDataUrl");
  const preview = pickAssetImage(index, "outfit", o.id, "previewImageDataUrl");
  const autoCover = pickAssetImage(index, "outfit", o.id, "autoCoverImageDataUrl");
  const source = pickAssetImage(index, "outfit", o.id, "sourceImageDataUrl");
  // outfitRealImages 的 id 列表从相邻 outfitItems 派生。
  const realIds = collectOutfitRealImageIds(o);
  const now = o.updatedAt ?? new Date().toISOString();
  return {
    coverImageDataUrl: cover?.original,
    previewImageDataUrl: preview?.original,
    sourceImageDataUrl: source?.original,
    thumbnailDataUrl: cover?.thumbnail ?? preview?.thumbnail ?? autoCover?.thumbnail,
    autoCoverImageDataUrl: autoCover?.original,
    outfitRealImages: realIds.map((id) => {
      const realAsset = pickAssetImage(index, "outfit", o.id, `outfitRealImages.${id}.imageDataUrl`);
      return {
        id,
        imageDataUrl: realAsset?.original ?? "",
        thumbnailDataUrl: realAsset?.thumbnail,
        createdAt: realAsset?._updatedAt ?? now,
        updatedAt: realAsset?._updatedAt ?? now,
      };
    }),
  };
}

function collectOutfitRealImageIds(o: WorkspaceOutfitRecord): string[] {
  // outfitRealImages 的 id 列表已经从 entity payload 移出（资产架构下每个实拍图只对应一个 asset），
  // 这里从 db.outfitItems 派生；当前调用点不查 db，因此本函数返回 []，UI 模型仅含主图相关资产。
  // 注意：outfitRealImages 在当前资产架构下暂时不再随 UI snapshot 返回（已迁移到 outbox + asset 单独维护）。
  void o;
  return [];
}


export interface WorkspaceUiSnapshot {
  items: WardrobeItem[];
  locations: ClosetLocation[];
  outfits: SavedOutfit[];
  wishlistItems: WishlistItem[];
  outfitPlanEntries: OutfitPlanEntry[];
  outfitCalendarPlans: OutfitCalendarPlan[];
  planPackingChecklistItems: PlanPackingChecklistItem[];
}

export async function readWorkspaceUiSnapshot(db: AccountWorkspaceDatabase): Promise<WorkspaceUiSnapshot> {
  const [garments, locations, outfits, wishlistItems, _wearEvents, tripPlans, outfitPlans, assets] = await Promise.all([
    db.garments.filter(g => !g.deletedAt).toArray(),
    db.locations.filter(l => !l.deletedAt).toArray(),
    db.outfits.filter(o => !o.deletedAt).toArray(),
    db.wishlistItems.filter(w => !w.deletedAt).toArray(),
    db.wearEvents.filter(w => !w.deletedAt).toArray(),
    db.tripPlans.filter(t => !t.deletedAt).toArray(),
    db.outfitPlans.filter(p => !p.deletedAt).toArray(),
    db.assets.toArray(),
  ]);
  const assetIndex = buildAssetIndex(assets);

  const uiItems = garments.map((g) => toWardrobeItem(g, assetIndex));
  const uiLocations = locations.map(toClosetLocation);
  const locationIdSet = new Set(uiLocations.map((l) => l.id));

  // ponytail: 孤儿衣物（locationId 不在任何已有衣橱中）自动承接"home"默认衣橱；
  // 不再为孤儿 locationId 创建新衣橱（避免重复"默认衣橱"）。
  const homeLocation = uiLocations.find((l) => l.id === "home");
  const now = new Date().toISOString();
  if (!homeLocation) {
    uiLocations.push({ id: "home", name: "默认衣橱", note: "默认衣橱", sortOrder: 1, createdAt: now, updatedAt: now });
  }
  const defaultLocationId = homeLocation?.id ?? "home";
  for (const item of uiItems) {
    if (item.locationId && !locationIdSet.has(item.locationId)) {
      // 把孤儿衣物的 locationId 重定向到默认衣橱，避免在 UI 上产生第二个衣橱
      item.locationId = defaultLocationId;
    }
  }

  const workspaceOutfitIdToLegacyId = new Map<string, string>();
  for (const o of outfits) {
    if (o.legacyOutfitId) workspaceOutfitIdToLegacyId.set(o.id, o.legacyOutfitId);
  }

  return {
    items: uiItems,
    locations: dedupeLocations(uiLocations),
    outfits: outfits.map((o) => toSavedOutfit(o, assetIndex)),
    wishlistItems: wishlistItems.map((w) => toWishlistItem(w, assetIndex)),
    outfitPlanEntries: outfitPlans.map((op) => toOutfitPlanEntry(op, workspaceOutfitIdToLegacyId)),
    outfitCalendarPlans: tripPlans.map(toOutfitCalendarPlan),
    planPackingChecklistItems: [],
  };
}

function toWardrobeItem(g: WorkspaceGarmentRecord, assetIndex: AssetIndex): WardrobeItem {
  const p = (g.payload ?? {}) as Record<string, unknown>;
  const hydrated = hydrateGarmentImages(assetIndex, g);
  return {
    id: resolveWorkspaceGarmentItemId(g),
    locationId: (g.locationId ?? p.locationId ?? "home") as string,
    name: (g.name ?? p.name ?? "") as string,
    status: (p.status ?? "active") as WardrobeItem["status"],
    category: (p.category ?? "tops") as WardrobeItem["category"],
    colors: (p.colors ?? { mode: "single", primary: "#000000" }) as WardrobeItem["colors"],
    seasons: (p.seasons ?? []) as WardrobeItem["seasons"],
    styles: (p.styles ?? []) as WardrobeItem["styles"],
    formality: p.formality as number | undefined,
    warmth: p.warmth as number | undefined,
    temperatureRange: p.temperatureRange as WardrobeItem["temperatureRange"],
    material: p.material as string | undefined,
    fitGender: p.fitGender as WardrobeItem["fitGender"],
    fitNotes: p.fitNotes as string | undefined,
    notes: p.notes as string | undefined,
    price: p.price as number | undefined,
    productUrl: p.productUrl as string | undefined,
    imageDataUrl: hydrated.imageDataUrl,
    // sourceImageDataUrl 字段在当前资产架构下不存 asset 键（garment 的 imageAssetInputsForGarment
    // 只生成 imageDataUrl）；UI 端已自行回退到 imageDataUrl（见 garment-detail-3.0.tsx）。
    sourceImageDataUrl: undefined,
    thumbnailDataUrl: hydrated.thumbnailDataUrl,
    cropBox: p.cropBox as WardrobeItem["cropBox"],
    subcategory: p.subcategory as string | undefined,
    wornDates: (p.wornDates ?? []) as string[],
    purchaseDate: p.purchaseDate as string | undefined,
    referenceOutfitImages: p.referenceOutfitImages as WardrobeItem["referenceOutfitImages"],
    aiStyleAdvice: p.aiStyleAdvice as WardrobeItem["aiStyleAdvice"],
    aiConfidence: p.aiConfidence as number | undefined,
    needsReview: p.needsReview as boolean | undefined,
    thumbnailVersion: p.thumbnailVersion as number | undefined,
    thumbnailUpdatedAt: p.thumbnailUpdatedAt as string | undefined,
    thumbnailStatus: p.thumbnailStatus as WardrobeItem["thumbnailStatus"],
    createdAt: (p.createdAt ?? g.createdAt) as string,
    updatedAt: (p.updatedAt ?? g.updatedAt) as string,
  };
}

function toClosetLocation(l: WorkspaceLocationRecord): ClosetLocation {
  const p = (l.payload ?? {}) as Record<string, unknown>;
  return {
    id: typeof p.dexieId === "string" && p.dexieId ? p.dexieId : l.id,
    name: (l.name ?? p.name ?? "") as string,
    note: (l.note ?? p.note) as string | undefined,
    sortOrder: (l.sortOrder ?? p.sortOrder ?? 0) as number,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

function toSavedOutfit(o: WorkspaceOutfitRecord, assetIndex: AssetIndex): SavedOutfit {
  const p = (o.payload ?? {}) as Record<string, unknown>;
  const hydrated = hydrateOutfitImages(assetIndex, o);
  return {
    id: o.legacyOutfitId ?? o.id,
    name: (o.name ?? p.name ?? "") as string,
    itemIds: ((p.legacyItemIds ?? p.itemIds ?? []) as number[]),
    coverImageDataUrl: hydrated.coverImageDataUrl,
    previewImageDataUrl: hydrated.previewImageDataUrl,
    destination: p.destination as string | undefined,
    activity: p.activity as string | undefined,
    style: p.style as string | undefined,
    source: (p.source ?? "manual") as SavedOutfit["source"],
    favorite: (p.favorite ?? false) as boolean,
    createdAt: (p.createdAt ?? o.createdAt) as string,
    updatedAt: (p.updatedAt ?? o.updatedAt) as string,
    sourceImageDataUrl: hydrated.sourceImageDataUrl,
    thumbnailDataUrl: hydrated.thumbnailDataUrl,
    thumbnailVersion: p.thumbnailVersion as number | undefined,
    thumbnailUpdatedAt: p.thumbnailUpdatedAt as string | undefined,
    thumbnailStatus: p.thumbnailStatus as "ready" | "failed" | undefined,
    seasons: p.seasons as SavedOutfit["seasons"],
    sceneTags: p.sceneTags as string[] | undefined,
    styleTags: p.styleTags as string[] | undefined,
    pairingTags: p.pairingTags as string[] | undefined,
    temperatureRange: p.temperatureRange as SavedOutfit["temperatureRange"],
    notes: p.notes as string | undefined,
    wornDates: p.wornDates as string[] | undefined,
    outfitRealImages: hydrated.outfitRealImages,
    autoCoverImageDataUrl: hydrated.autoCoverImageDataUrl,
    aiSuggestion: p.aiSuggestion as SavedOutfit["aiSuggestion"],
  };
}

function toWishlistItem(w: WorkspaceWishlistItemRecord, assetIndex: AssetIndex): WishlistItem {
  const p = (w.payload ?? {}) as Record<string, unknown>;
  const hydrated = hydrateWishlistImages(assetIndex, w);
  return {
    id: w.legacyWishlistId ?? w.id,
    name: (p.name ?? "") as string,
    imageDataUrl: hydrated.imageDataUrl,
    sourceImageDataUrl: undefined,
    thumbnailDataUrl: hydrated.thumbnailDataUrl,
    cropBox: p.cropBox as WishlistItem["cropBox"],
    category: (p.category ?? "tops") as WishlistItem["category"],
    subcategory: p.subcategory as string | undefined,
    colors: (p.colors ?? { mode: "single", primary: "#000000" }) as WishlistItem["colors"],
    seasons: (p.seasons ?? []) as WishlistItem["seasons"],
    styles: (p.styles ?? []) as WishlistItem["styles"],
    formality: p.formality as number | undefined,
    warmth: p.warmth as number | undefined,
    temperatureRange: p.temperatureRange as WishlistItem["temperatureRange"],
    material: p.material as string | undefined,
    fitGender: p.fitGender as WishlistItem["fitGender"],
    fitNotes: p.fitNotes as string | undefined,
    notes: p.notes as string | undefined,
    price: p.price as number | undefined,
    productUrl: p.productUrl as string | undefined,
    status: (w.status ?? p.status ?? "interested") as WishlistItem["status"],
    convertedItemId: p.convertedItemId as number | undefined,
    convertedAt: p.convertedAt as string | undefined,
    convertedItemDeletedAt: p.convertedItemDeletedAt as string | undefined,
    aiAssessment: p.aiAssessment as WishlistItem["aiAssessment"],
    createdAt: (p.createdAt ?? w.createdAt) as string,
    updatedAt: (p.updatedAt ?? w.updatedAt) as string,
  };
}

function toOutfitCalendarPlan(t: WorkspaceTripPlanRecord): OutfitCalendarPlan {
  const p = (t.payload ?? {}) as Record<string, unknown>;
  return {
    id: t.legacyCalendarPlanId ?? t.id,
    type: (p.type ?? "custom") as OutfitCalendarPlan["type"],
    title: (t.title ?? p.title ?? "") as string,
    startDate: (t.startDate ?? p.startDate ?? "") as string,
    endDate: (t.endDate ?? p.endDate ?? "") as string,
    tone: (p.tone ?? "slate") as OutfitCalendarPlan["tone"],
    destination: p.destination as string | undefined,
    activities: p.activities as string[] | undefined,
    weatherNote: p.weatherNote as string | undefined,
    notes: p.notes as string | undefined,
    packingEnabled: p.packingEnabled as boolean | undefined,
    aiSummary: p.aiSummary as string | undefined,
    createdAt: (p.createdAt ?? t.createdAt) as string,
    updatedAt: (p.updatedAt ?? t.updatedAt) as string,
  };
}

function toOutfitPlanEntry(op: WorkspaceOutfitPlanRecord, workspaceOutfitIdToLegacyId: Map<string, string>): OutfitPlanEntry {
  const p = (op.payload ?? {}) as Record<string, unknown>;
  const rawOutfitId = (op.outfitId ?? p.outfitId) as string | undefined;
  const rawActualOutfitId = p.actualOutfitId as string | undefined;
  return {
    id: op.legacyPlanEntryId ?? op.id,
    date: (op.date ?? p.date ?? "") as string,
    outfitId: rawOutfitId ? (workspaceOutfitIdToLegacyId.get(rawOutfitId) ?? rawOutfitId) : undefined,
    itemIds: p.itemIds as number[] | undefined,
    calendarPlanId: (op.tripPlanId ?? p.calendarPlanId) as string | undefined,
    title: p.title as string | undefined,
    scene: p.scene as string | undefined,
    weatherNote: p.weatherNote as string | undefined,
    status: (p.status ?? "planned") as OutfitPlanEntry["status"],
    wornDateLinked: p.wornDateLinked as string | undefined,
    actualOutfitId: rawActualOutfitId ? (workspaceOutfitIdToLegacyId.get(rawActualOutfitId) ?? rawActualOutfitId) : undefined,
    notes: p.notes as string | undefined,
    isPrimary: p.isPrimary as boolean | undefined,
    sortOrder: p.sortOrder as number | undefined,
    role: p.role as OutfitPlanEntry["role"],
    isPrimaryActual: p.isPrimaryActual as boolean | undefined,
    wearOrigin: p.wearOrigin as OutfitPlanEntry["wearOrigin"],
    plannedBeforeWorn: p.plannedBeforeWorn as boolean | undefined,
    createdAt: (p.createdAt ?? op.createdAt) as string,
    updatedAt: (p.updatedAt ?? op.updatedAt) as string,
  };
}

function dedupeLocations(locations: ClosetLocation[]): ClosetLocation[] {
  const groups = new Map<string, ClosetLocation[]>();
  for (const l of locations) {
    const arr = groups.get(l.id) ?? [];
    arr.push(l);
    groups.set(l.id, arr);
  }
  const result: ClosetLocation[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    const keep = group.reduce((acc, cur) => {
      if (cur.sortOrder !== acc.sortOrder) return cur.sortOrder < acc.sortOrder ? cur : acc;
      return cur.updatedAt > acc.updatedAt ? cur : acc;
    });
    result.push(keep);
  }
  return result.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
}

