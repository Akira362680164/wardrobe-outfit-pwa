// ============================================================
// 图片链路 (v0.8.14+ 新规则)
// ============================================================
// 核心原则:
//   1. 本地原图: 不压缩, 永久本机保存 (fileToOriginalDataUrl)
//   2. AI 识别图: 2400px / q=0.90 默认, 目标 2-4MB, 自适应降级
//      (fileToAiRequestDataUrl)
//   3. AI 返回: cropBox (归一化 0-1)
//   4. 最终裁切: 永远从原图做 (cropFromOriginal), 禁止用 AI 压缩图
//
// 旧函数 (fileToCompressedDataUrl / cropImageDataUrl) 保留向后兼容
// ============================================================

import { convertHeicToJpegNative } from "@/lib/native-heic-converter";

// ===== AI 识别图默认参数 (衣物拆分默认档) =====
const AI_REQUEST_MAX_SIDE = 2400;
const AI_REQUEST_QUALITY = 0.90;
// 自适应降级链: > 4MB → 降一档, > 6MB → 再降一档
const AI_REQUEST_DOWNGRADE = [
  { maxSide: 2200, quality: 0.88 }, // > 4MB
  { maxSide: 2000, quality: 0.86 }, // > 6MB
];
const AI_REQUEST_TARGET_MB = 4;
const AI_REQUEST_HARD_LIMIT_MB = 6;

// ===== 旧链路默认参数 (向后兼容) =====
const LEGACY_MAX_SIDE = 1400;
const LEGACY_QUALITY = 0.82;

// ===== 原图保护 =====
const ORIGINAL_MAX_SIZE = 50 * 1024 * 1024; // 50MB
const ORIGINAL_MIN_SIDE = 2000;             // 视为"原图"最小长边
const HEIC_DISPLAY_MAX_SIDE = 3000;
const HEIC_DISPLAY_QUALITY = 0.92;

export interface NormalizedCropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ============================================================
// 1. 原图 (不压缩, 永久本机保存)
// ============================================================
// v0.9.33-dev: <input type="file" accept> 用的图片类型常量。
// - 包含 HEIC/HEIF 让 iPhone 拍照默认格式能进入 onChange
// - 注意: Android WebView 的 file.type 对 .heic/.heif 后缀的 File 经常是空字符串,
//   所以检测时还得看扩展名 (isHeicFile 内部处理)
export const IMAGE_FILE_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

const HEIC_EXT_RE = /\.hei[cf]$/i;
const heicConversionCache = new WeakMap<File, Promise<File>>();

/** v0.9.33-dev: 判定 File 是否为 HEIC/HEIF (iPhone 拍照默认格式) */
export function isHeicFile(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t === "image/heic" || t === "image/heif") return true;
  if (HEIC_EXT_RE.test(file.name)) return true;
  return false;
}

export async function convertHeicToJpeg(file: File): Promise<File> {
  if (!isHeicFile(file)) return file;
  const cached = heicConversionCache.get(file);
  if (cached) return cached;

  const conversion = convertHeicToJpegUncached(file).catch(() => {
    heicConversionCache.delete(file);
    throw new Error("HEIC 转码失败，建议在系统相机设置中改成 JPEG/最兼容后重试");
  });
  heicConversionCache.set(file, conversion);
  return conversion;
}

