import type { IntakeCropBox } from "../stores/intake";

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

export type CropHandle = "tl" | "tr" | "bl" | "br";

const MIN_SIZE = 0.12;

export function containedImageRect(source: Size, stage: Size): Rect {
  if (source.width <= 0 || source.height <= 0 || stage.width <= 0 || stage.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const scale = Math.min(stage.width / source.width, stage.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return { x: (stage.width - width) / 2, y: (stage.height - height) / 2, width, height };
}

export function rotatedSize(source: Size, rotationDeg: number): Size {
  return rotationDeg % 180 === 0 ? source : { width: source.height, height: source.width };
}

export function fitCropBox(image: Size, aspectRatio: number, margin = 0.06): IntakeCropBox {
  const availableWidth = Math.max(MIN_SIZE, 1 - margin * 2);
  const availableHeight = Math.max(MIN_SIZE, 1 - margin * 2);
  let width = availableWidth;
  let height = width * image.width / Math.max(aspectRatio * image.height, 1);
  if (height > availableHeight) {
    height = availableHeight;
    width = height * aspectRatio * image.height / Math.max(image.width, 1);
  }
  return clampCropBox({ x: (1 - width) / 2, y: (1 - height) / 2, width, height });
}

export function clampCropBox(box: IntakeCropBox): IntakeCropBox {
  const width = clamp(box.width, MIN_SIZE, 1);
  const height = clamp(box.height, MIN_SIZE, 1);
  const x = clamp(box.x, 0, 1 - width);
  const y = clamp(box.y, 0, 1 - height);
  return { x, y, width, height };
}

export function moveCropBox(box: IntakeCropBox, dx: number, dy: number): IntakeCropBox {
  return clampCropBox({ ...box, x: box.x + dx, y: box.y + dy });
}

export function resizeCropBox(
  box: IntakeCropBox,
  handle: CropHandle,
  dx: number,
  dy: number,
  image: Size,
  aspectRatio?: number,
): IntakeCropBox {
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  let next = { ...box };
  if (handle.includes("l")) {
    next.x = clamp(box.x + dx, 0, right - MIN_SIZE);
    next.width = right - next.x;
  } else {
    next.width = clamp(box.width + dx, MIN_SIZE, 1 - box.x);
  }
  if (handle.includes("t")) {
    next.y = clamp(box.y + dy, 0, bottom - MIN_SIZE);
    next.height = bottom - next.y;
  } else {
    next.height = clamp(box.height + dy, MIN_SIZE, 1 - box.y);
  }
  if (!aspectRatio) return clampCropBox(next);

  const anchorX = handle.includes("l") ? right : box.x;
  const anchorY = handle.includes("t") ? bottom : box.y;
  const desiredHeight = next.width * image.width / Math.max(aspectRatio * image.height, 1);
  const desiredWidth = next.height * aspectRatio * image.height / Math.max(image.width, 1);
  if (desiredHeight <= 1) next.height = Math.max(MIN_SIZE, desiredHeight);
  else next.width = Math.max(MIN_SIZE, desiredWidth);
  next.x = handle.includes("l") ? anchorX - next.width : anchorX;
  next.y = handle.includes("t") ? anchorY - next.height : anchorY;
  return clampCropBox(next);
}

export function constrainCropBoxAspect(box: IntakeCropBox, image: Size, aspectRatio: number): IntakeCropBox {
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  let width = box.width;
  let height = width * image.width / Math.max(aspectRatio * image.height, 1);
  if (height > 1) {
    height = Math.min(1, box.height);
    width = height * aspectRatio * image.height / Math.max(image.width, 1);
  }
  return clampCropBox({ x: centerX - width / 2, y: centerY - height / 2, width, height });
}

export function rotateCropBox(box: IntakeCropBox, direction: "left" | "right"): IntakeCropBox {
  if (direction === "right") {
    return clampCropBox({ x: 1 - box.y - box.height, y: box.x, width: box.height, height: box.width });
  }
  return clampCropBox({ x: box.y, y: 1 - box.x - box.width, width: box.height, height: box.width });
}

export function cropBoxToPixels(box: IntakeCropBox, image: Size): Rect {
  const safe = clampCropBox(box);
  return {
    x: safe.x * image.width,
    y: safe.y * image.height,
    width: safe.width * image.width,
    height: safe.height * image.height,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
