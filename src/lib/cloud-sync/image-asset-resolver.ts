"use client";

import type { AssetVariant } from "@wardrobe/cloud-contracts";

import type { WorkspaceAssetRecord, WorkspaceEntityType } from "@/lib/account-workspace-db";
import type { CloudAssetReferenceMap } from "@/lib/cloud-sync/asset-bridge";
import type { AccountImageCache, CachedImage } from "@/lib/cloud-sync/image-cache";

export interface ResolveEntityImageFieldInput {
  assets: WorkspaceAssetRecord[];
  ownerEntityType: WorkspaceEntityType;
  ownerEntityId: string;
  fieldName: string;
  variant: AssetVariant;
  assetRefs?: CloudAssetReferenceMap;
  imageCache?: Pick<AccountImageCache, "get" | "downloadAndCache">;
}

export async function resolveEntityImageField(input: ResolveEntityImageFieldInput): Promise<string | undefined> {
  const localAsset = input.assets.find((asset) =>
    !asset.deletedAt
    && asset.ownerEntityType === input.ownerEntityType
    && asset.ownerEntityId === input.ownerEntityId
    && sourceFieldName(asset) === input.fieldName,
  );
  const local = resolveLocalAssetVariant(localAsset, input.variant);
  if (local) return local;

  const ref = resolveAssetRef(input.assetRefs, input.fieldName);
  if (!ref || !input.imageCache) return undefined;

  if (!ref.variants.includes(input.variant)) return undefined;
  const preferred = input.variant;
  const expectedSha256 = ref.variantSha256?.[preferred];
  const cached = await resolveCachedAssetVariant(input.imageCache, ref.assetId, preferred, expectedSha256);
  if (cached) return blobToImageDataUrl(cached.blob);

  const downloaded = await input.imageCache.downloadAndCache(ref.assetId, preferred);
  return downloaded ? blobToImageDataUrl(downloaded.blob) : undefined;
}

export async function resolveEntityImageFields(
  inputs: Record<string, ResolveEntityImageFieldInput>,
): Promise<Record<string, string | undefined>> {
  const entries = await Promise.all(Object.entries(inputs).map(async ([key, input]) => {
    try {
      return [key, await resolveEntityImageField(input)] as const;
    } catch (error) {
      console.warn("[image-asset-resolver] image resolution failed", {
        entityType: input.ownerEntityType,
        entityId: input.ownerEntityId,
        field: input.fieldName,
        stage: "resolve",
        error: error instanceof Error ? error.message : "unknown",
      });
      return [key, undefined] as const;
    }
  }));
  return Object.fromEntries(entries);
}

export function resolveAssetRef(assetRefs: CloudAssetReferenceMap | undefined, fieldName: string) {
  return assetRefs?.[fieldName];
}

export function resolveLocalAssetVariant(asset: WorkspaceAssetRecord | undefined, variant: AssetVariant): string | undefined {
  const uploads = assetPayload(asset)?.uploads;
  const preferred = uploads?.[variant]?.dataUrl;
  if (isImageDataUrl(preferred)) return preferred;
  return undefined;
}

export async function resolveCachedAssetVariant(
  cache: Pick<AccountImageCache, "get">,
  assetId: string,
  variant: AssetVariant,
  expectedSha256?: string,
): Promise<CachedImage | null> {
  return cache.get(assetId, variant, { expectedSha256 });
}

export async function blobToImageDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `data:${blob.type || "image/jpeg"};base64,${btoa(binary)}`;
}

function sourceFieldName(asset: WorkspaceAssetRecord): string | undefined {
  return assetPayload(asset)?.source?.fieldName;
}

function assetPayload(asset: WorkspaceAssetRecord | undefined): {
  uploads?: Partial<Record<AssetVariant, { dataUrl?: string }>>;
  source?: { fieldName?: string };
} | undefined {
  if (!asset?.payload || typeof asset.payload !== "object" || Array.isArray(asset.payload)) return undefined;
  return asset.payload as {
    uploads?: Partial<Record<AssetVariant, { dataUrl?: string }>>;
    source?: { fieldName?: string };
  };
}

function isImageDataUrl(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,/i.test(value);
}
