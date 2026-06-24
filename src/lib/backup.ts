import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem, type FileInfo } from "@capacitor/filesystem";
import { type ClosetLocation, type OutfitCalendarPlan, type OutfitPlanEntry, type PlanPackingChecklistItem, type SavedOutfit, type TryOnProfile, type WardrobeBackup, type WardrobeItem, type WishlistItem } from "@/lib/types";
import { migrateItemRecord, migrateOutfitCalendarPlanRecords, migrateOutfitPlanEntryRecords, migratePlanPackingChecklistItemRecords, migrateSavedOutfitRecords, migrateWishlistItemRecords } from "@/lib/migrate";

export const DEFAULT_BACKUP_FOLDER = "WardrobeBackups";
export const DEFAULT_BACKUP_FOLDER_LABEL = "Documents/WardrobeBackups";
const IMG_TOKEN_PREFIX = "%%IMG_";
const BACKUP_V4_METADATA = "metadata.json";

export interface BackupFileEntry {
  name: string;
  path: string;
  size: number;
  mtime?: number;
  uri?: string;
  isV4?: boolean;
}

export interface BackupSaveResult {
  fileName: string;
  path: string;
  uri?: string;
  directoryLabel: string;
  mode: "native" | "download";
}

export function createBackup(
  items: WardrobeItem[],
  locations: ClosetLocation[],
  outfits: SavedOutfit[] = [],
  tryOnProfile?: TryOnProfile,
  wishlistItems: WishlistItem[] = [],
  outfitPlanEntries: OutfitPlanEntry[] = [],
  outfitCalendarPlans: OutfitCalendarPlan[] = [],
  planPackingChecklistItems: PlanPackingChecklistItem[] = [],
): WardrobeBackup {
  return {
    version: 5,
    exportedAt: new Date().toISOString(),
    locations,
    items,
    outfits,
    wishlistItems,
    tryOnProfile,
    outfitPlanEntries,
    outfitCalendarPlans,
    planPackingChecklistItems,
  };
}

export function parseBackup(raw: string): WardrobeBackup {
  const parsed = JSON.parse(raw) as Partial<WardrobeBackup>;

  if (![1, 2, 3, 4, 5].includes(parsed.version ?? 0) || !Array.isArray(parsed.items) || !Array.isArray(parsed.locations)) {
    throw new Error("备份文件格式不正确");
  }

  const migratedItems = parsed.items.map((item) => migrateItemRecord(item));
  const migratedOutfits = migrateSavedOutfitRecords(parsed.outfits);
  const migratedWishlistItems = migrateWishlistItemRecords(parsed.wishlistItems);
  const migratedOutfitPlanEntries = migrateOutfitPlanEntryRecords(parsed.outfitPlanEntries);
  const migratedOutfitCalendarPlans = migrateOutfitCalendarPlanRecords(parsed.outfitCalendarPlans);
  const migratedPlanPackingChecklistItems = migratePlanPackingChecklistItemRecords(parsed.planPackingChecklistItems);

  return {
    ...(parsed as WardrobeBackup),
    items: migratedItems,
    outfits: migratedOutfits,
    wishlistItems: migratedWishlistItems,
    tryOnProfile: parsed.tryOnProfile,
    outfitPlanEntries: migratedOutfitPlanEntries,
    outfitCalendarPlans: migratedOutfitCalendarPlans,
    planPackingChecklistItems: migratedPlanPackingChecklistItems,
  };
}

export function getBackupFileName(exportedAt: string) {
  const stamp = exportedAt
    .replaceAll(":", "-")
    .replaceAll(".", "-")
    .replace("T", "-")
    .replace("Z", "");
  return `wardrobe-backup-${stamp}.json`;
}

export function isNativeBackupFolderAvailable() {
  return Capacitor.isNativePlatform();
}

export async function saveBackupToDefaultFolder(backup: WardrobeBackup): Promise<BackupSaveResult> {
  const fileName = getBackupFileName(backup.exportedAt);
  const data = JSON.stringify(backup, null, 2);

  if (!isNativeBackupFolderAvailable()) {
    downloadBackupData(data, fileName);
    return {
      fileName,
      path: fileName,
      directoryLabel: "浏览器下载目录",
      mode: "download",
    };
  }

  await ensureDefaultBackupFolder();
  const path = `${DEFAULT_BACKUP_FOLDER}/${fileName}`;
  const result = await Filesystem.writeFile({
    path,
    data,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
    recursive: true,
  });

  return {
    fileName,
    path,
    uri: result.uri,
    directoryLabel: DEFAULT_BACKUP_FOLDER_LABEL,
    mode: "native",
  };
}

function isImageDataUrl(s: unknown): s is string {
  return typeof s === "string" && s.startsWith("data:image/");
}

function replaceImageTokens(obj: unknown, imageList: string[]): unknown {
  if (typeof obj === "string" && obj.startsWith(IMG_TOKEN_PREFIX)) {
    const idx = parseInt(obj.slice(IMG_TOKEN_PREFIX.length), 10);
    return Number.isFinite(idx) && idx < imageList.length ? imageList[idx] : "";
  }
  if (Array.isArray(obj)) return obj.map((v) => replaceImageTokens(v, imageList));
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      result[k] = replaceImageTokens(v, imageList);
    }
    return result;
  }
  return obj;
}

export function isV4Metadata(raw: string): boolean {
  // v0.9.42-dev C-5: 严格 JSON.parse + version === 4 || 5, 替代原字符串 .includes 启发式
  // v1.1.0-dev: version 5 的 metadata 也是图片文件夹格式，应能识别。
  try {
    const parsed = JSON.parse(raw);
    const v = (parsed as { version?: unknown }).version;
    return (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      typeof v === "number" &&
      (v === 4 || v === 5)
    );
  } catch {
    return false;
  }
}

