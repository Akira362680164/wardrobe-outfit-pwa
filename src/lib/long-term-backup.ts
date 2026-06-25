import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  isLongTermBackupFileName,
  LONG_TERM_BACKUP_MANIFEST_FILE,
  LONG_TERM_BACKUP_METADATA_FILE,
  LONG_TERM_BACKUP_IMAGE_DIR,
  getLongTermBackupTimestampFileName,
  createLongTermBackupManifest,
  assertLongTermBackupManifest,
  sortLongTermBackupFiles,
  type LongTermBackupFileEntry,
  type LongTermBackupManifest,
  type LongTermBackupEntryBuildResult,
} from "@/lib/long-term-backup-package";
import { createLatestBackup } from "@/lib/backup-data";
import type { ClosetLocation, OutfitCalendarPlan, OutfitPlanEntry, PlanPackingChecklistItem, SavedOutfit, TryOnProfile, WardrobeBackup, WardrobeItem, WishlistItem } from "@/lib/types";

const IMG_TOKEN_PREFIX = "%%IMG_";

// LongTermBackup plugin interface
interface LongTermBackupPluginInterface {
  startExportSession(args: { timestampFileName: string; latestFileName: string }): Promise<{ sessionId: string }>;
  writeTextEntry(args: { sessionId: string; path: string; text: string }): Promise<void>;
  commitDefaultExport(args: { sessionId: string }): Promise<{ latestPath: string; timestampPath: string }>;
  commitSaveAsExport(args: { sessionId: string; suggestedName: string }): Promise<{ filePath: string }>;
  listDefaultBackups(): Promise<{ files?: Array<{ name: string; displayName?: string; path?: string; size: number; modifiedAt?: number; mtime?: number; isLatest?: boolean }> | Record<string, { name?: string; displayName?: string; path?: string; size?: number; modifiedAt?: number; mtime?: number; isLatest?: boolean }> }>;
  openDefaultBackup(args: { fileName: string }): Promise<{ readSessionId?: string; code?: string; message?: string }>;
  openPickedBackup(): Promise<{ readSessionId: string; fileName?: string }>;
  readTextEntry(args: { readSessionId: string; path: string }): Promise<{ text: string }>;
  closeReadSession(args: { readSessionId: string }): Promise<void>;
  cancelExportSession(args: { sessionId: string }): Promise<void>;
}

const LongTermBackup = registerPlugin<LongTermBackupPluginInterface>("LongTermBackup");

// Required plugin methods - any missing method indicates a broken plugin registration/build
const REQUIRED_PLUGIN_METHODS: Array<keyof LongTermBackupPluginInterface> = [
  "startExportSession",
  "writeTextEntry",
  "commitDefaultExport",
  "listDefaultBackups",
  "openDefaultBackup",
  "readTextEntry",
  "closeReadSession",
];

// Error code for when default backup read requires picker
export const DEFAULT_BACKUP_READ_REQUIRES_PICKER = "DEFAULT_BACKUP_READ_REQUIRES_PICKER";

// Fixed error messages
export const LTB_NATIVE_PLUGIN_MISSING_MESSAGE = "Android 长期备份服务不可用。请安装包含长期备份插件的最新 APK。";
export const LTB_NATIVE_PLUGIN_METHOD_MISSING_MESSAGE = "Android 长期备份插件方法缺失，无法完成长期备份。";

// Assert that we can perform a real Android native long-term backup operation.
export function assertNativeLongTermBackupAvailable(methods: Array<keyof LongTermBackupPluginInterface> = REQUIRED_PLUGIN_METHODS): LongTermBackupPluginInterface | null {
  if (!Capacitor.isNativePlatform()) return null;
  if (!Capacitor.isPluginAvailable("LongTermBackup")) {
    throw new Error(LTB_NATIVE_PLUGIN_MISSING_MESSAGE);
  }
  const plugin = LongTermBackup;
  for (const method of methods) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (plugin as any)[method] !== "function") {
      throw new Error(LTB_NATIVE_PLUGIN_METHOD_MISSING_MESSAGE);
    }
  }
  return plugin;
}

// Check if we are in web environment
// Exported so callers (e.g. UI banners) can branch consistently. Not used inside
// this module directly because every export/restore function asks the plugin
// guard first and the plugin guard already encodes the !isNativePlatform() case.
export function isWebPlatform(): boolean {
  return !Capacitor.isNativePlatform();
}

