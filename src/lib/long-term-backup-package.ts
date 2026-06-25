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

// Assert manifest from unknown input - strict validation
export function assertLongTermBackupManifest(input: unknown): LongTermBackupManifest {
  if (!input || typeof input !== "object") throw new Error("备份包格式不正确：manifest 必须是对象");
  const m = input as Record<string, unknown>;

  if (m.packageVersion !== 1) throw new Error(`不支持的包版本: ${m.packageVersion}，当前只支持版本 1`);
  if (m.appName !== "衣橱穿搭助手") throw new Error(`备份包应用名不正确: ${m.appName}`);
  if (typeof m.appVersion !== "string" || !m.appVersion) throw new Error("备份包缺少 App 版本号");
  if (m.backupVersion !== 5) throw new Error(`不支持的备份版本: ${m.backupVersion}，当前只支持版本 5`);
  if (typeof m.exportedAt !== "string" || isNaN(Date.parse(m.exportedAt))) throw new Error("备份包缺少有效的导出时间");
  if (typeof m.imageCount !== "number" || m.imageCount < 0 || !Number.isInteger(m.imageCount)) throw new Error("备份包图片数量无效");
  if (m.metadataFile !== "metadata.json") throw new Error("备份包 metadata 文件名不正确");
  if (m.imageDir !== "images") throw new Error("备份包图片目录名不正确");
  if (m.fileExtension !== ".wardrobebackup") throw new Error("备份包文件扩展名不正确");

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