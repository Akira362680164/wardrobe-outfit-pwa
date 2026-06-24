// src/lib/image-variants.ts
// ============================================================
// 图片变体生成 (v0.9.43-dev, 批次 1 缩略图基础设施)
// ------------------------------------------------------------
// 用途: 为已保存的 dataURL 生成"展示图 / 缩略图 / 卡片缩略图"
// 三种变体, 供瀑布流卡片 / 详情页 / 多图预览使用。
//
// 规格建议 (按批次 1 提示词包):
// - 展示图:  长边 1200-1600px, 质量 0.82-0.88, 保留原比例
// - 缩略图:  宽 480-600px,   质量 0.72-0.80
// - 卡片缩略图: 4:5 center-cover, 宽 480-600px
// - WebP 优先, JPEG fallback
// - 失败抛错 (不静默返回空串)
//
// 限制:
// - 仅浏览器环境 (依赖 createImageBitmap / canvas)
// - 输入必须是 dataURL (data:image/...)
// - 本批只加工具函数, 不接入新录入流程 (批次 2 才接入)
// ============================================================

// ===== 内部常量 (变体规格) =====

const DISPLAY_DEFAULT_MAX_SIDE = 1400;
const DISPLAY_DEFAULT_QUALITY = 0.85;

const THUMBNAIL_DEFAULT_WIDTH = 540;
const THUMBNAIL_DEFAULT_QUALITY = 0.76;

const CARD_DEFAULT_WIDTH = 540;
const CARD_DEFAULT_HEIGHT = 675; // 4:5
const CARD_DEFAULT_QUALITY = 0.76;

// 公开版本号: 未来调整缩略图规格 (尺寸/质量/格式) 时升级, 触发老数据重建
export const CURRENT_THUMBNAIL_VERSION = 1;

// ===== 类型 =====

export type VariantFit = "contain" | "cover";

export interface ImageVariantOptions {
  /** 长边最大像素 (display 用, 与 width 互斥优先级低于显式 width) */
  maxSide?: number;
  /** 显式宽度 (优先级高于 maxSide) */
  width?: number;
  /** 显式高度 (与 width 配合, cover/contain 模式) */
  height?: number;
  /** 适配模式, 默认为 "contain" (保持完整内容) */
  fit?: VariantFit;
  /** 输出 mime type, 默认 image/webp (浏览器不支持时降级 image/jpeg) */
  mimeType?: "image/webp" | "image/jpeg";
  /** 0-1, 仅对 image/jpeg 生效, image/webp 多数浏览器忽略 */
  quality?: number;
}

// ===== 浏览器环境检测 =====

function hasBrowserImageStack(): boolean {
  if (typeof globalThis === "undefined") return false;
  if (typeof (globalThis as { HTMLCanvasElement?: unknown }).HTMLCanvasElement === "undefined") return false;
  if (
    typeof (globalThis as { createImageBitmap?: unknown }).createImageBitmap === "undefined" &&
    typeof (globalThis as { HTMLImageElement?: unknown }).HTMLImageElement === "undefined"
  ) return false;
  return true;
}

function hasOffscreenCanvas(): boolean {
  if (typeof globalThis === "undefined") return false;
  return typeof (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas !== "undefined";
}

// ===== WebP 支持检测 =====

let _webpSupportCache: boolean | null = null;

/**
 * 检测当前环境是否支持 image/webp dataURL 输出。
 * - 浏览器: 真正画 1x1 canvas 测 toDataURL("image/webp")
 * - Node/SSR: 直接返回 false (本批仅在浏览器生成, 业务侧可放心 fallback JPEG)
 */
export function supportsWebpDataUrl(): Promise<boolean> {
  if (_webpSupportCache !== null) {
    return Promise.resolve(_webpSupportCache);
  }
  if (typeof document === "undefined") {
    _webpSupportCache = false;
    return Promise.resolve(false);
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      _webpSupportCache = false;
      return Promise.resolve(false);
    }
    ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.fillRect(0, 0, 1, 1);
    const dataUrl = canvas.toDataURL("image/webp");
    _webpSupportCache = dataUrl.startsWith("data:image/webp");
    return Promise.resolve(_webpSupportCache);
  } catch {
    _webpSupportCache = false;
    return Promise.resolve(false);
  }
}

// ===== 内部工具函数 =====

