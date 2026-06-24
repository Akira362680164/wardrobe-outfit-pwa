// ============================================================
// cropper-math (v0.8.15 裁切器坐标纯函数)
// ============================================================
// 设计: 视窗式裁切 (QQ 风格)
//   - 1:1 框 = 图片 fit 后的短边
//   - 框不能超过图片边界 (图片自动放大覆盖)
//   - 10% 安全距离 (IDLE_FIT) ↔ 满屏 (LOCKED_FULL) 状态机
// ============================================================

// 复用 image.ts 的 NormalizedCropBox 类型 (保持命名一致: width/height)
export type { NormalizedCropBox } from "@/lib/image";

import type { NormalizedCropBox } from "@/lib/image";

function clamp(v: number, min: number, max: number): number { return Math.max(min, Math.min(max, v)); }

// 自实现 normalizeCropBox (image.ts 不导出)
function normalizeCropBox(box: NormalizedCropBox): NormalizedCropBox {
  const x = clamp(box.x, 0, 1);
  const y = clamp(box.y, 0, 1);
  const width = clamp(box.width, 0.08, 1 - x);
  const height = clamp(box.height, 0.08, 1 - y);
  return { x, y, width, height };
}

export type CropFrame = { x: number; y: number; width: number; height: number };
export type ImageFitRect = { x: number; y: number; width: number; height: number };
export type Viewport = { width: number; height: number };
export type AspectRatio = number | "free";
export type CropFrameHandle =
  | "TL"
  | "T"
  | "TR"
  | "L"
  | "R"
  | "BL"
  | "B"
  | "BR"
  | "CENTER"
  | "MOVE";

// ============================================================
// 11. 普通衣物裁切纯函数 (contain 模式)
//   - 图片 contain 显示, 黑边在图片外
//   - 裁切框不允许进入黑边区域
// ============================================================

export function getContainedImageRect(
  naturalW: number,
  naturalH: number,
  vpW: number,
  vpH: number,
): ImageFitRect {
  if (
    !Number.isFinite(naturalW) ||
    !Number.isFinite(naturalH) ||
    !Number.isFinite(vpW) ||
    !Number.isFinite(vpH) ||
    naturalW <= 0 ||
    naturalH <= 0 ||
    vpW <= 0 ||
    vpH <= 0
  ) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const scale = Math.min(vpW / naturalW, vpH / naturalH);
  const width = naturalW * scale;
  const height = naturalH * scale;
  return {
    x: (vpW - width) / 2,
    y: (vpH - height) / 2,
    width,
    height,
  };
}

function sanitizeRect<T extends { x: number; y: number; width: number; height: number }>(
  rect: T,
): { x: number; y: number; width: number; height: number } {
  return {
    x: Number.isFinite(rect.x) ? rect.x : 0,
    y: Number.isFinite(rect.y) ? rect.y : 0,
    width: Number.isFinite(rect.width) ? rect.width : 0,
    height: Number.isFinite(rect.height) ? rect.height : 0,
  };
}

export function getInitialCropFrameInImage(
  imageRect: ImageFitRect,
  aspectRatio: AspectRatio = 1,
): CropFrame {
  const safeImage = sanitizeRect(imageRect);
  const iw = safeImage.width;
  const ih = safeImage.height;
  if (iw <= 0 || ih <= 0) {
    return { x: safeImage.x, y: safeImage.y, width: 0, height: 0 };
  }

  let width: number;
  let height: number;
  if (aspectRatio === "free" || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    // v1.1.14: 自由矩形初始值为图片显示区域宽度 80% 和高度 80%
    width = iw * 0.8;
    height = ih * 0.8;
  } else if (aspectRatio >= 1) {
    width = iw;
    height = iw / aspectRatio;
    if (height > ih) {
      height = ih;
      width = ih * aspectRatio;
    }
    // v0.9.5 修复: 留 10% 安全边 (在 imageRect 内框)
    width *= 0.8;
    height *= 0.8;
  } else {
    height = ih;
    width = ih * aspectRatio;
    if (width > iw) {
      width = iw;
      height = iw / aspectRatio;
    }
    // v0.9.5 修复: 留 10% 安全边
    width *= 0.8;
    height *= 0.8;
  }

  return {
    x: safeImage.x + (iw - width) / 2,
    y: safeImage.y + (ih - height) / 2,
    width,
    height,
  };
}

