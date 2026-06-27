// src/components/use-wardrobe-image-intake-controller.ts
// v1.1.9 4C Follow-up: 从 wardrobe-app.tsx 迁移图片入口控制逻辑。

import { useState, useRef, useCallback } from "react";
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from "@capacitor/camera";
import type { CaptureMode, ImageIntakePurpose, CaptureCropJob } from "@/components/wardrobe-app";
import type { CaptureImageQueueItem } from "@/components/selected-images-review";
import { fileToOriginalDataUrl, isHeicFile } from "@/lib/image";
import { generateThumbnailSafe } from "@/lib/thumbnail-runtime";

const MAX_QUEUE_SIZE = 9;

export interface UseWardrobeImageIntakeControllerOptions {
  /** 来自 useWardrobeMessageController 的 showMessage */
  showMessage: (msg: string, type?: "success" | "error" | "info") => void;
  /** 来自 useWardrobeMessageController 的 clearMessage */
  clearMessage: () => void;
  /** 来自 useWardrobeCaptureQueueController 的 setCaptureCropJob */
  setCaptureCropJob: (job: CaptureCropJob | null) => void;
  /** 来自 useWardrobeCaptureQueueController 的 setCaptureImageQueue */
  setCaptureImageQueue?: React.Dispatch<React.SetStateAction<CaptureImageQueueItem[]>>;
  /** captureMode 变化时同步到 capture queue controller */
  onCaptureModeChange?: (v: CaptureMode) => void;
  /** imageIntakePurpose 变化时同步到 capture queue controller */
  onImageIntakePurposeChange?: (v: ImageIntakePurpose) => void;
  /** 初始 captureMode，默认为 "item" */
  initialCaptureMode?: CaptureMode;
}

export interface UseWardrobeImageIntakeControllerReturn {
  captureMode: CaptureMode;
  setCaptureMode: (v: CaptureMode) => void;
  imageIntakePurpose: ImageIntakePurpose;
  setImageIntakePurpose: (v: ImageIntakePurpose) => void;
  showImageSourceSheet: boolean;
  setShowImageSourceSheet: (v: boolean) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  galleryInputRef: React.RefObject<HTMLInputElement | null>;
  openImageSourceSheet: (purpose: NonNullable<ImageIntakePurpose>) => void;
  closeImageSourceSheet: () => void;
  triggerCameraInput: () => void;
  triggerGalleryInput: () => void;
  handleNativeCameraCapture: () => Promise<void>;
  handleNativeGalleryPick: () => Promise<void>;
  processGalleryFiles: (fileArr: File[]) => Promise<void>;
  handleCameraCapture: (file: File | undefined) => Promise<void>;
  handleGallerySelect: (files: FileList | null | undefined) => Promise<void>;
}