async function convertHeicToJpegUncached(file: File): Promise<File> {
  const nativeConverted = await convertHeicToJpegNative(file, {
    maxSide: HEIC_DISPLAY_MAX_SIDE,
    quality: Math.round(HEIC_DISPLAY_QUALITY * 100),
  });
  if (nativeConverted) return nativeConverted;

  let heic2any: (opts: { blob: Blob; toType: string; quality?: number }) => Promise<Blob | Blob[]>;
  try {
    const mod = await import("heic2any");
    heic2any = (mod.default ?? (mod as unknown)) as typeof heic2any;
  } catch {
    throw new Error("HEIC 转码失败，建议在系统相机设置中改成 JPEG/最兼容后重试");
  }
  let output: Blob | Blob[];
  try {
    output = await heic2any({ blob: file, toType: "image/jpeg", quality: HEIC_DISPLAY_QUALITY });
  } catch {
    throw new Error("HEIC 转码失败，建议在系统相机设置中改成 JPEG/最兼容后重试");
  }
  const resultBlob = Array.isArray(output) ? output[0] : output;
  if (!resultBlob) throw new Error("HEIC 转码返回为空");
  const newName = file.name.replace(HEIC_EXT_RE, ".jpg") || `${file.name}.jpg`;
  const converted = new File([resultBlob], newName, { type: "image/jpeg", lastModified: file.lastModified });
  return compressToJpegFile(converted, newName, HEIC_DISPLAY_MAX_SIDE, HEIC_DISPLAY_QUALITY);
}

export async function fileToOriginalDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/") && !isHeicFile(file)) {
    throw new Error("请上传图片文件");
  }
  if (file.size > ORIGINAL_MAX_SIZE) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    throw new Error(
      `图片 ${sizeMB}MB 超过 50MB 上限。建议用系统自带编辑器或第三方 app 压缩后再上传；HEIC 可在相机设置里改成 JPEG。`,
    );
  }
  // v0.9.33-dev: HEIC 先转码再走原图链路 (一次性 cache, 后续读 FileReader 即可)
  const normalized = await convertHeicToJpeg(file);
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("读取原图失败"));
    reader.readAsDataURL(normalized);
  });
}

// ============================================================
// 2. AI 识别图 (2400px / q=0.90, 自适应降级)
// ============================================================
export async function fileToAiRequestDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/") && !isHeicFile(file)) {
    throw new Error("请上传图片文件");
  }
  if (file.size > ORIGINAL_MAX_SIZE) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    throw new Error(`图片 ${sizeMB}MB 超过 50MB 上限`);
  }
  // v0.9.33-dev: HEIC 先转码 (compressToDataUrl 内部 createImageBitmap 不支持 HEIC)
  const normalized = await convertHeicToJpeg(file);

  // 第 1 试: 默认 2400 / 0.90
  let dataUrl = await compressToDataUrl(normalized, AI_REQUEST_MAX_SIDE, AI_REQUEST_QUALITY);
  let sizeMB = dataUrlSizeMB(dataUrl);
  if (sizeMB <= AI_REQUEST_TARGET_MB) return dataUrl;

  // 自适应降级
  for (let i = 0; i < AI_REQUEST_DOWNGRADE.length; i++) {
    const step = AI_REQUEST_DOWNGRADE[i];
    dataUrl = await compressToDataUrl(normalized, step.maxSide, step.quality);
    sizeMB = dataUrlSizeMB(dataUrl);
    if (sizeMB <= AI_REQUEST_TARGET_MB) return dataUrl;
  }

  // 走到这里说明最后一档仍 > 4MB
  if (sizeMB > AI_REQUEST_HARD_LIMIT_MB) {
    console.warn(
      `[fileToAiRequestDataUrl] 图片 ${sizeMB.toFixed(1)}MB 仍超 ${AI_REQUEST_HARD_LIMIT_MB}MB, 继续使用 ${AI_REQUEST_DOWNGRADE[AI_REQUEST_DOWNGRADE.length - 1].maxSide}px`,
    );
  }
  return dataUrl;
}

function dataUrlSizeMB(dataUrl: string): number {
  // base64 编码 = (原始长度 * 4) / 3, dataURL 头部约 23 字节
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx < 0) return 0;
  const base64 = dataUrl.slice(commaIdx + 1);
  return (base64.length * 3 / 4) / (1024 * 1024);
}