// Source data for backup
export interface LongTermBackupSourceData {
  items: WardrobeItem[];
  locations: ClosetLocation[];
  outfits: SavedOutfit[];
  wishlistItems: WishlistItem[];
  outfitPlanEntries: OutfitPlanEntry[];
  outfitCalendarPlans: OutfitCalendarPlan[];
  planPackingChecklistItems: PlanPackingChecklistItem[];
  tryOnProfile?: TryOnProfile;
}

// Export result
export interface LongTermBackupExportResult {
  /** True when this result came from the web debug JSON download (not an Android native ZIP write). */
  webFallback: boolean;
  /** Native-only: absolute path to the latest backup file. Empty on web fallback. */
  latestPath: string;
  /** Native-only: absolute path to the timestamped backup file. Empty on web fallback. */
  timestampPath: string;
  /** Always present: file name shown to the user (timestamped .wardrobebackup). */
  timestampFileName: string;
  /** Number of images tokenized in the backup. */
  imageCount: number;
}

// Build long-term backup entries from source data
export async function buildLongTermBackupEntries(input: LongTermBackupSourceData & { appVersion: string }): Promise<LongTermBackupEntryBuildResult> {
  const backup = createLatestBackup(
    input.items,
    input.locations,
    input.outfits,
    input.tryOnProfile,
    input.wishlistItems,
    input.outfitPlanEntries,
    input.outfitCalendarPlans,
    input.planPackingChecklistItems,
  );

  const exportedAt = backup.exportedAt;
  const timestampFileName = getLongTermBackupTimestampFileName(exportedAt);

  // Tokenize images
  const imageList: string[] = [];
  let imgCounter = 0;

  function collectAndReplace(obj: unknown): unknown {
    if (typeof obj === "string" && obj.startsWith("data:image/")) {
      const token = `${IMG_TOKEN_PREFIX}${imgCounter++}%%`;
      imageList.push(obj);
      return token;
    }
    if (Array.isArray(obj)) return obj.map(collectAndReplace);
    if (obj && typeof obj === "object") {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        result[k] = collectAndReplace(v);
      }
      return result;
    }
    return obj;
  }

  const tokenizedBackup = collectAndReplace(backup) as WardrobeBackup;
  const metadataJson = JSON.stringify({ ...tokenizedBackup, version: 5 }, null, 2);

  const manifest = createLongTermBackupManifest({
    appVersion: input.appVersion,
    backup,
    imageCount: imageList.length,
  });
  const manifestJson = JSON.stringify(manifest, null, 2);

  const imageEntries = imageList.map((text, i) => ({
    path: `${LONG_TERM_BACKUP_IMAGE_DIR}/img_${String(i).padStart(3, "0")}.txt`,
    fileName: `img_${String(i).padStart(3, "0")}.txt`,
    text,
  }));

  // ponytail: v1.1.34+ 让 latestFileName == timestampFileName，
  // Android 原生插件据此只写一份文件，不再生成"最新备份"别名。
  return {
    exportedAt,
    timestampFileName,
    latestFileName: timestampFileName,
    manifestJson,
    metadataJson,
    imageEntries,
    imageCount: imageList.length,
  };
}

// Collect image token indices from metadata JSON
export function collectLatestImageTokenIndices(metadataJson: string): number[] {
  const parsed = parseLongTermBackupMetadataJson(metadataJson);
  const indices = new Set<number>();
  collectImageTokenIndicesFromValue(parsed, indices);
  return Array.from(indices).sort((a, b) => a - b);
}

function parseLongTermBackupMetadataJson(metadataJson: string): unknown {
  try {
    return JSON.parse(metadataJson);
  } catch {
    throw new Error("备份文件格式不正确：metadata JSON 无法解析");
  }
}

function collectImageTokenIndicesFromValue(value: unknown, indices: Set<number>) {
  const match = typeof value === "string" ? /^%%IMG_(\d+)%%$/.exec(value) : null;
  if (match) {
    indices.add(Number.parseInt(match[1], 10));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectImageTokenIndicesFromValue(item, indices);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectImageTokenIndicesFromValue(item, indices);
    }
  }
}

function replaceImageTokensInValue(value: unknown, imageMap: Map<number, string>): unknown {
  const match = typeof value === "string" ? /^%%IMG_(\d+)%%$/.exec(value) : null;
  if (match) {
    const idx = Number.parseInt(match[1], 10);
    const image = imageMap.get(idx);
    if (!image) throw new Error(`备份图片缺失：images/img_${String(idx).padStart(3, "0")}.txt`);
    return image;
  }
  if (Array.isArray(value)) return value.map((item) => replaceImageTokensInValue(item, imageMap));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = replaceImageTokensInValue(item, imageMap);
    }
    return result;
  }
  return value;
}

