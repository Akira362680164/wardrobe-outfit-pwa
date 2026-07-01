"use client";

import {
  WorkspaceDetailResponseSchema,
  WorkspaceListResponseSchema,
  WorkspaceOverviewResponseSchema,
  WorkspaceWearSummaryResponseSchema,
  type WorkspaceEntity,
  type WorkspaceEntityKind,
  type WorkspaceListResponse,
  type WorkspaceWearSummaryResponse,
} from "@wardrobe/cloud-contracts";

import type { AuthSessionSnapshot } from "@/lib/auth-session-store";
import { OnlineImageClient } from "@/lib/online/online-image-client";
import { onlineRequest } from "@/lib/online/online-request";
import { normalizeTemperatureRange } from "@/lib/temperature-range";
import type {
  ClosetLocation,
  CroppedImageReference,
  GarmentCropBox,
  ImageAssetReference,
  OutfitCalendarPlan,
  OutfitPlanEntry,
  PlanPackingChecklistItem,
  SavedOutfit,
  TryOnProfile,
  WardrobeItem,
  WishlistItem,
} from "@/lib/types";

export interface OnlineWorkspaceSnapshot {
  items: WardrobeItem[];
  locations: ClosetLocation[];
  outfits: SavedOutfit[];
  wishlistItems: WishlistItem[];
  outfitPlanEntries: OutfitPlanEntry[];
  outfitCalendarPlans: OutfitCalendarPlan[];
  planPackingChecklistItems: PlanPackingChecklistItem[];
  tryOnProfile?: TryOnProfile;
  serverRevision: number;
  requestId?: string;
}

type Resource = "garments" | "outfits" | "wishlist" | "locations" | "trip-plans" | "outfit-plans" | "wear-events" | "profiles";

function withServerMetadata<T extends object>(value: T, entity: WorkspaceEntity, kind: WorkspaceEntityKind): T & { serverEntityId: string; serverRevision: number } {
  return Object.assign(value, { serverEntityId: entity.id, serverRevision: entity.revision, serverKind: kind });
}

export class OnlineWorkspaceRepository {
  readonly images: OnlineImageClient;

  constructor(private readonly session?: Pick<AuthSessionSnapshot, "accessToken" | "deviceId">) {
    this.images = new OnlineImageClient({ session });
  }

  async getOverview(): Promise<OnlineWorkspaceSnapshot> {
    const response = WorkspaceOverviewResponseSchema.parse(await onlineRequest<unknown>("/api/workspace/overview", { session: this.session }));
    const [items, outfits, wishlistItems, locations, outfitCalendarPlans, outfitPlanEntries, profiles] = await Promise.all([
      Promise.all(response.garments.map((entity) => this.mapGarment(entity))),
      Promise.all(response.outfits.map((entity) => this.mapOutfit(entity))),
      Promise.all(response.wishlistItems.map((entity) => this.mapWishlistItem(entity))),
      Promise.resolve(response.locations.map(toClosetLocation)),
      Promise.resolve(response.tripPlans.map(toCalendarPlan)),
      Promise.resolve(response.outfitPlans.map(toOutfitPlanEntry)),
      Promise.all(response.profiles.map((entity) => this.mapProfile(entity))),
    ]);
    return {
      items,
      outfits,
      wishlistItems,
      locations,
      outfitCalendarPlans,
      outfitPlanEntries,
      planPackingChecklistItems: packingItems(response.tripPlans),
      tryOnProfile: profiles[0],
      serverRevision: response.serverRevision,
      requestId: response.requestId,
    };
  }

  async getList(resource: Resource, query: { cursor?: string; limit?: number } = {}): Promise<WorkspaceListResponse> {
    const search = new URLSearchParams();
    if (query.cursor) search.set("cursor", query.cursor);
    if (query.limit) search.set("limit", String(query.limit));
    const suffix = search.size ? `?${search}` : "";
    return WorkspaceListResponseSchema.parse(await onlineRequest<unknown>(`/api/workspace/${resource}${suffix}`, { session: this.session }));
  }

  async getDetail(resource: Resource, id: string): Promise<WorkspaceEntity> {
    const response = WorkspaceDetailResponseSchema.parse(await onlineRequest<unknown>(
      `/api/workspace/${resource}/${encodeURIComponent(id)}`,
      { session: this.session },
    ));
    return response.data;
  }

  async getWearSummary(): Promise<WorkspaceWearSummaryResponse> {
    return WorkspaceWearSummaryResponseSchema.parse(await onlineRequest<unknown>("/api/workspace/wear-summary", { session: this.session }));
  }

  dispose(): void {
    this.images.clear();
  }