// ============================================================
// 3. 旧 fileToCompressedDataUrl (向后兼容, 走 1400/0.82 旧档)
// ============================================================
export async function fileToCompressedDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/") && !isHeicFile(file)) {
    throw new Error("请上传图片文件");
  }
  if (file.size > ORIGINAL_MAX_SIZE) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    throw new Error(
      `图片 ${sizeMB}MB 超过 50MB 上限。建议：手机拍照用普通像素模式（约 12MP / 长边 4000px 已足够识别衣物）；用系统自带编辑器或第三方 app 压缩后再上传；HEIC 可在相机设置里改成 JPEG。`,
    );
  }
  // v0.9.33-dev: HEIC 先转码
  const normalized = await convertHeicToJpeg(file);
  return compressToDataUrl(normalized, LEGACY_MAX_SIDE, LEGACY_QUALITY);
}

// ============================================================
// 4. 从原图按 cropBox 高清裁切 (新链路核心)
// ============================================================
export async function cropFromOriginal(
  originalDataUrl: string,
  box: NormalizedCropBox,
): Promise<string> {
  const safeBox = normalizeCropBox(box);
  const bitmap = await createImageBitmap(await dataUrlToBlob(originalDataUrl));
  const sourceX = Math.round(safeBox.x * bitmap.width);
  const sourceY = Math.round(safeBox.y * bitmap.height);
  const sourceWidth = Math.max(1, Math.round(safeBox.width * bitmap.width));
  const sourceHeight = Math.max(1, Math.round(safeBox.height * bitmap.height));

  // 不缩放！保持原图分辨率
  const canvas = document.createElement("canvas");
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("图片裁剪失败");
  }
  context.drawImage(
    bitmap, sourceX, sourceY, sourceWidth, sourceHeight,
    0, 0, sourceWidth, sourceHeight,
  );
  bitmap.close();
  // 高清导出 (q=0.92 比识别图更高, 因为这是用户最终看的)
  return canvas.toDataURL("image/jpeg", 0.92);
}

// ============================================================
// 5. AI 返回的 cropBox 外扩 (避免 AI 框紧贴衣物边缘, 默认 10%)
// ============================================================
// v0.9.0 I6 修复: 改名 expandAiCropBox, 明确与 cropper-math 的 SAFE_MARGIN_RATIO
//   是两套独立机制:
//     - expandAiCropBox: 给 AI 识别的归一化 box 加 10% 边距, 防止裁掉衣物边缘
//     - cropper-math SAFE_MARGIN_RATIO: 裁切视窗内图片四周留 10% 安全距离, 防误触
// ============================================================
export function expandAiCropBox(
  box: NormalizedCropBox,
  factor: number = 0.10,
): NormalizedCropBox {
  if (!Number.isFinite(factor) || factor < 0) factor = 0;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const newW = box.width * (1 + factor);
  const newH = box.height * (1 + factor);
  const x = Math.max(0, cx - newW / 2);
  const y = Math.max(0, cy - newH / 2);
  return normalizeCropBox({ x, y, width: newW, height: newH });
}

// ============================================================
// 6. 旧 cropImageDataUrl (向后兼容, 压缩到 1400px)
// ============================================================
export async function cropImageDataUrl(
  dataUrl: string,
  box?: NormalizedCropBox,
): Promise<string> {
  if (!box) {
    // 无 box, 仅压缩
    try {
      const bitmap = await createImageBitmap(await dataUrlToBlob(dataUrl));
      const scale = Math.min(1, LEGACY_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
      if (scale >= 1) { bitmap.close(); return dataUrl; }
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      return ctx ? canvas.toDataURL("image/jpeg", LEGACY_QUALITY) : dataUrl;
    } catch { return dataUrl; }
  }

  const safeBox = normalizeCropBox(box);
  const bitmap = await createImageBitmap(await dataUrlToBlob(dataUrl));
  const sourceX = Math.round(safeBox.x * bitmap.width);
  const sourceY = Math.round(safeBox.y * bitmap.height);
  const sourceWidth = Math.max(1, Math.round(safeBox.width * bitmap.width));
  const sourceHeight = Math.max(1, Math.round(safeBox.height * bitmap.height));
  const scale = Math.min(1, LEGACY_MAX_SIDE / Math.max(sourceWidth, sourceHeight));

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("图片裁剪失败");
  }
  context.drawImage(
    bitmap, sourceX, sourceY, sourceWidth, sourceHeight,
    0, 0, canvas.width, canvas.height,
  );
  bitmap.close();
  return canvas.toDataURL("image/jpeg", LEGACY_QUALITY);
}