export function normalizeBackupImageText(text: string, path: string): string {
  const normalized = text.replace(/^﻿/, "").trim();

  if (!normalized) {
    throw new Error(`备份图片内容为空：${path}`);
  }
  if (!normalized.startsWith("data:image/")) {
    throw new Error(`备份图片格式不正确：${path}`);
  }
  if (!normalized.includes(";base64,")) {
    throw new Error(`备份图片不是 Base64 Data URL：${path}`);
  }
  if (/[\r\n]/.test(normalized)) {
    throw new Error(`备份图片内容包含非法换行：${path}`);
  }

  return normalized;
}

// Resolve image tokens strictly - throws on any missing image
export async function resolveLatestImageTokensStrict(
  metadataJson: string,
  readImageText: (fileName: string) => Promise<string>,
  expectedImageCount?: number,
): Promise<string> {
  const parsed = parseLongTermBackupMetadataJson(metadataJson);
  const indices = new Set<number>();
  collectImageTokenIndicesFromValue(parsed, indices);

  const actualCount = indices.size;
  if (expectedImageCount != null && expectedImageCount !== actualCount) {
    throw new Error(`备份图片数量不一致：manifest=${expectedImageCount}，metadata=${actualCount}`);
  }

  const sortedIndices = Array.from(indices).sort((a, b) => a - b);
  for (let position = 0; position < sortedIndices.length; position++) {
    if (sortedIndices[position] !== position) {
      throw new Error(`备份图片 Token 索引不连续：缺少 IMG_${position}`);
    }
  }

  const imageMap = new Map<number, string>();
  for (const idx of sortedIndices) {
    const fileName = `img_${String(idx).padStart(3, "0")}.txt`;
    const path = `${LONG_TERM_BACKUP_IMAGE_DIR}/${fileName}`;
    const text = await readImageText(fileName);
    imageMap.set(idx, normalizeBackupImageText(text, path));
  }

  return JSON.stringify(replaceImageTokensInValue(parsed, imageMap));
}

// Restore long-term backup from package
export async function restoreLongTermBackupFromPackage(input: {
  manifestJson: string;
  metadataJson: string;
  readImageText: (fileName: string) => Promise<string>;
}): Promise<WardrobeBackup> {
  const manifest = assertLongTermBackupManifest(JSON.parse(input.manifestJson));

  if (manifest.backupVersion !== 5) {
    throw new Error(`不支持的备份版本: ${manifest.backupVersion}，当前支持版本 5`);
  }

  const resolvedMetadata = await resolveLatestImageTokensStrict(input.metadataJson, input.readImageText, manifest.imageCount);
  const { parseLatestBackupMetadata } = await import("@/lib/backup-data");
  return parseLatestBackupMetadata(resolvedMetadata);
}

// Export long-term backup to default location (Android native)
export async function exportLongTermBackupToDefault(input: LongTermBackupSourceData & { appVersion: string }): Promise<LongTermBackupExportResult> {
  // In native environment, we MUST use the real plugin. If it's missing or broken,
  // throw the fixed error (never silently fall through to web debug download).
  const plugin = assertNativeLongTermBackupAvailable();

  if (!plugin) {
    // Web debug environment: trigger JSON metadata download so the dev can still
    // inspect the export structure, but mark it clearly as a fallback.
    return exportLongTermBackupWebFallback(input);
  }

  const entries = await buildLongTermBackupEntries(input);

  // Start export session
  const { sessionId } = await plugin.startExportSession({
    timestampFileName: entries.timestampFileName,
    latestFileName: entries.latestFileName,
  });

  try {
    // Write manifest.json
    await plugin.writeTextEntry({
      sessionId,
      path: LONG_TERM_BACKUP_MANIFEST_FILE,
      text: entries.manifestJson,
    });

    // Write metadata.json
    await plugin.writeTextEntry({
      sessionId,
      path: LONG_TERM_BACKUP_METADATA_FILE,
      text: entries.metadataJson,
    });

    // Write image files
    for (const entry of entries.imageEntries) {
      await plugin.writeTextEntry({
        sessionId,
        path: entry.path,
        text: entry.text,
      });
    }

    // Commit to default location (writes both latest and timestamp files)
    const result = await plugin.commitDefaultExport({ sessionId });

    return {
      webFallback: false,
      latestPath: result.latestPath,
      timestampPath: result.timestampPath,
      timestampFileName: entries.timestampFileName,
      imageCount: entries.imageCount,
    };
  } catch (error) {
    // Cancel session on error
    try {
      await plugin.cancelExportSession({ sessionId });
    } catch {}
    throw error;
  }
}

