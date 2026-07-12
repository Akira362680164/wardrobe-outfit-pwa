import { getIntakeQueue, setPendingCropResult, updateIntakeQueueItem } from "../../../stores/intake";

type RatioMode = "free" | "3:4";
type Box = { x: number; y: number; w: number; h: number };

Page({
  data: {
    src: "",
    clientItemId: "",
    ratioMode: "3:4" as RatioMode,
    rotation: 0,
    applying: false,
    cropStyle: "left:8%;top:8%;width:84%;height:84%;",
    dimTopStyle: "height:8%;",
    dimBottomStyle: "height:8%;",
    dimLeftStyle: "top:8%;bottom:8%;width:8%;",
    dimRightStyle: "top:8%;bottom:8%;width:8%;",
  },

  onLoad(this: any, query?: { src?: string; clientItemId?: string }) {
    const src = decodeURIComponent(query?.src ?? "");
    this.setData({ src, clientItemId: query?.clientItemId ?? "" });
    this.setInitialBox();
  },

  setInitialBox(this: any) {
    const box = this.data.ratioMode === "3:4" ? fitRatioBox(0.75) : { x: 0.08, y: 0.08, w: 0.84, h: 0.84 };
    applyBox.call(this, box);
  },

  chooseRatio(this: any, event: any) {
    const ratio = event.currentTarget.dataset.ratio as RatioMode;
    this.setData({ ratioMode: ratio });
    const current = readBox(this.data.cropStyle);
    if (ratio === "3:4") applyBox.call(this, constrainRatio(current, 0.75));
  },

  rotateLeft(this: any) { this.setData({ rotation: (this.data.rotation + 270) % 360 }); },
  rotateRight(this: any) { this.setData({ rotation: (this.data.rotation + 90) % 360 }); },
  resetCrop(this: any) { this.setData({ rotation: 0, ratioMode: "3:4" }); this.setInitialBox(); },

  startCropMove(this: any, event: any) {
    const touch = event.touches?.[0];
    if (!touch) return;
    this.cropGesture = { type: "move", startX: touch.clientX, startY: touch.clientY, box: readBox(this.data.cropStyle) };
  },
  moveCropMove(this: any, event: any) {
    const gesture = this.cropGesture;
    const touch = event.touches?.[0];
    if (!gesture || !touch) return;
    const windowWidth = (wx.getSystemInfoSync() as unknown as { windowWidth?: number }).windowWidth || 375;
    const dx = (touch.clientX - gesture.startX) / windowWidth * 750;
    const dy = (touch.clientY - gesture.startY) / windowWidth * 750;
    const box = { ...gesture.box, x: clamp(gesture.box.x + dx / 650, 0, 1 - gesture.box.w), y: clamp(gesture.box.y + dy / 720, 0, 1 - gesture.box.h) };
    applyBox.call(this, box);
  },
  endCropMove(this: any) { this.cropGesture = null; },

  startHandle(this: any, event: any) {
    const touch = event.touches?.[0];
    if (!touch) return;
    this.cropGesture = { type: event.currentTarget.dataset.handle, startX: touch.clientX, startY: touch.clientY, box: readBox(this.data.cropStyle) };
  },
  moveHandle(this: any, event: any) {
    const gesture = this.cropGesture;
    const touch = event.touches?.[0];
    if (!gesture || !touch) return;
    const windowWidth = (wx.getSystemInfoSync() as unknown as { windowWidth?: number }).windowWidth || 375;
    const dx = (touch.clientX - gesture.startX) / windowWidth * 750 / 650;
    const dy = (touch.clientY - gesture.startY) / windowWidth * 750 / 720;
    applyBox.call(this, resizeBox(gesture.box, gesture.type, dx, dy, this.data.ratioMode === "3:4" ? 0.75 : undefined));
  },
  endHandle(this: any) { this.cropGesture = null; },

  async applyCrop(this: any) {
    if (!this.data.src || !this.data.clientItemId) return;
    this.setData({ applying: true });
    try {
      const box = readBox(this.data.cropStyle);
      const info = await imageInfo(this.data.src);
      const sourceBox = sourceCropFromStageBox(box, info.width, info.height);
      const baseWidth = 720;
      const baseHeight = this.data.ratioMode === "3:4"
        ? 960
        : Math.max(320, Math.round(baseWidth * sourceBox.sh / sourceBox.sw));
      const rotated = this.data.rotation % 180 !== 0;
      const outWidth = rotated ? baseHeight : baseWidth;
      const outHeight = rotated ? baseWidth : baseHeight;
      const path = await renderCrop(this, this.data.src, sourceBox.sx, sourceBox.sy, sourceBox.sw, sourceBox.sh, outWidth, outHeight, this.data.rotation);
      const item = getIntakeQueue().find((entry) => entry.clientItemId === this.data.clientItemId);
      if (item) {
        updateIntakeQueueItem(item.clientItemId, {
          processedPath: path,
          stablePath: path,
          imagePath: path,
          status: "selected",
          error: "",
          assetMutations: [],
          draft: { ...item.draft, imagePath: path, stablePath: path },
        });
      } else setPendingCropResult(path);
      wx.navigateBack({ delta: 1 });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "裁剪图片失败", icon: "none" });
    } finally {
      this.setData({ applying: false });
    }
  },

  cancel() { wx.navigateBack({ delta: 1 }); },
});

