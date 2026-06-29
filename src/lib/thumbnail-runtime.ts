// src/lib/thumbnail-runtime.ts
// ============================================================
// 缩略图运行时 helper (v0.9.43-dev, 批次 2 接入新图片写入链路)
// ------------------------------------------------------------
// 用途: 封装"生成缩略图 + 失败 fallback"模式, 给 saveDraft /
// handleGallerySelect / 队列裁切 / 参考图裁切 / 编辑页裁切等
// 写入点复用, 避免每个调用点重复 try/catch。
//
// 纪律 (按批次 2 提示词包 §1):
// - 失败永远不抛错, 不阻断主流程
// - 失败时返回 { thumbnailStatus: "failed", errorMessage, errorTag }
// - 成功时返回 url + version + updatedAt + status="ready"
//
// 失败分类 (按 v1.1.16 commit3 提示词 §5.4.1):
// - "decode"   dataURL → blob / ImageBitmap 解码失败
// - "draw"     canvas drawImage 失败
// - "encode"   canvas toBlob / toDataURL 输出失败 (含 WebP 不支持)
// - "write"    暂时不写 Dexie, 留给调用方处理
//
// 降级策略: 优先使用调用方指定的 mimeType, 失败时自动 fallback 到
// image/jpeg (质量 0.78), 仍失败才返回 failed 状态 (不抛异常)。
//
// 不引入 React / Dexie 依赖, 纯 helper, 可在任意环境调用
// (浏览器 canvas 缺失时内部 try/catch 兜住)。
// ============================================================

import { CURRENT_THUMBNAIL_VERSION, type ThumbnailStatus } from "@/lib/types";
import { cropFromOriginal, type NormalizedCropBox } from "@/lib/image";
import { createThumbnailDataUrl, supportsWebpDataUrl } from "@/lib/image-variants";

export type ThumbnailErrorTag = "decode" | "draw" | "encode" | "write" | "other";

export interface ThumbnailGenResult {
  thumbnailDataUrl?: string;
  thumbnailVersion?: number;
  thumbnailUpdatedAt?: string;
  thumbnailStatus?: ThumbnailStatus;
  /** 用户可读的失败原因 (失败时填充, 成功时不返回) */
  errorMessage?: string;
  /** 失败分类 tag, 用于 UI 简单聚合 (decode / draw / encode / write / other) */
  errorTag?: ThumbnailErrorTag;
}

const JPEG_FALLBACK_QUALITY = 0.78;

function toUserReadableError(err: unknown, tag: ThumbnailErrorTag): string {
  const raw = err instanceof Error ? err.message : String(err);
  // Android WebView / 部分 canvas 实现抛的 message 含 stack 或 base64,
  // 这里只保留可读分类 + 第一行, 绝不暴露完整 stack / dataURL 全文
  const firstLine = raw.split("\n")[0]?.trim() ?? "";
  if (tag === "decode") {
    return `图片解码失败 (${firstLine || "ImageBitmap 解析失败"})`;
  }
  if (tag === "draw") {
    return `画布绘制失败 (${firstLine || "canvas drawImage 失败"})`;
  }
  if (tag === "encode") {
    return `图片编码失败 (${firstLine || "toDataURL 输出失败"})`;
  }
  if (tag === "write") {
    return `缩略图写回失败 (${firstLine || "Dexie update 失败"})`;
  }
  return `缩略图生成失败 (${firstLine || "未知错误"})`;
}

/**
 * 生成缩略图并返回元信息。失败时返回 `{ thumbnailStatus: "failed", errorMessage, errorTag }`。
 * 永远不抛错, 永远不阻断调用方。
 *
 * @param sourceDataUrl 源图 dataURL (主图 / 参考图 / 队列 item 裁切后)
 * @param options 同 image-variants 的 ImageVariantOptions (覆盖默认 width/mimeType/quality)
 */