// Export long-term backup with save-as dialog (Android native)
export async function exportLongTermBackupSaveAs(input: LongTermBackupSourceData & { appVersion: string }): Promise<{ filePath: string; webFallback: boolean }> {
  // In native environment, we MUST use the real plugin. If it's missing or broken,
  // throw the fixed error (never silently fall through to web debug download).
  const plugin = assertNativeLongTermBackupAvailable(["startExportSession", "writeTextEntry", "commitSaveAsExport", "cancelExportSession"]);

  if (!plugin) {
    // Web debug environment: trigger JSON metadata download so the dev can still
    // inspect the export structure, but mark it clearly as a fallback.
    await exportLongTermBackupWebFallback(input);
    return { filePath: "", webFallback: true };
  }

  const entries = await buildLongTermBackupEntries(input);

  // Start export session
  const { sessionId } = await plugin.startExportSession({
    timestampFileName: entries.timestampFileName,
    latestFileName: entries.latestFileName,
  });

  try {
    // Write manifest.json
    await plugin.writeTextEntry({
      sessionId,
      path: LONG_TERM_BACKUP_MANIFEST_FILE,
      text: entries.manifestJson,
    });

    // Write metadata.json
    await plugin.writeTextEntry({
      sessionId,
      path: LONG_TERM_BACKUP_METADATA_FILE,
      text: entries.metadataJson,
    });

    // Write image files
    for (const entry of entries.imageEntries) {
      await plugin.writeTextEntry({
        sessionId,
        path: entry.path,
        text: entry.text,
      });
    }

    // Commit with save-as dialog
    const result = await plugin.commitSaveAsExport({
      sessionId,
      suggestedName: entries.timestampFileName,
    });

    return { filePath: result.filePath, webFallback: false };
  } catch (error) {
    // Cancel session on error
    try {
      await plugin.cancelExportSession({ sessionId });
    } catch {}
    throw error;
  }
}

// List default long-term backups
export async function listDefaultLongTermBackups(): Promise<LongTermBackupFileEntry[]> {
  // In native environment, we MUST use the real plugin. If it's missing or broken,
  // throw the fixed error (never silently return an empty array that callers will
  // interpret as "no backups yet").
  const plugin = assertNativeLongTermBackupAvailable(["listDefaultBackups"]);

  if (!plugin) {
    // Web debug environment: browsers cannot inspect Android Downloads.
    // Caller (openDefaultBackupFolder) already shows the explicit web fallback
    // banner, so we throw the same fixed message here to keep behaviour consistent.
    throw new Error("浏览器无法读取 Android 默认长期备份目录，请在 Android 真机验证。");
  }

  const result = await plugin.listDefaultBackups();
  const rawFiles = result.files;
  const files = Array.isArray(rawFiles)
    ? rawFiles
    : rawFiles && typeof rawFiles === "object"
      ? Object.values(rawFiles)
      : [];
  return sortLongTermBackupFiles(files.map((f) => ({
    name: f.name ?? f.displayName ?? "",
    size: f.size ?? 0,
    mtime: f.mtime ?? f.modifiedAt ?? 0,
    isLatest: false,
  })).filter((f) => isLongTermBackupFileName(f.name)));
}

// Restore from default long-term backup
export interface RestoreDefaultLongTermBackupResult {
  backup: WardrobeBackup;
  fileName: string;
}