// ============================================================
// 7. 检测 dataUrl 是否为"原图" (向后兼容旧数据)
// ============================================================
export async function isOriginalQuality(dataUrl: string): Promise<boolean> {
  try {
    const blob = await dataUrlToBlob(dataUrl);
    const bitmap = await createImageBitmap(blob);
    const maxSide = Math.max(bitmap.width, bitmap.height);
    bitmap.close();
    return maxSide >= ORIGINAL_MIN_SIDE;
  } catch {
    return false;
  }
}

// ============================================================
// 8. 工具函数
// ============================================================
export async function dataUrlToFile(dataUrl: string, filename = "garment.jpg") {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type || "image/jpeg" });
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);
  return response.blob();
}

async function compressToJpegFile(
  file: File,
  filename: string,
  maxSide: number,
  quality: number,
): Promise<File> {
  const dataUrl = await compressToDataUrl(file, maxSide, quality);
  return dataUrlToFile(dataUrl, filename);
}

// 通用压缩 (供多个函数复用)
// 关键: 只传 resizeWidth 或 resizeHeight 一边 (避免 WebView 强制方形)
async function compressToDataUrl(
  file: File,
  maxSide: number,
  quality: number,
): Promise<string> {
  const size = await readImageSize(file);
  if (!size) {
    // 读不到尺寸, fallback 直接读
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("读取失败"));
      reader.readAsDataURL(file);
    });
  }

  if (Math.max(size.width, size.height) <= maxSide) {
    // 不需要缩放, 但要 toDataURL 标准化 JPEG
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) { bitmap.close(); throw new Error("图片处理失败"); }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", quality);
  }

  // 只传大的一边 (避免 WebView 强制方形输出)
  const isWidthDominant = size.width >= size.height;
  const bitmap = await createImageBitmap(
    file,
    isWidthDominant
      ? { resizeWidth: maxSide, resizeQuality: "high" }
      : { resizeHeight: maxSide, resizeQuality: "high" },
  );
  // createImageBitmap 已按 maxSide 缩放, bitmap 尺寸已 < maxSide
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) { bitmap.close(); throw new Error("图片处理失败"); }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}

async function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  const header = await file.slice(0, 512 * 1024).arrayBuffer();
  const view = new DataView(header);
  const bytes = new Uint8Array(header);

  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  if (bytes.length >= 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < view.byteLength) {
      if (view.getUint8(offset) !== 0xff) {
        offset += 1;
        continue;
      }
      while (offset < view.byteLength && view.getUint8(offset) === 0xff) offset += 1;
      const marker = view.getUint8(offset);
      offset += 1;
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > view.byteLength) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > view.byteLength) break;
      if (
        marker === 0xc0 || marker === 0xc1 || marker === 0xc2 || marker === 0xc3 ||
        marker === 0xc5 || marker === 0xc6 || marker === 0xc7 ||
        marker === 0xc9 || marker === 0xca || marker === 0xcb ||
        marker === 0xcd || marker === 0xce || marker === 0xcf
      ) {
        return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
      }
      offset += length;
    }
  }

  return null;
}

function normalizeCropBox(box: NormalizedCropBox) {
  const x = clamp(box.x);
  const y = clamp(box.y);
  const width = clamp(box.width, 0.08, 1 - x);
  const height = clamp(box.height, 0.08, 1 - y);
  return { x, y, width, height };
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
