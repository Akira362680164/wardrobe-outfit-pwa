// ponytail: single-scale crop math, add per-frame layout if perf matters.
export interface CroppedImageLayoutInput {
  naturalWidth: number;
  naturalHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  cropBox: { x: number; y: number; width: number; height: number };
}

export interface CroppedImageLayout {
  viewportLeft: number;
  viewportTop: number;
  viewportWidth: number;
  viewportHeight: number;
  imageLeft: number;
  imageTop: number;
  imageWidth: number;
  imageHeight: number;
  scale: number;
}

function isValidNumber(v: number): boolean {
  return Number.isFinite(v) && v >= 0 && v <= 1;
}

function normalizeBox(box: { x: number; y: number; width: number; height: number }) {
  let { x, y, width, height } = box;
  if (!isValidNumber(x)) x = 0;
  if (!isValidNumber(y)) y = 0;
  if (!isValidNumber(width) || width <= 0) width = 1;
  if (!isValidNumber(height) || height <= 0) height = 1;
  x = Math.max(0, Math.min(x, 1));
  y = Math.max(0, Math.min(y, 1));
  if (x + width > 1) width = 1 - x;
  if (y + height > 1) height = 1 - y;
  if (width <= 0) { x = 0; width = 1; }
  if (height <= 0) { y = 0; height = 1; }
  return { x, y, width, height };
}

export function getCroppedImageLayout(input: CroppedImageLayoutInput): CroppedImageLayout {
  const { naturalWidth, naturalHeight, viewportWidth, viewportHeight } = input;
  const box = normalizeBox(input.cropBox);

  const cropPixelWidth = naturalWidth * box.width;
  const cropPixelHeight = naturalHeight * box.height;

  if (viewportWidth <= 0 || viewportHeight <= 0 || cropPixelWidth <= 0 || cropPixelHeight <= 0) {
    return {
      viewportLeft: 0, viewportTop: 0,
      viewportWidth, viewportHeight,
      imageLeft: 0, imageTop: 0,
      imageWidth: naturalWidth, imageHeight: naturalHeight,
      scale: 1,
    };
  }

  const scale = Math.min(viewportWidth / cropPixelWidth, viewportHeight / cropPixelHeight);

  const renderedCropWidth = cropPixelWidth * scale;
  const renderedCropHeight = cropPixelHeight * scale;
  const renderedImageWidth = naturalWidth * scale;
  const renderedImageHeight = naturalHeight * scale;

  const imageLeft = -naturalWidth * box.x * scale;
  const imageTop = -naturalHeight * box.y * scale;

  const viewportLeft = (viewportWidth - renderedCropWidth) / 2;
  const viewportTop = (viewportHeight - renderedCropHeight) / 2;

  return {
    viewportLeft, viewportTop,
    viewportWidth: renderedCropWidth,
    viewportHeight: renderedCropHeight,
    imageLeft, imageTop,
    imageWidth: renderedImageWidth,
    imageHeight: renderedImageHeight,
    scale,
  };
}