export async function resolveV4Tokens(
  raw: string,
  readImageFile: (fileName: string) => Promise<string>,
): Promise<string> {
  const imageList: string[] = [];
  const re = /%%IMG_(\d+)%%/g;
  let match: RegExpExecArray | null;
  const indices = new Set<number>();
  while ((match = re.exec(raw)) !== null) {
    indices.add(parseInt(match[1], 10));
  }
  const maxIdx = indices.size > 0 ? Math.max(...indices) : -1;
  for (let i = 0; i <= maxIdx; i++) {
    try {
      imageList.push(await readImageFile(`img_${String(i).padStart(3, "0")}.txt`));
    } catch {
      imageList.push("");
    }
  }
  return raw.replace(re, (_, digits) => {
    const idx = parseInt(digits, 10);
    return idx < imageList.length ? imageList[idx] : "";
  });
}

function getV4FolderName(exportedAt: string): string {
  return `backup-${exportedAt.replaceAll(":", "-").replaceAll(".", "-").replace("T", "-").replace("Z", "")}`;
}

export interface V4ExportResult {
  folderName: string;
  folderPath: string;
  imageCount: number;
}

export async function exportBackupV4(
  backup: WardrobeBackup,
): Promise<V4ExportResult> {
  if (!isNativeBackupFolderAvailable()) {
    throw new Error("v4 backup requires native platform");
  }

  const folderName = getV4FolderName(backup.exportedAt);
  const folderPath = `${DEFAULT_BACKUP_FOLDER}/${folderName}`;

  await Filesystem.mkdir({
    path: folderPath,
    directory: Directory.Documents,
    recursive: true,
  });

  const imageList: string[] = [];
  let imgCounter = 0;

  function collectAndReplace(obj: unknown): unknown {
    if (isImageDataUrl(obj)) {
      const token = `%%IMG_${imgCounter++}%%`;
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

  const metadata = collectAndReplace(backup) as WardrobeBackup;
  const metadataJson = JSON.stringify({ ...metadata, version: 5 }, null, 2);

  await Filesystem.writeFile({
    path: `${folderPath}/${BACKUP_V4_METADATA}`,
    data: metadataJson,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
  });

  for (let i = 0; i < imageList.length; i++) {
    await Filesystem.writeFile({
      path: `${folderPath}/img_${String(i).padStart(3, "0")}.txt`,
      data: imageList[i],
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
  }

  return { folderName, folderPath, imageCount: imageList.length };
}

export interface V4BackupFolder {
  name: string;
  path: string;
  mtime?: number;
}

export async function listV4BackupFolders(): Promise<V4BackupFolder[]> {
  if (!isNativeBackupFolderAvailable()) return [];

  try {
    const result = await Filesystem.readdir({
      path: DEFAULT_BACKUP_FOLDER,
      directory: Directory.Documents,
    });

    const folders: V4BackupFolder[] = [];
    for (const entry of result.files) {
      if (!entry.name.startsWith("backup-")) continue;
      try {
        await Filesystem.readFile({
          path: `${DEFAULT_BACKUP_FOLDER}/${entry.name}/${BACKUP_V4_METADATA}`,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
        });
        folders.push({
          name: entry.name,
          path: `${DEFAULT_BACKUP_FOLDER}/${entry.name}`,
          mtime: entry.mtime,
        });
      } catch {
        // folder doesn't contain metadata.json, skip
      }
    }
    return folders.sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));
  } catch {
    return [];
  }
}

export async function readV4Metadata(folderPath: string): Promise<string> {
  const result = await Filesystem.readFile({
    path: `${folderPath}/${BACKUP_V4_METADATA}`,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
  });
  if (typeof result.data === "string") return result.data;
  return result.data.text();
}

export async function readV4ImageFile(folderPath: string, fileName: string): Promise<string> {
  const result = await Filesystem.readFile({
    path: `${folderPath}/${fileName}`,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
  });
  if (typeof result.data === "string") return result.data;
  return result.data.text();
}

export async function listDefaultBackupFiles(): Promise<BackupFileEntry[]> {
  if (!isNativeBackupFolderAvailable()) {
    return [];
  }

  await ensureDefaultBackupFolder();
  const result = await Filesystem.readdir({
    path: DEFAULT_BACKUP_FOLDER,
    directory: Directory.Documents,
  });

  return result.files
    .filter(isBackupJsonFile)
    .map((file) => ({
      name: file.name,
      path: `${DEFAULT_BACKUP_FOLDER}/${file.name}`,
      size: file.size,
      mtime: file.mtime,
      uri: file.uri,
    }))
    .sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));
}

export async function readDefaultBackupFile(fileName: string): Promise<string> {
  const result = await Filesystem.readFile({
    path: `${DEFAULT_BACKUP_FOLDER}/${fileName}`,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
  });

  if (typeof result.data === "string") {
    return result.data;
  }

  return result.data.text();
}

export function downloadBackup(backup: WardrobeBackup) {
  downloadBackupData(JSON.stringify(backup, null, 2), getBackupFileName(backup.exportedAt));
}

function downloadBackupData(data: string, fileName: string) {
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function ensureDefaultBackupFolder() {
  try {
    await Filesystem.mkdir({
      path: DEFAULT_BACKUP_FOLDER,
      directory: Directory.Documents,
      recursive: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (!message.includes("exist")) {
      throw error;
    }
  }
}

function isBackupJsonFile(file: FileInfo) {
  return file.type === "file" && file.name.toLowerCase().endsWith(".json");
}
