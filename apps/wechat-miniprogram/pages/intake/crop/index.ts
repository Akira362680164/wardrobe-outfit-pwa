import { cancelCropJob, completeCropJob, getCropJob } from "../../../stores/crop-job";
import type { IntakeCropBox, IntakeCropRatio } from "../../../stores/intake";
import { getCapsuleGeometry } from "../../../utils/capsule-layout";
import {
  clampCropBox,
  constrainCropBoxAspect,
  containedImageRect,
  cropBoxToPixels,
  fitCropBox,
  moveCropBox,
  resizeCropBox,
  rotateCropBox,
  rotatedSize,
  type CropHandle,
  type Rect,
  type Size,
} from "../../../utils/crop-math";

type CropGesture = {
  type: "move" | CropHandle;
  startX: number;
  startY: number;
  box: IntakeCropBox;
};

Page({
  data: {
    src: "",
    jobId: "",
    cropRatio: "3:4" as IntakeCropRatio,
    rotationDeg: 0 as 0 | 90 | 180 | 270,
    applying: false,
    ready: false,
    error: "",
    navTopRpx: 0,
    navHeightRpx: 64,
    navRightRpx: 0,
    imageStyle: "",
    cropStyle: "",
    dimTopStyle: "",
    dimBottomStyle: "",
    dimLeftStyle: "",
    dimRightStyle: "",
    canvasWidth: 720,
    canvasHeight: 960,
  },

  onLoad(this: any, query?: { jobId?: string }) {
    const jobId = decodeURIComponent(query?.jobId ?? "");
    const job = getCropJob(jobId);
    const capsule = getCapsuleGeometry();
    if (!job) {
      this.setData({ error: "裁切任务已失效，请返回重试", navTopRpx: capsule.topRpx, navHeightRpx: capsule.heightRpx, navRightRpx: capsule.rightInsetRpx + 12 });
      wx.showToast({ title: "裁切任务已失效，请返回重试", icon: "none" });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 0);
      return;
    }
    this.cropBox = job.cropBox ? clampCropBox(job.cropBox) : null;
    this.setData({
      src: job.sourcePath,
      jobId: job.id,
      cropRatio: job.cropRatio,
      rotationDeg: job.rotationDeg,
      navTopRpx: capsule.topRpx,
      navHeightRpx: capsule.heightRpx,
      navRightRpx: capsule.rightInsetRpx + 12,
    });
    void this.loadSourceInfo(job.sourcePath);
  },

  onReady(this: any) {
    this.pageReady = true;
    this.measureStage();
  },

  onUnload(this: any) {
    if (!this.applied) cancelCropJob(this.data.jobId);
  },

  async loadSourceInfo(this: any, src: string) {
    try {
      this.sourceSize = await imageInfo(src);
      this.initializeGeometry();
    } catch (error) {
      const message = error instanceof Error ? error.message : "无法读取图片尺寸";
      this.setData({ error: message });
    }
  },

  measureStage(this: any) {
    if (!this.pageReady) return;
    const query = (wx as typeof wx & { createSelectorQuery: () => any }).createSelectorQuery().in(this);
    query.select("#cropStage").boundingClientRect();
    query.exec((rects: Array<any>) => {
      const rect = rects?.[0];
      if (!rect?.width || !rect?.height) return;
      this.stageSize = { width: rect.width, height: rect.height };
      this.initializeGeometry();
    });
  },

  initializeGeometry(this: any, constrainRatio = false) {
    if (!this.sourceSize || !this.stageSize) return;
    const rotated = rotatedSize(this.sourceSize, this.data.rotationDeg);
    this.imageRect = containedImageRect(rotated, this.stageSize);
    if (!this.cropBox) {
      this.cropBox = this.data.cropRatio === "3:4"
        ? fitCropBox(rotated, 0.75)
        : { x: 0.06, y: 0.06, width: 0.88, height: 0.88 };
    } else if (constrainRatio && this.data.cropRatio === "3:4") {
      this.cropBox = constrainCropBoxAspect(this.cropBox, rotated, 0.75);
    } else {
      this.cropBox = clampCropBox(this.cropBox);
    }
    this.syncStyles();
  },

  syncStyles(this: any) {
    const stage = this.stageSize as Size | undefined;
    const image = this.imageRect as Rect | undefined;
    const box = this.cropBox as IntakeCropBox | null;
    if (!stage || !image || !box) return;
    const frame = {
      left: image.x + box.x * image.width,
      top: image.y + box.y * image.height,
      width: box.width * image.width,
      height: box.height * image.height,
    };
    const quarterTurn = this.data.rotationDeg % 180 !== 0;
    const imageWidth = quarterTurn ? image.height : image.width;
    const imageHeight = quarterTurn ? image.width : image.height;
    const imageLeft = stage.width / 2 - imageWidth / 2;
    const imageTop = stage.height / 2 - imageHeight / 2;
    this.setData({
      ready: true,
      imageStyle: `left:${imageLeft}px;top:${imageTop}px;width:${imageWidth}px;height:${imageHeight}px;transform:rotate(${this.data.rotationDeg}deg);`,
      cropStyle: `left:${frame.left}px;top:${frame.top}px;width:${frame.width}px;height:${frame.height}px;`,
      dimTopStyle: `height:${frame.top}px;`,
      dimBottomStyle: `height:${Math.max(0, stage.height - frame.top - frame.height)}px;`,
      dimLeftStyle: `top:${frame.top}px;height:${frame.height}px;width:${frame.left}px;`,
      dimRightStyle: `top:${frame.top}px;height:${frame.height}px;width:${Math.max(0, stage.width - frame.left - frame.width)}px;`,
    });
  },

  chooseRatio(this: any, event: any) {
    const cropRatio = event.currentTarget.dataset.ratio as IntakeCropRatio;
    if (cropRatio !== "free" && cropRatio !== "3:4") return;
    this.setData({ cropRatio });
    if (cropRatio === "3:4" && this.cropBox && this.sourceSize) {
      this.cropBox = constrainCropBoxAspect(this.cropBox, rotatedSize(this.sourceSize, this.data.rotationDeg), 0.75);
    }
    this.syncStyles();
  },

  rotateLeft(this: any) {
    this.rotate("left");
  },

  rotateRight(this: any) {
    this.rotate("right");
  },

  rotate(this: any, direction: "left" | "right") {
    if (!this.cropBox || !this.sourceSize) return;
    const rotationDeg = ((this.data.rotationDeg + (direction === "right" ? 90 : 270)) % 360) as 0 | 90 | 180 | 270;
    this.cropBox = rotateCropBox(this.cropBox, direction);
    this.setData({ rotationDeg });
    this.initializeGeometry(true);
  },

  resetCrop(this: any) {
    if (!this.sourceSize) return;
    const rotationDeg = 0 as const;
    const cropRatio: IntakeCropRatio = "3:4";
    this.cropBox = fitCropBox(this.sourceSize, 0.75);
    this.setData({ rotationDeg, cropRatio });
    this.initializeGeometry();
  },

  startCropMove(this: any, event: any) {
    const touch = event.touches?.[0];
    if (!touch || !this.cropBox) return;
    this.cropGesture = { type: "move", startX: touch.clientX, startY: touch.clientY, box: { ...this.cropBox } } as CropGesture;
  },

  moveCropMove(this: any, event: any) {
    const gesture = this.cropGesture as CropGesture | null;
    const touch = event.touches?.[0];
    const image = this.imageRect as Rect | undefined;
    if (!gesture || gesture.type !== "move" || !touch || !image) return;
    this.cropBox = moveCropBox(gesture.box, (touch.clientX - gesture.startX) / image.width, (touch.clientY - gesture.startY) / image.height);
    this.syncStyles();
  },

  endCropMove(this: any) {
    this.cropGesture = null;
  },

  startHandle(this: any, event: any) {
    const touch = event.touches?.[0];
    const handle = event.currentTarget.dataset.handle as CropHandle;
    if (!touch || !this.cropBox || !["tl", "tr", "bl", "br"].includes(handle)) return;
    this.cropGesture = { type: handle, startX: touch.clientX, startY: touch.clientY, box: { ...this.cropBox } } as CropGesture;
  },

  moveHandle(this: any, event: any) {
    const gesture = this.cropGesture as CropGesture | null;
    const touch = event.touches?.[0];
    const imageRect = this.imageRect as Rect | undefined;
    const sourceSize = this.sourceSize as Size | undefined;
    if (!gesture || gesture.type === "move" || !touch || !imageRect || !sourceSize) return;
    this.cropBox = resizeCropBox(
      gesture.box,
      gesture.type,
      (touch.clientX - gesture.startX) / imageRect.width,
      (touch.clientY - gesture.startY) / imageRect.height,
      rotatedSize(sourceSize, this.data.rotationDeg),
      this.data.cropRatio === "3:4" ? 0.75 : undefined,
    );
    this.syncStyles();
  },

  endHandle(this: any) {
    this.cropGesture = null;
  },

  async applyCrop(this: any) {
    const job = getCropJob(this.data.jobId);
    const box = this.cropBox as IntakeCropBox | null;
    const sourceSize = this.sourceSize as Size | undefined;
    if (!job || !box || !sourceSize || !this.data.ready || this.data.applying) return;
    this.setData({ applying: true, error: "" });
    try {
      const rotated = rotatedSize(sourceSize, this.data.rotationDeg);
      const cropPixels = cropBoxToPixels(box, rotated);
      const outWidth = 720;
      const outHeight = this.data.cropRatio === "3:4"
        ? 960
        : Math.max(320, Math.min(1440, Math.round(outWidth * cropPixels.height / Math.max(cropPixels.width, 1))));
      this.setData({ canvasWidth: outWidth, canvasHeight: outHeight });
      await nextRender();
      const processedPath = await renderCrop({
        page: this,
        src: job.sourcePath,
        source: sourceSize,
        crop: cropPixels,
        rotationDeg: this.data.rotationDeg,
        outWidth,
        outHeight,
      });
      completeCropJob({
        jobId: job.id,
        target: job.target,
        targetId: job.targetId,
        sourcePath: job.sourcePath,
        processedPath,
        cropBox: box,
        rotationDeg: this.data.rotationDeg,
        cropRatio: this.data.cropRatio,
      });
      this.applied = true;
      wx.navigateBack({ delta: 1 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "裁切图片失败";
      this.setData({ error: message });
      wx.showToast({ title: message, icon: "none" });
    } finally {
      this.setData({ applying: false });
    }
  },

  cancel(this: any) {
    cancelCropJob(this.data.jobId);
    this.applied = true;
    wx.navigateBack({ delta: 1 });
  },
});

function imageInfo(src: string): Promise<Size> {
  return new Promise((resolve, reject) => wx.getImageInfo({
    src,
    success: (result) => resolve({ width: result.width, height: result.height }),
    fail: () => reject(new Error("无法读取图片尺寸")),
  }));
}

function nextRender(): Promise<void> {
  return new Promise((resolve) => {
    const nextTick = (wx as typeof wx & { nextTick?: (callback: () => void) => void }).nextTick;
    if (nextTick) nextTick(resolve);
    else setTimeout(resolve, 0);
  });
}

function renderCrop(input: {
  page: any;
  src: string;
  source: Size;
  crop: Rect;
  rotationDeg: number;
  outWidth: number;
  outHeight: number;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const api = wx as typeof wx & {
      createCanvasContext: (id: string, component?: unknown) => any;
      canvasToTempFilePath: (options: any, component?: unknown) => void;
    };
    const ctx = api.createCanvasContext("cropCanvas", input.page);
    ctx.clearRect(0, 0, input.outWidth, input.outHeight);
    ctx.save();
    ctx.scale(input.outWidth / input.crop.width, input.outHeight / input.crop.height);
    ctx.translate(-input.crop.x, -input.crop.y);
    if (input.rotationDeg === 90) {
      ctx.translate(input.source.height, 0);
      ctx.rotate(Math.PI / 2);
    } else if (input.rotationDeg === 180) {
      ctx.translate(input.source.width, input.source.height);
      ctx.rotate(Math.PI);
    } else if (input.rotationDeg === 270) {
      ctx.translate(0, input.source.width);
      ctx.rotate(-Math.PI / 2);
    }
    ctx.drawImage(input.src, 0, 0, input.source.width, input.source.height);
    ctx.restore();
    ctx.draw(false, () => api.canvasToTempFilePath({
      canvasId: "cropCanvas",
      x: 0,
      y: 0,
      width: input.outWidth,
      height: input.outHeight,
      destWidth: input.outWidth,
      destHeight: input.outHeight,
      fileType: "jpg",
      quality: 0.92,
      success: (result: { tempFilePath: string }) => resolve(result.tempFilePath),
      fail: () => reject(new Error("裁切图片失败")),
    }, input.page));
  });
}