export async function restoreDefaultLongTermBackup(fileName?: string): Promise<RestoreDefaultLongTermBackupResult> {
  // In native environment, we MUST use the real plugin. If it's missing or broken,
  // throw the fixed error. In web environment, throw the explicit web message.
  const plugin = assertNativeLongTermBackupAvailable([
    "openDefaultBackup",
    "readTextEntry",
    "closeReadSession",
  ]);

  if (!plugin) {
    throw new Error("浏览器无法读取 Android 默认长期备份目录，请在 Android 真机验证。");
  }

  // ponytail: v1.1.34+ 不再有"最新备份"别名，调用方必须显式提供从
  // listDefaultLongTermBackups 取到的 timestampFileName。给一个清晰报错。
  if (!fileName) {
    throw new Error("请先从备份列表中选择要恢复的备份文件。");
  }
  const resolvedFileName = fileName;

  const result = await plugin.openDefaultBackup({ fileName: resolvedFileName });
  if (!result.readSessionId) throw new Error(result.message ?? "无法读取默认长期备份");
  const readSessionId = result.readSessionId;

  try {
    // Read manifest
    const manifestResult = await plugin.readTextEntry({
      readSessionId,
      path: LONG_TERM_BACKUP_MANIFEST_FILE,
    });

    // Read metadata
    const metadataResult = await plugin.readTextEntry({
      readSessionId,
      path: LONG_TERM_BACKUP_METADATA_FILE,
    });

    // Read images - strict: any missing image throws
    const readImageText = async (fileName: string): Promise<string> => {
      const imgResult = await plugin.readTextEntry({
        readSessionId,
        path: `${LONG_TERM_BACKUP_IMAGE_DIR}/${fileName}`,
      });
      return imgResult.text;
    };

    const backup = await restoreLongTermBackupFromPackage({
      manifestJson: manifestResult.text,
      metadataJson: metadataResult.text,
      readImageText,
    });
    return { backup, fileName: resolvedFileName };
  } finally {
    await plugin.closeReadSession({ readSessionId });
  }
}

// Restore from user-picked file
export interface RestorePickedLongTermBackupResult {
  backup: WardrobeBackup;
  fileName: string;
}

export async function restorePickedLongTermBackup(): Promise<RestorePickedLongTermBackupResult> {
  // In native environment, we MUST use the real plugin. If it's missing or broken,
  // throw the fixed error. In web environment, throw the explicit web message.
  const plugin = assertNativeLongTermBackupAvailable([
    "openPickedBackup",
    "readTextEntry",
    "closeReadSession",
  ]);

  if (!plugin) {
    throw new Error("请选择 .wardrobebackup 长期备份文件");
  }

  const result = await plugin.openPickedBackup();
  const readSessionId = result.readSessionId;
  // The Android plugin returns the user-friendly display name (best effort).
  // Fallback to the constant latest file name if for some reason the plugin
  // did not include it.
  // ponytail: v1.1.34+ 不再默认到 latest 别名；从 picker 拿不到名时给出清晰提示。
  const fileName = result.fileName || "衣橱穿搭助手-未知时间.wardrobebackup";

  try {
    // Read manifest
    const manifestResult = await plugin.readTextEntry({
      readSessionId,
      path: LONG_TERM_BACKUP_MANIFEST_FILE,
    });

    // Read metadata
    const metadataResult = await plugin.readTextEntry({
      readSessionId,
      path: LONG_TERM_BACKUP_METADATA_FILE,
    });

    // Read images - strict: any missing image throws
    const readImageText = async (fileName: string): Promise<string> => {
      const imgResult = await plugin.readTextEntry({
        readSessionId,
        path: `${LONG_TERM_BACKUP_IMAGE_DIR}/${fileName}`,
      });
      return imgResult.text;
    };

    const backup = await restoreLongTermBackupFromPackage({
      manifestJson: manifestResult.text,
      metadataJson: metadataResult.text,
      readImageText,
    });
    return { backup, fileName };
  } finally {
    await plugin.closeReadSession({ readSessionId });
  }
}

// Web fallback: trigger a JSON metadata debug download.
// This is NOT an Android ZIP-package/default-directory validation path. It is only
// available in non-Native browser environments so that developers can inspect the
// generated metadata structure without the native plugin. The returned result is
// flagged with webFallback: true so the UI can render the explicit browser-debug
// banner instead of an Android-native success.
async function exportLongTermBackupWebFallback(input: LongTermBackupSourceData & { appVersion: string }): Promise<LongTermBackupExportResult> {
  const entries = await buildLongTermBackupEntries(input);

  // Create a simple JSON download for the metadata. Note: we deliberately do NOT
  // log or echo the metadata content (per §4.4.5).
  const blob = new Blob([entries.metadataJson], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = entries.timestampFileName;
  link.click();
  URL.revokeObjectURL(url);

  return {
    webFallback: true,
    latestPath: "",
    timestampPath: "",
    timestampFileName: entries.timestampFileName,
    imageCount: entries.imageCount,
  };
}