export function useWardrobeImageIntakeController(
  options: UseWardrobeImageIntakeControllerOptions,
): UseWardrobeImageIntakeControllerReturn {
  const { showMessage, clearMessage, setCaptureCropJob, setCaptureImageQueue: _incomingSetCaptureImageQueue, onCaptureModeChange, onImageIntakePurposeChange, initialCaptureMode = "item" } = options;
  const setCaptureImageQueue = _incomingSetCaptureImageQueue ?? (((_action: React.SetStateAction<CaptureImageQueueItem[]>) => { /* noop when caller doesn't provide a queue setter */ }));

  const [captureMode, setCaptureMode] = useState<CaptureMode>(initialCaptureMode);
  const [imageIntakePurpose, setImageIntakePurpose] = useState<ImageIntakePurpose>(null);
  const [showImageSourceSheet, setShowImageSourceSheet] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // v1.1.6 Commit 1: Capacitor Camera 图片转换工具
  const cameraPhotoToFile = useCallback(
    async (photo: { webPath?: string }, prefix: string): Promise<File> => {
      if (!photo.webPath) throw new Error("图片读取失败");
      const response = await fetch(photo.webPath);
      const blob = await response.blob();
      const mime = blob.type || "image/jpeg";
      const ext = mime.includes("png") ? "png" : "jpg";
      return new File([blob], `${prefix}-${Date.now()}.${ext}`, { type: mime });
    },
    [],
  );

  const openImageSourceSheet = useCallback(
    (purpose: NonNullable<ImageIntakePurpose>) => {
      setImageIntakePurpose(purpose);
      onImageIntakePurposeChange?.(purpose);
      if (purpose === "garment" || purpose === "wishlist") {
        setCaptureMode("item");
        onCaptureModeChange?.("item");
      }
      setShowImageSourceSheet(true);
    },
    [onImageIntakePurposeChange, onCaptureModeChange],
  );

  const closeImageSourceSheet = useCallback(() => {
    setShowImageSourceSheet(false);
  }, []);

  // v1.1.6 Commit 1: Capacitor 原生拍照入口
  const handleNativeCameraCapture = useCallback(async () => {
    setShowImageSourceSheet(false);
    clearMessage();
    try {
      const photo = await CapacitorCamera.getPhoto({
        source: CameraSource.Camera,
        resultType: CameraResultType.Uri,
        quality: 92,
        correctOrientation: true,
        allowEditing: false,
      });
      const file = await cameraPhotoToFile(
        photo,
        imageIntakePurpose === "wishlist" ? "wishlist-camera" : "garment-camera",
      );
      await handleCameraCapture(file);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/cancel/i.test(message)) return;
      showMessage("相机打开失败，请重试", "error");
    }
  }, [imageIntakePurpose, showMessage, clearMessage, cameraPhotoToFile]);

  // v1.1.6 Commit 1: Capacitor 原生相册入口
  const handleNativeGalleryPick = useCallback(async () => {
    setShowImageSourceSheet(false);
    clearMessage();
    try {
      const result = await CapacitorCamera.pickImages({ quality: 92, limit: MAX_QUEUE_SIZE });
      const photos = result.photos ?? [];
      if (photos.length === 0) return;
      const files = await Promise.all(
        photos.map((photo, idx) =>
          cameraPhotoToFile(photo, `${imageIntakePurpose}-${idx + 1}`),
        ),
      );
      await processGalleryFiles(files);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/cancel/i.test(message)) return;
      showMessage("相册打开失败，请重试", "error");
    }
  }, [imageIntakePurpose, showMessage, clearMessage, cameraPhotoToFile]);

  // v1.1.6 Commit 1: 抽取 gallery 文件处理（供 Web 和原生共用）
  // 注意：此函数需要访问 setCaptureCropJob 和 setCaptureImageQueue，通过 options 传入
  const processGalleryFiles = useCallback(
    async (fileArr: File[]) => {
      clearMessage();
      const truncated = fileArr.length > MAX_QUEUE_SIZE;
      const targetArr = truncated ? fileArr.slice(0, MAX_QUEUE_SIZE) : fileArr;
      try {
        const queue: CaptureImageQueueItem[] = [];
        for (let i = 0; i < targetArr.length; i++) {
          const file = targetArr[i]!;
          try {
            const originalDataUrl = await fileToOriginalDataUrl(file);
            const thumb = await generateThumbnailSafe(originalDataUrl);
            queue.push({
              clientId: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
              fileName: file.name,
              originalDataUrl,
              imageDataUrl: originalDataUrl,
              ...(thumb.thumbnailDataUrl ? { thumbnailDataUrl: thumb.thumbnailDataUrl } : {}),
            });
          } catch (error) {
            if (typeof console !== "undefined") console.warn("[processGalleryFiles] 跳过读取失败:", error);
          }
        }
        if (queue.length === 0) {
          showMessage("图片读取失败，请重试", "error");
          return;
        }
        if (truncated) {
          showMessage(`一次最多选择 ${MAX_QUEUE_SIZE} 张, 已取前 ${MAX_QUEUE_SIZE} 张`, "info");
        }
        // 设置队列状态
        setCaptureImageQueue((prev) => {
          const combined = [...prev, ...queue];
          if (combined.length > MAX_QUEUE_SIZE) {
            showMessage(`一次最多选择 ${MAX_QUEUE_SIZE} 张, 已取前 ${MAX_QUEUE_SIZE} 张`, "info");
            return combined.slice(0, MAX_QUEUE_SIZE);
          }
          return combined;
        });
      } finally {
        if (galleryInputRef.current) galleryInputRef.current.value = "";
      }
    },
    [showMessage, clearMessage, setCaptureImageQueue],
  );

  // Web fallback 相机入口
  const triggerCameraInput = useCallback(() => {
    if (!fileInputRef.current) {
      showMessage("相机入口未就绪，请重试", "error");
      return;
    }
    fileInputRef.current.value = "";
    fileInputRef.current.click();
  }, [showMessage]);

  // Web fallback 相册入口
  const triggerGalleryInput = useCallback(() => {
    if (!galleryInputRef.current) {
      showMessage("相册入口未就绪，请重试", "error");
      return;
    }
    galleryInputRef.current.value = "";
    galleryInputRef.current.click();
  }, [showMessage]);

  // Web fallback 相机文件处理（直接设置 captureCropJob 进入裁切流程）
  const handleCameraCapture = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      clearMessage();
      try {
        if (isHeicFile(file)) showMessage("正在转换 HEIC 图片...", "info");
        const originalDataUrl = await fileToOriginalDataUrl(file);
        setCaptureCropJob({
          dataUrl: originalDataUrl,
          fileName: file.name,
          mode: captureMode,
          purpose: imageIntakePurpose,
        });
      } catch (error) {
        showMessage(getErrorMessage(error), "error");
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (galleryInputRef.current) galleryInputRef.current.value = "";
      }
    },
    [captureMode, imageIntakePurpose, showMessage, clearMessage, setCaptureCropJob],
  );

  // Web fallback 图库多选（调用 processGalleryFiles 设置队列）
  const handleGallerySelect = useCallback(
    async (files: FileList | null | undefined) => {
      if (!files || files.length === 0) return;
      await processGalleryFiles(Array.from(files));
    },
    [processGalleryFiles],
  );

  return {
    captureMode,
    setCaptureMode,
    imageIntakePurpose,
    setImageIntakePurpose,
    showImageSourceSheet,
    setShowImageSourceSheet,
    fileInputRef,
    galleryInputRef,
    openImageSourceSheet,
    closeImageSourceSheet,
    triggerCameraInput,
    triggerGalleryInput,
    handleNativeCameraCapture,
    handleNativeGalleryPick,
    processGalleryFiles,
    handleCameraCapture,
    handleGallerySelect,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "未知错误";
}