export async function generateThumbnailSafe(
  sourceDataUrl: string | undefined | null,
  options?: { width?: number; mimeType?: "image/webp" | "image/jpeg"; quality?: number },
): Promise<ThumbnailGenResult> {
  if (typeof sourceDataUrl !== "string" || !sourceDataUrl) {
    // 没有源图, 不生成, 也不标 failed (这不算生成失败, 算"无源图")
    return {};
  }
  const now = new Date().toISOString();
  // 决定首选 mimeType: 调用方指定 → 跟随; 否则 webp (但 webp 浏览器实测失败时降级 jpeg)
  const preferredMime: "image/webp" | "image/jpeg" = options?.mimeType ?? "image/webp";
  // 当首选 webp 但环境不支持时, 直接走 jpeg, 避免二次尝试
  let effectiveMime: "image/webp" | "image/jpeg" = preferredMime;
  if (preferredMime === "image/webp") {
    try {
      const webpOk = await supportsWebpDataUrl();
      if (!webpOk) effectiveMime = "image/jpeg";
    } catch {
      effectiveMime = "image/jpeg";
    }
  }
  const tryOrder: Array<"image/webp" | "image/jpeg"> = effectiveMime === "image/jpeg"
    ? ["image/jpeg"]
    : ["image/webp", "image/jpeg"];

  let lastErr: unknown = null;
  let lastTag: ThumbnailErrorTag = "other";
  for (const mime of tryOrder) {
    const quality = mime === "image/jpeg" && options?.quality == null
      ? JPEG_FALLBACK_QUALITY
      : options?.quality;
    try {
      const url = await createThumbnailDataUrl(sourceDataUrl, {
        ...options,
        mimeType: mime,
        ...(quality != null ? { quality } : {}),
      });
      return {
        thumbnailDataUrl: url,
        thumbnailVersion: CURRENT_THUMBNAIL_VERSION,
        thumbnailUpdatedAt: now,
        thumbnailStatus: "ready",
      };
    } catch (err) {
      lastErr = err;
      // 粗略分类: 错误 message 含 "image-variants" 关键字的视为业务错误
      const msg = err instanceof Error ? err.message : String(err);
      if (/image-variants:\s*无法获取 canvas|drawImage|encodeVariant.*draw/i.test(msg)) {
        lastTag = "draw";
      } else if (/image-variants:\s*目标尺寸|image-variants:\s*不支持|image-variants:\s*当前环境|ImageBitmap|createImageBitmap|HTMLImageElement|HTMLCanvasElement|image-variants:\s*未提供/i.test(msg)) {
        lastTag = "decode";
      } else if (/image-variants:\s*输出|encodeVariant|toBlob|toDataURL|image-variants:\s*画布|image-variants:\s*转换|webp.*不支持|webp/i.test(msg)) {
        lastTag = "encode";
      } else if (/image-variants:\s*data:image|image-variants:\s*非法|image-variants:\s*非数据/i.test(msg)) {
        lastTag = "decode";
      } else {
        // 默认视为 encode (canvas 输出失败, 例如 webp 编码器不可用)
        lastTag = "encode";
      }
      // 单次尝试 (jpeg) 时不再循环, 跳出
      if (tryOrder.length === 1) break;
    }
  }

  // 全部失败: 返回 failed + errorMessage + errorTag, 不抛
  if (typeof console !== "undefined") {
    console.warn("[generateThumbnailSafe] 缩略图生成失败 (tag=" + lastTag + "):", lastErr);
  }
  return {
    thumbnailStatus: "failed",
    errorMessage: toUserReadableError(lastErr, lastTag),
    errorTag: lastTag,
  };
}

/** Garment thumbnails are always derived from the complete original and its crop box. */
export async function createGarmentThumbnailFromOriginal(input: {
  originalDataUrl: string;
  cropBox?: NormalizedCropBox;
}): Promise<ThumbnailGenResult> {
  const croppedDataUrl = input.cropBox
    ? await cropFromOriginal(input.originalDataUrl, input.cropBox)
    : input.originalDataUrl;
  return generateThumbnailSafe(croppedDataUrl);
}