function assertDataUrl(dataUrl: unknown): asserts dataUrl is string {
  if (typeof dataUrl !== "string") {
    throw new Error("image-variants: 期望 dataURL 字符串");
  }
  if (!dataUrl.startsWith("data:image/")) {
    throw new Error("image-variants: 输入不是合法的 dataURL (应以 data:image/ 开头)");
  }
  if (dataUrl.length < 32) {
    throw new Error("image-variants: dataURL 过短, 可能为空或损坏");
  }
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error("image-variants: dataURL 解析失败");
  }
  return response.blob();
}

function isSvgDataUrl(dataUrl: string): boolean {
  return /^data:image\/svg\+xml[,;]/i.test(dataUrl);
}

interface DecodedImage {
  image: CanvasImageSource;
  width: number;
  height: number;
  close?: () => void;
}

function loadImageElement(dataUrl: string): Promise<DecodedImage> {
  return new Promise((resolve, reject) => {
    if (typeof Image === "undefined") {
      reject(new Error("image-variants: 当前环境不支持 HTMLImageElement 解码"));
      return;
    }
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      if (width <= 0 || height <= 0) {
        reject(new Error("image-variants: 图片解码后尺寸无效"));
        return;
      }
      resolve({ image: img, width, height });
    };
    img.onerror = () => reject(new Error("image-variants: HTMLImageElement 解码失败"));
    img.src = dataUrl;
  });
}

async function decodeDataUrlImage(dataUrl: string): Promise<DecodedImage> {
  const canUseBitmap = typeof createImageBitmap === "function";
  const shouldPreferElement = isSvgDataUrl(dataUrl);
  if (canUseBitmap && !shouldPreferElement) {
    try {
      const blob = await dataUrlToBlob(dataUrl);
      const bitmap = await createImageBitmap(blob);
      return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch (error) {
      if (typeof HTMLImageElement === "undefined") throw error;
    }
  }
  return loadImageElement(dataUrl);
}

interface CanvasLike {
  width: number;
  height: number;
  getContext: (type: "2d") => CanvasRenderingContext2D | null;
}

function createCanvas(width: number, height: number): CanvasLike {
  if (hasOffscreenCanvas()) {
    return new OffscreenCanvas(width, height) as unknown as CanvasLike;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function canvasToBlob(canvas: CanvasLike, mimeType: string, quality: number): Promise<Blob> {
  if (typeof (canvas as { convertToBlob?: unknown }).convertToBlob === "function") {
    return (canvas as unknown as { convertToBlob: (opts: { type: string; quality: number }) => Promise<Blob> })
      .convertToBlob({ type: mimeType, quality });
  }
  return new Promise<Blob>((resolve, reject) => {
    if (typeof HTMLCanvasElement === "undefined" || !(canvas instanceof HTMLCanvasElement)) {
      reject(new Error("image-variants: 当前环境不支持 canvas blob 导出"));
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("image-variants: canvas 导出失败 (toBlob 返回 null)"));
        return;
      }
      resolve(blob);
    }, mimeType, quality);
  });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("image-variants: blob 读取失败"));
    reader.readAsDataURL(blob);
  });
}

/**
 * 内部共用: 给定源 dataURL + 目标尺寸 + fit 模式, 编码为 dataURL。
 * 失败时抛 Error, 永不静默。
 */
async function encodeVariant(
  dataUrl: string,
  targetWidth: number,
  targetHeight: number,
  fit: VariantFit,
  options: ImageVariantOptions,
): Promise<string> {
  assertDataUrl(dataUrl);
  if (!hasBrowserImageStack()) {
    throw new Error("image-variants: 当前环境不支持图片处理 (缺少 canvas / createImageBitmap)");
  }
  if (targetWidth <= 0 || targetHeight <= 0) {
    throw new Error(`image-variants: 目标尺寸非法 (${targetWidth}x${targetHeight})`);
  }
  const webpOk = await supportsWebpDataUrl();
  const requestedMime = options.mimeType ?? "image/webp";
  const mimeType = requestedMime === "image/webp" && !webpOk ? "image/jpeg" : requestedMime;
  const quality = options.quality ?? (mimeType === "image/webp" ? 0.82 : 0.85);

  const decoded = await decodeDataUrlImage(dataUrl);
  try {
    const canvas = createCanvas(targetWidth, targetHeight);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("image-variants: 无法获取 canvas 2d 上下文");
    }
    // 透明背景 + 白底 contain: 避免 PNG 透明转 JPEG 出现黑底
    if (fit === "cover") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetWidth, targetHeight);
    }
    const { sx, sy, sw, sh, dx, dy, dw, dh } = computeDrawRect(
      decoded.width,
      decoded.height,
      targetWidth,
      targetHeight,
      fit,
    );
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(decoded.image, sx, sy, sw, sh, dx, dy, dw, dh);
    const outBlob = await canvasToBlob(canvas, mimeType, quality);
    return await blobToDataUrl(outBlob);
  } finally {
    decoded.close?.();
  }
}