  async mapGarment(entity: WorkspaceEntity): Promise<WardrobeItem> {
    const p = entity.payload;
    const referenceOutfitImages = (Array.isArray(p.referenceOutfitImages) ? p.referenceOutfitImages : []).flatMap((value) => {
      const reference = value && typeof value === "object" ? value as Record<string, unknown> : {};
      const field = typeof reference.assetField === "string" ? reference.assetField : `referenceOutfitImage:${String(reference.id ?? "")}`;
      const image = imageReference(entity, field, reference.cropBox);
      return image ? [{ id: stringValue(reference.id), image, caption: optionalString(reference.caption), createdAt: stringValue(reference.createdAt, entity.createdAt), updatedAt: stringValue(reference.updatedAt, entity.updatedAt) }] : [];
    });
    return withServerMetadata({
      id: numericId(p.legacyItemId, entity.id),
      locationId: stringValue(p.locationId, "home"),
      name: stringValue(p.name),
      status: (p.status ?? "active") as WardrobeItem["status"],
      category: (p.category ?? "tops") as WardrobeItem["category"],
      subcategory: optionalString(p.subcategory),
      colors: (p.colors ?? { mode: "single", primary: "#000000" }) as WardrobeItem["colors"],
      seasons: (p.seasons ?? []) as WardrobeItem["seasons"],
      styles: (p.styles ?? []) as WardrobeItem["styles"],
      mainImage: imageReference(entity, "imageDataUrl", p.cropBox),
      formality: optionalNumber(p.formality), warmth: optionalNumber(p.warmth),
      temperatureRange: normalizeTemperatureRange(p.temperatureRange),
      material: optionalString(p.material), fitGender: p.fitGender as WardrobeItem["fitGender"],
      fitNotes: optionalString(p.fitNotes), notes: optionalString(p.notes), price: optionalNumber(p.price),
      productUrl: optionalString(p.productUrl), wornDates: stringArray(p.wornDates),
      purchaseDate: optionalString(p.purchaseDate), referenceOutfitImages: referenceOutfitImages as WardrobeItem["referenceOutfitImages"],
      aiStyleAdvice: p.aiStyleAdvice as WardrobeItem["aiStyleAdvice"], aiConfidence: optionalNumber(p.aiConfidence),
      needsReview: optionalBoolean(p.needsReview),
      createdAt: stringValue(p.createdAt, entity.createdAt), updatedAt: stringValue(p.updatedAt, entity.updatedAt),
    } satisfies Omit<WardrobeItem, "serverEntityId" | "serverRevision">, entity, "garment");
  }

  async mapOutfit(entity: WorkspaceEntity): Promise<SavedOutfit> {
    const p = entity.payload;
    const outfitRealImages = (Array.isArray(p.outfitRealImages) ? p.outfitRealImages : []).flatMap((value) => {
      const real = value && typeof value === "object" ? value as Record<string, unknown> : {};
      const field = typeof real.assetField === "string" ? real.assetField : `outfitRealImage:${String(real.id ?? "")}`;
      const image = imageReference(entity, field, real.cropBox);
      return image ? [{ id: stringValue(real.id), image, caption: optionalString(real.caption), createdAt: stringValue(real.createdAt, entity.createdAt), updatedAt: stringValue(real.updatedAt, entity.updatedAt) }] : [];
    });
    return withServerMetadata({
      id: stringValue(p.legacyOutfitId, entity.id), name: stringValue(p.name), itemIds: numberArray(p.legacyItemIds ?? p.itemIds),
      favorite: optionalBoolean(p.favorite) ?? false, coverImage: imageReference(entity, "coverImageDataUrl", p.coverCropBox),
      destination: optionalString(p.destination), activity: optionalString(p.activity),
      style: optionalString(p.style), source: (p.source ?? "manual") as SavedOutfit["source"], seasons: p.seasons as SavedOutfit["seasons"],
      sceneTags: p.sceneTags as string[] | undefined, styleTags: p.styleTags as string[] | undefined,
      pairingTags: p.pairingTags as string[] | undefined, temperatureRange: normalizeTemperatureRange(p.temperatureRange),
      notes: optionalString(p.notes), wornDates: p.wornDates as string[] | undefined, outfitRealImages,
      aiSuggestion: p.aiSuggestion as SavedOutfit["aiSuggestion"], createdAt: stringValue(p.createdAt, entity.createdAt), updatedAt: stringValue(p.updatedAt, entity.updatedAt),
    } satisfies Omit<SavedOutfit, "serverEntityId" | "serverRevision">, entity, "outfit");
  }