function fitRatioBox(ratio: number): Box {
  const width = 0.72;
  const height = width / ratio * 650 / 720;
  return { x: (1 - width) / 2, y: (1 - height) / 2, w: width, h: Math.min(height, 0.9) };
}

function constrainRatio(box: Box, ratio: number): Box {
  const targetHeight = box.w / ratio * 650 / 720;
  if (targetHeight <= 1 - box.y) return { ...box, h: targetHeight };
  const targetWidth = box.h * ratio * 720 / 650;
  return { ...box, w: Math.min(targetWidth, 0.92), x: Math.max(0.04, box.x) };
}

function resizeBox(box: Box, handle: string, dx: number, dy: number, ratio?: number): Box {
  let next = { ...box };
  if (handle.includes("l")) { next.x = clamp(box.x + dx, 0, box.x + box.w - 0.12); next.w = box.w - (next.x - box.x); }
  if (handle.includes("r")) next.w = clamp(box.w + dx, 0.12, 1 - box.x);
  if (handle.includes("t")) { next.y = clamp(box.y + dy, 0, box.y + box.h - 0.12); next.h = box.h - (next.y - box.y); }
  if (handle.includes("b")) next.h = clamp(box.h + dy, 0.12, 1 - box.y);
  if (ratio) next = constrainRatio(next, ratio);
  return next;
}

function readBox(style: string): Box {
  const value = (name: string, fallback: number) => Number(style.match(new RegExp(`${name}:(\\d+(?:\\.\\d+)?)%`))?.[1] ?? fallback) / 100;
  return { x: value("left", 8), y: value("top", 8), w: value("width", 84), h: value("height", 84) };
}

function applyBox(this: any, box: Box) {
  const safe = { x: clamp(box.x, 0, 0.94), y: clamp(box.y, 0, 0.94), w: clamp(box.w, 0.12, 1 - box.x), h: clamp(box.h, 0.12, 1 - box.y) };
  this.setData({
    cropStyle: `left:${safe.x * 100}%;top:${safe.y * 100}%;width:${safe.w * 100}%;height:${safe.h * 100}%;`,
    dimTopStyle: `height:${safe.y * 100}%;`,
    dimBottomStyle: `height:${(1 - safe.y - safe.h) * 100}%;`,
    dimLeftStyle: `top:${safe.y * 100}%;bottom:${(1 - safe.y - safe.h) * 100}%;width:${safe.x * 100}%;`,
    dimRightStyle: `top:${safe.y * 100}%;bottom:${(1 - safe.y - safe.h) * 100}%;width:${(1 - safe.x - safe.w) * 100}%;`,
  });
}

function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }

function imageInfo(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => wx.getImageInfo({ src, success: resolve, fail: () => reject(new Error("无法读取图片尺寸")) }));
}

function sourceCropFromStageBox(box: Box, sourceWidth: number, sourceHeight: number) {
  const stageWidth = 650;
  const stageHeight = 720;
  const scale = Math.min(stageWidth / sourceWidth, stageHeight / sourceHeight);
  const imageWidth = sourceWidth * scale;
  const imageHeight = sourceHeight * scale;
  const imageLeft = (stageWidth - imageWidth) / 2;
  const imageTop = (stageHeight - imageHeight) / 2;
  const left = clamp(box.x * stageWidth, imageLeft, imageLeft + imageWidth);
  const top = clamp(box.y * stageHeight, imageTop, imageTop + imageHeight);
  const right = clamp((box.x + box.w) * stageWidth, left + 1, imageLeft + imageWidth);
  const bottom = clamp((box.y + box.h) * stageHeight, top + 1, imageTop + imageHeight);
  return {
    sx: Math.round((left - imageLeft) / scale),
    sy: Math.round((top - imageTop) / scale),
    sw: Math.max(1, Math.round((right - left) / scale)),
    sh: Math.max(1, Math.round((bottom - top) / scale)),
  };
}

function renderCrop(page: any, src: string, sx: number, sy: number, sw: number, sh: number, outWidth: number, outHeight: number, rotation: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const ctx = (wx as typeof wx & { createCanvasContext: (id: string, component?: unknown) => any }).createCanvasContext("cropCanvas", page);
    ctx.clearRect(0, 0, outWidth, outHeight);
    ctx.save();
    ctx.translate(outWidth / 2, outHeight / 2);
    ctx.rotate(rotation * Math.PI / 180);
    const drawWidth = rotation % 180 === 0 ? outWidth : outHeight;
    const drawHeight = rotation % 180 === 0 ? outHeight : outWidth;
    // Use the nine-argument drawImage form so the export contains the selected
    // source rectangle. The previous implementation drew the whole image and
    // only changed its scale, which made the crop frame purely decorative.
    ctx.drawImage(src, sx, sy, sw, sh, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();
    ctx.draw(false, () => (wx as typeof wx & { canvasToTempFilePath: (options: any, component?: unknown) => void }).canvasToTempFilePath({ canvasId: "cropCanvas", x: 0, y: 0, width: outWidth, height: outHeight, destWidth: outWidth, destHeight: outHeight, fileType: "jpg", quality: 0.92, success: (result: { tempFilePath: string }) => resolve(result.tempFilePath), fail: () => reject(new Error("裁剪图片失败")) }, page));
  });
}