function computeDrawRect(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  fit: VariantFit,
): { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number } {
  if (fit === "cover") {
    // 居中裁切 (center-cover): 按目标宽高比裁源, 填满
    const targetRatio = dstW / dstH;
    const srcRatio = srcW / srcH;
    let sw = srcW;
    let sh = srcH;
    if (srcRatio > targetRatio) {
      // 源更宽, 横向裁
      sw = Math.round(srcH * targetRatio);
    } else {
      // 源更高, 纵向裁
      sh = Math.round(srcW / targetRatio);
    }
    const sx = Math.round((srcW - sw) / 2);
    const sy = Math.round((srcH - sh) / 2);
    return { sx, sy, sw, sh, dx: 0, dy: 0, dw: dstW, dh: dstH };
  }
  // contain: 等比缩放, 完整放入 dst
  const scale = Math.min(dstW / srcW, dstH / srcH);
  const dw = Math.max(1, Math.round(srcW * scale));
  const dh = Math.max(1, Math.round(srcH * scale));
  const dx = Math.round((dstW - dw) / 2);
  const dy = Math.round((dstH - dh) / 2);
  return { sx: 0, sy: 0, sw: srcW, sh: srcH, dx, dy, dw, dh };
}

// ===== 公开 API =====

/**
 * 展示图: 长边 1200-1600px, 质量 0.82-0.88, 保留原比例 (contain 在原图比例内)。
 * 失败抛错, 不静默。
 */
export async function createDisplayImageDataUrl(
  dataUrl: string,
  options: ImageVariantOptions = {},
): Promise<string> {
  const maxSide = options.maxSide ?? DISPLAY_DEFAULT_MAX_SIDE;
  // display: 不知道目标比例, 先用 maxSide 作正方形上限; 实际 contain 后会等比
  // 简化: display 模式用 contain, srcW/srcH 由源决定, 目标尺寸直接取 (maxSide, maxSide),
  //       computeDrawRect contain 会等比缩放 + 居中, 留白透明
  return encodeVariant(
    dataUrl,
    maxSide,
    maxSide,
    options.fit ?? "contain",
    {
      ...options,
      mimeType: options.mimeType ?? "image/webp",
      quality: options.quality ?? DISPLAY_DEFAULT_QUALITY,
    },
  );
}

/**
 * 缩略图: 宽 480-600px, 质量 0.72-0.80, 保持原比例 (contain)。
 * 失败抛错, 不静默。
 */
export async function createThumbnailDataUrl(
  dataUrl: string,
  options: ImageVariantOptions = {},
): Promise<string> {
  const width = options.width ?? THUMBNAIL_DEFAULT_WIDTH;
  return encodeVariant(
    dataUrl,
    width,
    width,
    options.fit ?? "contain",
    {
      ...options,
      mimeType: options.mimeType ?? "image/webp",
      quality: options.quality ?? THUMBNAIL_DEFAULT_QUALITY,
    },
  );
}

/**
 * 卡片缩略图: 4:5 center-cover, 宽 480-600px, 质量 0.72-0.80。
 * 适合衣物卡片 / 多图预览底部小方块 (4:5 比 1:1 更接近衣物实际比例)。
 * 失败抛错, 不静默。
 */
export async function createCardThumbnailDataUrl(
  dataUrl: string,
  options: ImageVariantOptions = {},
): Promise<string> {
  const width = options.width ?? CARD_DEFAULT_WIDTH;
  const height = options.height ?? CARD_DEFAULT_HEIGHT;
  return encodeVariant(
    dataUrl,
    width,
    height,
    options.fit ?? "cover",
    {
      ...options,
      mimeType: options.mimeType ?? "image/webp",
      quality: options.quality ?? CARD_DEFAULT_QUALITY,
    },
  );
}