  async mapWishlistItem(entity: WorkspaceEntity): Promise<WishlistItem> {
    const p = entity.payload;
    return withServerMetadata({
      id: stringValue(p.legacyWishlistId, entity.id), name: stringValue(p.name), mainImage: imageReference(entity, "imageDataUrl", p.cropBox),
      category: (p.category ?? "tops") as WishlistItem["category"],
      subcategory: optionalString(p.subcategory), colors: (p.colors ?? { mode: "single", primary: "#000000" }) as WishlistItem["colors"],
      seasons: (p.seasons ?? []) as WishlistItem["seasons"], styles: (p.styles ?? []) as WishlistItem["styles"],
      formality: optionalNumber(p.formality), warmth: optionalNumber(p.warmth), temperatureRange: normalizeTemperatureRange(p.temperatureRange),
      material: optionalString(p.material), fitGender: p.fitGender as WishlistItem["fitGender"], fitNotes: optionalString(p.fitNotes),
      notes: optionalString(p.notes), price: optionalNumber(p.price), productUrl: optionalString(p.productUrl),
      status: (p.status ?? "interested") as WishlistItem["status"], convertedItemId: optionalNumber(p.convertedItemId),
      convertedAt: optionalString(p.convertedAt), convertedItemDeletedAt: optionalString(p.convertedItemDeletedAt),
      aiAssessment: p.aiAssessment as WishlistItem["aiAssessment"], createdAt: stringValue(p.createdAt, entity.createdAt), updatedAt: stringValue(p.updatedAt, entity.updatedAt),
    } satisfies Omit<WishlistItem, "serverEntityId" | "serverRevision">, entity, "wishlistItem");
  }

  async mapProfile(entity: WorkspaceEntity): Promise<TryOnProfile> {
    const p = entity.payload;
    return withServerMetadata({ ...p, fullBodyImage: assetReference(entity, "fullBodyImageDataUrl"), faceImage: assetReference(entity, "faceImageDataUrl"), id: "default", enabled: optionalBoolean(p.enabled) ?? false, updatedAt: stringValue(p.updatedAt, entity.updatedAt) } as TryOnProfile, entity, "profile");
  }

  mapLocation(entity: WorkspaceEntity): ClosetLocation { return toClosetLocation(entity); }
  mapTripPlan(entity: WorkspaceEntity): OutfitCalendarPlan { return toCalendarPlan(entity); }
  mapOutfitPlan(entity: WorkspaceEntity): OutfitPlanEntry { return toOutfitPlanEntry(entity); }

}

function toClosetLocation(entity: WorkspaceEntity): ClosetLocation {
  const p = entity.payload;
  return withServerMetadata({ id: stringValue(p.dexieId, entity.id), name: stringValue(p.name), note: optionalString(p.note), sortOrder: optionalNumber(p.sortOrder) ?? 0, createdAt: entity.createdAt, updatedAt: entity.updatedAt }, entity, "closetLocation");
}

function toCalendarPlan(entity: WorkspaceEntity): OutfitCalendarPlan {
  const p = entity.payload;
  return withServerMetadata({ ...p, id: stringValue(p.legacyCalendarPlanId, entity.id), title: stringValue(p.title), startDate: stringValue(p.startDate), endDate: stringValue(p.endDate), type: (p.type ?? "custom") as OutfitCalendarPlan["type"], tone: (p.tone ?? "slate") as OutfitCalendarPlan["tone"], createdAt: entity.createdAt, updatedAt: entity.updatedAt } as OutfitCalendarPlan, entity, "tripPlan");
}

function toOutfitPlanEntry(entity: WorkspaceEntity): OutfitPlanEntry {
  const p = entity.payload;
  return withServerMetadata({ ...p, id: stringValue(p.legacyPlanEntryId, entity.id), date: stringValue(p.date), status: (p.status ?? "planned") as OutfitPlanEntry["status"], createdAt: entity.createdAt, updatedAt: entity.updatedAt } as OutfitPlanEntry, entity, "outfitPlan");
}

function packingItems(plans: WorkspaceEntity[]): PlanPackingChecklistItem[] {
  return plans.flatMap((entity) => Array.isArray(entity.payload.packingChecklistItems) ? entity.payload.packingChecklistItems as PlanPackingChecklistItem[] : []);
}

function assetReference(entity: WorkspaceEntity, field: string): ImageAssetReference | undefined {
  const ref = entity.assetRefs?.[field];
  return ref ? { ...ref } : undefined;
}

function imageReference(entity: WorkspaceEntity, field: string, cropBox: unknown): CroppedImageReference | undefined {
  const asset = assetReference(entity, field);
  return asset ? { asset, ...(cropBox ? { cropBox: cropBox as GarmentCropBox } : {}) } : undefined;
}

function numericId(value: unknown, fallback: string): number {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  let hash = 2166136261;
  for (const char of fallback) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return Math.abs(hash) || 1;
}
function stringValue(value: unknown, fallback = ""): string { return typeof value === "string" ? value : fallback; }
function optionalString(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
function optionalNumber(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function optionalBoolean(value: unknown): boolean | undefined { return typeof value === "boolean" ? value : undefined; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function numberArray(value: unknown): number[] { return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : []; }
