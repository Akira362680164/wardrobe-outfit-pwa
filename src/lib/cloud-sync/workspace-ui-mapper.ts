// workspace-ui-mapper.ts
// 账号工作区 DB 记录 → UI 模型转换（P0-N01）。
// 读取仍可在无工作区时降级到旧 Dexie，本文件仅处理工作区→UI 方向。

import type { AccountWorkspaceDatabase, WorkspaceAssetRecord, WorkspaceGarmentRecord, WorkspaceLocationRecord, WorkspaceOutfitPlanRecord, WorkspaceOutfitRecord, WorkspaceTripPlanRecord, WorkspaceWishlistItemRecord } from "@/lib/account-workspace-db";
import type { ClosetLocation, OutfitCalendarPlan, OutfitPlanEntry, PlanPackingChecklistItem, SavedOutfit, WardrobeItem, WishlistItem } from "@/lib/types";
import { resolveWorkspaceGarmentItemId } from "@/lib/cloud-sync/hash-workspace-id";
import type { CloudAssetReferenceMap } from "@/lib/cloud-sync/asset-bridge";
import type { AccountImageCache } from "@/lib/cloud-sync/image-cache";
import { resolveEntityImageFields } from "@/lib/cloud-sync/image-asset-resolver";

export interface WorkspaceUiSnapshot {
  items: WardrobeItem[];
  locations: ClosetLocation[];
  outfits: SavedOutfit[];
  wishlistItems: WishlistItem[];
  outfitPlanEntries: OutfitPlanEntry[];
  outfitCalendarPlans: OutfitCalendarPlan[];
  planPackingChecklistItems: PlanPackingChecklistItem[];
}

export async function readWorkspaceUiSnapshot(
  db: AccountWorkspaceDatabase,
  options: { imageCache?: Pick<AccountImageCache, "get" | "downloadAndCache"> } = {},
): Promise<WorkspaceUiSnapshot> {
  const [garments, locations, outfits, wishlistItems, _wearEvents, tripPlans, outfitPlans, assets] = await Promise.all([
    db.garments.filter(g => !g.deletedAt).toArray(),
    db.locations.filter(l => !l.deletedAt).toArray(),
    db.outfits.filter(o => !o.deletedAt).toArray(),
    db.wishlistItems.filter(w => !w.deletedAt).toArray(),
    db.wearEvents.filter(w => !w.deletedAt).toArray(),
    db.tripPlans.filter(t => !t.deletedAt).toArray(),
    db.outfitPlans.filter(p => !p.deletedAt).toArray(),
    db.assets.filter(a => !a.deletedAt).toArray(),
  ]);

  const uiItems = await Promise.all(garments.map((garment) => toWardrobeItem(garment, assets, options.imageCache)));
  const uiLocations = locations.map(toClosetLocation);
  const locationIdSet = new Set(uiLocations.map((l) => l.id));

  // ponytail: 孤儿衣物（locationId 不在任何已有衣橱中）自动承接默认衣橱
  const orphanLocationIds = new Set<string>();
  for (const item of uiItems) {
    if (item.locationId && !locationIdSet.has(item.locationId)) {
      orphanLocationIds.add(item.locationId);
    }
  }
  const now = new Date().toISOString();
  for (const orphanId of orphanLocationIds) {
    uiLocations.push({ id: orphanId, name: orphanId === "home" ? "默认衣橱" : orphanId, sortOrder: uiLocations.length + 1, createdAt: now, updatedAt: now });
  }

  const workspaceOutfitIdToLegacyId = new Map<string, string>();
  for (const o of outfits) {
    if (o.legacyOutfitId) workspaceOutfitIdToLegacyId.set(o.id, o.legacyOutfitId);
  }

  return {
    items: uiItems,
    locations: uiLocations,
    outfits: await Promise.all(outfits.map((outfit) => toSavedOutfit(outfit, assets, options.imageCache))),
    wishlistItems: await Promise.all(wishlistItems.map((wishlist) => toWishlistItem(wishlist, assets, options.imageCache))),
    outfitPlanEntries: outfitPlans.map((op) => toOutfitPlanEntry(op, workspaceOutfitIdToLegacyId)),
    outfitCalendarPlans: tripPlans.map(toOutfitCalendarPlan),
    planPackingChecklistItems: [], // ponytail: packingChecklistItems 暂不从工作区读，数据量少且强依赖旧结构
  };
}

