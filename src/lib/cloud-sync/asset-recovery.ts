// src/lib/cloud-sync/asset-recovery.ts
// v1.1.37 cloud 1C C3c: new device asset recovery — thumbnail-first download
//
// Fetches asset manifest, then downloads thumbnails sorted most-recent-first.
// Triple guard (userId/dbName/workspaceGeneration) on every batch boundary.
// Dependencies injectable for testing.

"use client";

import type { AssetManifestItem } from "@wardrobe/cloud-contracts";

import { requestAssetManifest } from "@/lib/cloud-sync/cloud-assets-api";
import { loadCloudBridgeContext } from "@/lib/cloud-sync/bridge-context";
import { loadAuthSessionSnapshot } from "@/lib/auth-session-store";
import { loadWorkspaceRegistry, isWorkspaceResponseCurrent } from "@/lib/workspace-registry";
import { currentWorkspaceGuard } from "@/lib/cloud-sync/sync-engine";
import type { CloudSyncRequestOptions } from "@/lib/cloud-sync/cloud-sync-api";
import { AccountImageCache, type CachedImage } from "@/lib/cloud-sync/image-cache";
import type { AssetVariant } from "@wardrobe/cloud-contracts";

export interface AssetRecoveryProgress {
  phase: "manifest" | "thumbnails" | "done" | "error";
  totalAssets: number;
  downloadedThumbnails: number;
  failedThumbnails: number;
}

export interface AssetRecoveryDeps {
  fetchManifest?: (options: CloudSyncRequestOptions) => Promise<AssetManifestItem[]>;
  downloadThumbnail?: (assetId: string, variant: AssetVariant) => Promise<CachedImage | null>;
}

async function fetchAllManifest(options: CloudSyncRequestOptions): Promise<AssetManifestItem[]> {
  const items: AssetManifestItem[] = [];
  let cursor: string | undefined;
  while (true) {
    const page = await requestAssetManifest({ cursor, limit: 200 }, options);
    items.push(...page.items);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return items;
}

export async function recoverAssets(
  cache: AccountImageCache,
  onProgress?: (progress: AssetRecoveryProgress) => void,
  deps: AssetRecoveryDeps = {},
): Promise<AssetRecoveryProgress> {
  const fetchManifest = deps.fetchManifest ?? fetchAllManifest;
  const downloadThumbnail = deps.downloadThumbnail ?? ((assetId: string) => cache.downloadAndCache(assetId, "thumbnail"));

  const report = (p: AssetRecoveryProgress) => onProgress?.(p);

  // --- capture workspace guard ---
  const ctx = await loadCloudBridgeContext();
  if (!ctx) {
    const result: AssetRecoveryProgress = { phase: "error", totalAssets: 0, downloadedThumbnails: 0, failedThumbnails: 0 };
    report(result);
    return result;
  }
  const guard = currentWorkspaceGuard(ctx.workspace);

  const session = await loadAuthSessionSnapshot();
  if (!session.accessToken) {
    const result: AssetRecoveryProgress = { phase: "error", totalAssets: 0, downloadedThumbnails: 0, failedThumbnails: 0 };
    report(result);
    return result;
  }
  const options: CloudSyncRequestOptions = { accessToken: session.accessToken, deviceId: ctx.deviceId };

  // --- phase 1: manifest ---
  let items: AssetManifestItem[];
  try {
    items = await fetchManifest(options);
  } catch {
    const result: AssetRecoveryProgress = { phase: "error", totalAssets: 0, downloadedThumbnails: 0, failedThumbnails: 0 };
    report(result);
    return result;
  }

  report({ phase: "manifest", totalAssets: items.length, downloadedThumbnails: 0, failedThumbnails: 0 });

  // sort most-recent first for first-screen priority
  const sorted = [...items].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  // --- phase 2: thumbnails ---
  let downloaded = 0;
  let failed = 0;
  const batchSize = 10;

  for (let i = 0; i < sorted.length; i += batchSize) {
    // triple guard: re-check workspace before each batch
    const registry = loadWorkspaceRegistry();
    const activeWs = registry.workspaces[registry.activeUserId ?? ""];
    if (!activeWs || !isWorkspaceResponseCurrent(activeWs, guard)) break;

    const session2 = await loadAuthSessionSnapshot();
    if (!session2.accessToken) break;

    const batch = sorted.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((item) =>
        item.thumbnail
          ? downloadThumbnail(item.assetId, "thumbnail")
          : Promise.resolve(null),
      ),
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) downloaded++;
      else failed++;
    }

    report({ phase: "thumbnails", totalAssets: sorted.length, downloadedThumbnails: downloaded, failedThumbnails: failed });
  }

  const done = downloaded + failed >= sorted.length;
  report({
    phase: done ? "done" : "thumbnails",
    totalAssets: sorted.length,
    downloadedThumbnails: downloaded,
    failedThumbnails: failed,
  });

  return { phase: "done", totalAssets: sorted.length, downloadedThumbnails: downloaded, failedThumbnails: failed };
}

export function scheduleAssetRecovery(cache: AccountImageCache, onProgress?: (progress: AssetRecoveryProgress) => void): void {
  recoverAssets(cache, onProgress).catch(() => { /* fire-and-forget */ });
}
