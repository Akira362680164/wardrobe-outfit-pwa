import type { WardrobeBackup } from "@/lib/types";

// Long-term backup package constants
export const LONG_TERM_BACKUP_EXTENSION = ".wardrobebackup";
export const LONG_TERM_BACKUP_DIR_LABEL = "Download/衣橱穿搭助手备份";
export const LONG_TERM_BACKUP_LATEST_FILE_NAME = "衣橱穿搭助手-latest.wardrobebackup";
export const LONG_TERM_BACKUP_MANIFEST_FILE = "manifest.json";
export const LONG_TERM_BACKUP_METADATA_FILE = "metadata.json";
export const LONG_TERM_BACKUP_IMAGE_DIR = "images";

// Long-term backup manifest
export interface LongTermBackupManifest {
  packageVersion: number;
  appName: string;
  appVersion: string;
  backupVersion: number;
  exportedAt: string;
  imageCount: number;
  metadataFile: string;
  imageDir: string;
  fileExtension: string;
}

// Long-term backup file entry (returned from listDefaultBackups)
export interface LongTermBackupFileEntry {
  name: string;
  size: number;
  mtime: number;
  isLatest: boolean;
}

// Timestamp filename generator
export function getLongTermBackupTimestampFileName(exportedAt: string): string {
  const stamp = exportedAt
    .replaceAll(":", "-")
    .replaceAll(".", "-")
    .replace("T", "-")
    .replace("Z", "");
  return `衣橱穿搭助手-${stamp}${LONG_TERM_BACKUP_EXTENSION}`;
}

// Create manifest from input
export function createLongTermBackupManifest(input: {
  appVersion: string;
  backup: WardrobeBackup;
  imageCount: number;
}): LongTermBackupManifest {
  return {
    packageVersion: 1,
    appName: "衣橱穿搭助手",
    appVersion: input.appVersion,
    backupVersion: 5,
    exportedAt: input.backup.exportedAt,
    imageCount: input.imageCount,
    metadataFile: LONG_TERM_BACKUP_METADATA_FILE,
    imageDir: LONG_TERM_BACKUP_IMAGE_DIR,
    fileExtension: LONG_TERM_BACKUP_EXTENSION,
  };
}

// Assert manifest from unknown input
export function assertLongTermBackupManifest(input: unknown): LongTermBackupManifest {
  if (!input || typeof input !== "object") throw new Error("Invalid manifest format");
  const m = input as Record<string, unknown>;
  if (typeof m.packageVersion !== "number") throw new Error("Missing packageVersion");
  if (typeof m.appName !== "string") throw new Error("Missing appName");
  if (typeof m.backupVersion !== "number") throw new Error("Missing backupVersion");
  if (typeof m.exportedAt !== "string") throw new Error("Missing exportedAt");
  return m as unknown as LongTermBackupManifest;
}

// Check if filename is a long-term backup file
export function isLongTermBackupFileName(fileName: string): boolean {
  return fileName.endsWith(LONG_TERM_BACKUP_EXTENSION);
}

// Sort backup files: latest first, then by mtime descending
export function sortLongTermBackupFiles(files: LongTermBackupFileEntry[]): LongTermBackupFileEntry[] {
  return [...files].sort((a, b) => {
    // latest always first
    if (a.isLatest && !b.isLatest) return -1;
    if (!a.isLatest && b.isLatest) return 1;
    // then by mtime descending
    return b.mtime - a.mtime;
  });
}

// Build result from long-term backup entries
export interface LongTermBackupEntryBuildResult {
  exportedAt: string;
  timestampFileName: string;
  latestFileName: string;
  manifestJson: string;
  metadataJson: string;
  imageEntries: Array<{ path: string; fileName: string; text: string }>;
  imageCount: number;
}