async function toWardrobeItem(
  g: WorkspaceGarmentRecord,
  assets: WorkspaceAssetRecord[],
  imageCache?: Pick<AccountImageCache, "get" | "downloadAndCache">,
): Promise<WardrobeItem> {
  const p = (g.payload ?? {}) as Record<string, unknown>;
  const imageInputs = imageResolutionInputs("garment", g.id, assets, assetRefsOf(p), imageCache);
  const images = await resolveEntityImageFields({
    imageDataUrl: { ...imageInputs, fieldName: "imageDataUrl", variant: "original" },
    thumbnailDataUrl: { ...imageInputs, fieldName: "imageDataUrl", variant: "thumbnail" },
    sourceImageDataUrl: { ...imageInputs, fieldName: "sourceImageDataUrl", variant: "original" },
  });
  const referenceOutfitImages = await Promise.all(((p.referenceOutfitImages ?? []) as WardrobeItem["referenceOutfitImages"] ?? []).map(async (reference) => {
    const resolved = await resolveEntityImageFields({
      imageDataUrl: { ...imageInputs, fieldName: `referenceOutfitImages.${reference.id}.imageDataUrl`, variant: "original" },
      thumbnailDataUrl: { ...imageInputs, fieldName: `referenceOutfitImages.${reference.id}.imageDataUrl`, variant: "thumbnail" },
      sourceImageDataUrl: { ...imageInputs, fieldName: `referenceOutfitImages.${reference.id}.sourceImageDataUrl`, variant: "original" },
    });
    return { ...reference, imageDataUrl: resolved.imageDataUrl ?? "", sourceImageDataUrl: resolved.sourceImageDataUrl, thumbnailDataUrl: resolved.thumbnailDataUrl };
  }));
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
    imageDataUrl: images.imageDataUrl ?? "",
    sourceImageDataUrl: images.sourceImageDataUrl,
    thumbnailDataUrl: images.thumbnailDataUrl,
    cropBox: p.cropBox as WardrobeItem["cropBox"],
    subcategory: p.subcategory as string | undefined,
    wornDates: (p.wornDates ?? []) as string[],
    purchaseDate: p.purchaseDate as string | undefined,
    referenceOutfitImages,
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

async function toSavedOutfit(
  o: WorkspaceOutfitRecord,
  assets: WorkspaceAssetRecord[],
  imageCache?: Pick<AccountImageCache, "get" | "downloadAndCache">,
): Promise<SavedOutfit> {
  const p = (o.payload ?? {}) as Record<string, unknown>;
  const imageInputs = imageResolutionInputs("outfit", o.id, assets, assetRefsOf(p), imageCache);
  const images = await resolveEntityImageFields({
    coverImageDataUrl: { ...imageInputs, fieldName: "coverImageDataUrl", variant: "original" },
    previewImageDataUrl: { ...imageInputs, fieldName: "previewImageDataUrl", variant: "original" },
    sourceImageDataUrl: { ...imageInputs, fieldName: "sourceImageDataUrl", variant: "original" },
    thumbnailDataUrl: { ...imageInputs, fieldName: "coverImageDataUrl", variant: "thumbnail" },
    autoCoverImageDataUrl: { ...imageInputs, fieldName: "autoCoverImageDataUrl", variant: "original" },
  });
  const outfitRealImages = await Promise.all(((p.outfitRealImages ?? []) as NonNullable<SavedOutfit["outfitRealImages"]>).map(async (realImage) => {
    const resolved = await resolveEntityImageFields({
      imageDataUrl: { ...imageInputs, fieldName: `outfitRealImages.${realImage.id}.imageDataUrl`, variant: "original" },
      thumbnailDataUrl: { ...imageInputs, fieldName: `outfitRealImages.${realImage.id}.imageDataUrl`, variant: "thumbnail" },
    });
    return { ...realImage, imageDataUrl: resolved.imageDataUrl ?? "", thumbnailDataUrl: resolved.thumbnailDataUrl };
  }));
  return {
    id: o.legacyOutfitId ?? o.id,
    name: (o.name ?? p.name ?? "") as string,
    itemIds: ((p.legacyItemIds ?? p.itemIds ?? []) as number[]),
    coverImageDataUrl: images.coverImageDataUrl,
    previewImageDataUrl: images.previewImageDataUrl,
    destination: p.destination as string | undefined,
    activity: p.activity as string | undefined,
    style: p.style as string | undefined,
    source: (p.source ?? "manual") as SavedOutfit["source"],
    favorite: (p.favorite ?? false) as boolean,
    createdAt: (p.createdAt ?? o.createdAt) as string,
    updatedAt: (p.updatedAt ?? o.updatedAt) as string,
    sourceImageDataUrl: images.sourceImageDataUrl,
    thumbnailDataUrl: images.thumbnailDataUrl,
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
    outfitRealImages,
    autoCoverImageDataUrl: images.autoCoverImageDataUrl,
    aiSuggestion: p.aiSuggestion as SavedOutfit["aiSuggestion"],
  };
}

async function toWishlistItem(
  w: WorkspaceWishlistItemRecord,
  assets: WorkspaceAssetRecord[],
  imageCache?: Pick<AccountImageCache, "get" | "downloadAndCache">,
): Promise<WishlistItem> {
  const p = (w.payload ?? {}) as Record<string, unknown>;
  const imageInputs = imageResolutionInputs("wishlistItem", w.id, assets, assetRefsOf(p), imageCache);
  const images = await resolveEntityImageFields({
    imageDataUrl: { ...imageInputs, fieldName: "imageDataUrl", variant: "original" },
    thumbnailDataUrl: { ...imageInputs, fieldName: "imageDataUrl", variant: "thumbnail" },
    sourceImageDataUrl: { ...imageInputs, fieldName: "sourceImageDataUrl", variant: "original" },
  });
  return {
    id: w.legacyWishlistId ?? w.id,
    name: (p.name ?? "") as string,
    imageDataUrl: images.imageDataUrl ?? "",
    sourceImageDataUrl: images.sourceImageDataUrl,
    thumbnailDataUrl: images.thumbnailDataUrl,
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

function assetRefsOf(payload: Record<string, unknown>): CloudAssetReferenceMap | undefined {
  const refs = payload.cloudAssetRefs;
  return refs && typeof refs === "object" && !Array.isArray(refs) ? refs as CloudAssetReferenceMap : undefined;
}

function imageResolutionInputs(
  ownerEntityType: "garment" | "wishlistItem" | "outfit",
  ownerEntityId: string,
  assets: WorkspaceAssetRecord[],
  assetRefs: CloudAssetReferenceMap | undefined,
  imageCache: Pick<AccountImageCache, "get" | "downloadAndCache"> | undefined,
) {
  return { assets, ownerEntityType, ownerEntityId, assetRefs, imageCache };
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