export function clampCropFrameToImage(
  frame: CropFrame,
  imageRect: ImageFitRect,
  aspectRatio?: AspectRatio,
): CropFrame {
  const safeImage = sanitizeRect(imageRect);
  const iw = safeImage.width;
  const ih = safeImage.height;
  if (iw <= 0 || ih <= 0) {
    return { x: safeImage.x, y: safeImage.y, width: 0, height: 0 };
  }

  const isLocked = typeof aspectRatio === "number" && Number.isFinite(aspectRatio) && aspectRatio > 0;
  let width: number;
  let height: number;
  if (isLocked) {
    const maxW = Math.min(iw, ih * aspectRatio);
    width = clamp(frame.width, 0, maxW);
    height = width / aspectRatio;
  } else {
    width = clamp(frame.width, 0, iw);
    height = clamp(frame.height, 0, ih);
  }

  const x = clamp(frame.x, safeImage.x, safeImage.x + iw - width);
  const y = clamp(frame.y, safeImage.y, safeImage.y + ih - height);
  return { x, y, width, height };
}

export function applyCropFrameDrag(
  handle: CropFrameHandle,
  dx: number,
  dy: number,
  frame: CropFrame,
  imageRect: ImageFitRect,
  aspectRatio: AspectRatio,
): CropFrame {
  const safeImage = sanitizeRect(imageRect);
  const iw = safeImage.width;
  const ih = safeImage.height;
  if (iw <= 0 || ih <= 0) {
    return { x: safeImage.x, y: safeImage.y, width: 0, height: 0 };
  }

  const safeDx = Number.isFinite(dx) ? dx : 0;
  const safeDy = Number.isFinite(dy) ? dy : 0;
  const isLocked = typeof aspectRatio === "number" && Number.isFinite(aspectRatio) && aspectRatio > 0;

  const safeFx = Number.isFinite(frame.x) ? frame.x : 0;
  const safeFy = Number.isFinite(frame.y) ? frame.y : 0;
  const safeFw = Number.isFinite(frame.width) ? frame.width : 0;
  const safeFh = Number.isFinite(frame.height) ? frame.height : 0;

  let x: number;
  let y: number;
  let width: number;
  let height: number;

  switch (handle) {
    case "TL":
      x = safeFx + safeDx;
      y = safeFy + safeDy;
      width = safeFw - safeDx;
      height = safeFh - safeDy;
      break;
    case "T":
      x = safeFx;
      y = safeFy + safeDy;
      width = safeFw;
      height = safeFh - safeDy;
      break;
    case "TR":
      x = safeFx;
      y = safeFy + safeDy;
      width = safeFw + safeDx;
      height = safeFh - safeDy;
      break;
    case "L":
      x = safeFx + safeDx;
      y = safeFy;
      width = safeFw - safeDx;
      height = safeFh;
      break;
    case "R":
      x = safeFx;
      y = safeFy;
      width = safeFw + safeDx;
      height = safeFh;
      break;
    case "BL":
      x = safeFx + safeDx;
      y = safeFy;
      width = safeFw - safeDx;
      height = safeFh + safeDy;
      break;
    case "B":
      x = safeFx;
      y = safeFy;
      width = safeFw;
      height = safeFh + safeDy;
      break;
    case "BR":
      x = safeFx;
      y = safeFy;
      width = safeFw + safeDx;
      height = safeFh + safeDy;
      break;
    case "CENTER":
    case "MOVE":
      x = safeFx + safeDx;
      y = safeFy + safeDy;
      width = safeFw;
      height = safeFh;
      break;
    default:
      return clampCropFrameToImage(frame, imageRect, aspectRatio);
  }

  width = Number.isFinite(width) ? Math.max(0, width) : 0;
  height = Number.isFinite(height) ? Math.max(0, height) : 0;

  if (!isLocked) {
    return clampCropFrameToImage({ x, y, width, height }, imageRect, aspectRatio);
  }

  let lockedWidth: number;
  let lockedHeight: number;
  let lockedX: number;
  let lockedY: number;

  switch (handle) {
    case "TL":
      {
        const wFromLeft = safeFw - safeDx;
        const hFromTop = safeFh - safeDy;
        lockedWidth = Math.max(0, Math.min(wFromLeft, hFromTop * aspectRatio));
        lockedHeight = lockedWidth / aspectRatio;
        lockedX = safeFx + safeFw - lockedWidth;
        lockedY = safeFy + safeFh - lockedHeight;
      }
      break;
    case "T":
      {
        const hFromTop = safeFh - safeDy;
        lockedHeight = Math.max(0, hFromTop);
        lockedWidth = lockedHeight * aspectRatio;
        const centerX = safeFx + safeFw / 2;
        lockedX = centerX - lockedWidth / 2;
        lockedY = safeFy + safeFh - lockedHeight;
      }
      break;
    case "TR":
      {
        const wFromRight = safeFw + safeDx;
        const hFromTop = safeFh - safeDy;
        lockedWidth = Math.max(0, Math.min(wFromRight, hFromTop * aspectRatio));
        lockedHeight = lockedWidth / aspectRatio;
        lockedX = safeFx;
        lockedY = safeFy + safeFh - lockedHeight;
      }
      break;
    case "L":
      {
        const wFromLeft = safeFw - safeDx;
        lockedWidth = Math.max(0, wFromLeft);
        lockedHeight = lockedWidth / aspectRatio;
        const centerY = safeFy + safeFh / 2;
        lockedY = centerY - lockedHeight / 2;
        lockedX = safeFx + safeFw - lockedWidth;
      }
      break;
    case "R":
      {
        const wFromRight = safeFw + safeDx;
        lockedWidth = Math.max(0, wFromRight);
        lockedHeight = lockedWidth / aspectRatio;
        const centerY = safeFy + safeFh / 2;
        lockedY = centerY - lockedHeight / 2;
        lockedX = safeFx;
      }
      break;
    case "BL":
      {
        const wFromLeft = safeFw - safeDx;
        const hFromBottom = safeFh + safeDy;
        lockedWidth = Math.max(0, Math.min(wFromLeft, hFromBottom * aspectRatio));
        lockedHeight = lockedWidth / aspectRatio;
        lockedX = safeFx + safeFw - lockedWidth;
        lockedY = safeFy;
      }
      break;
    case "B":
      {
        const hFromBottom = safeFh + safeDy;
        lockedHeight = Math.max(0, hFromBottom);
        lockedWidth = lockedHeight * aspectRatio;
        const centerX = safeFx + safeFw / 2;
        lockedX = centerX - lockedWidth / 2;
        lockedY = safeFy;
      }
      break;
    case "BR":
      {
        const wFromRight = safeFw + safeDx;
        const hFromBottom = safeFh + safeDy;
        lockedWidth = Math.max(0, Math.min(wFromRight, hFromBottom * aspectRatio));
        lockedHeight = lockedWidth / aspectRatio;
        lockedX = safeFx;
        lockedY = safeFy;
      }
      break;
    case "CENTER":
    case "MOVE":
      {
        lockedWidth = safeFw;
        lockedHeight = safeFh;
        lockedX = safeFx + safeDx;
        lockedY = safeFy + safeDy;
      }
      break;
    default:
      return clampCropFrameToImage({ x, y, width, height }, imageRect, aspectRatio);
  }

  return clampCropFrameToImage(
    { x: lockedX, y: lockedY, width: lockedWidth, height: lockedHeight },
    imageRect,
    aspectRatio,
  );
}

export function screenFrameToCropBox(
  frame: CropFrame,
  imageRect: ImageFitRect,
): NormalizedCropBox {
  const safeImage = sanitizeRect(imageRect);
  const iw = safeImage.width;
  const ih = safeImage.height;
  if (iw <= 0 || ih <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const safeFx = Number.isFinite(frame.x) ? frame.x : 0;
  const safeFy = Number.isFinite(frame.y) ? frame.y : 0;
  const safeFw = Number.isFinite(frame.width) ? frame.width : 0;
  const safeFh = Number.isFinite(frame.height) ? frame.height : 0;
  return normalizeCropBox({
    x: (safeFx - safeImage.x) / iw,
    y: (safeFy - safeImage.y) / ih,
    width: safeFw / iw,
    height: safeFh / ih,
  });
}
