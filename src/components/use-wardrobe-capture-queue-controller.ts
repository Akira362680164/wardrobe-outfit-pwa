// src/components/use-wardrobe-capture-queue-controller.ts
// v1.1.9 4C Follow-up: 从 wardrobe-app.tsx 迁移图片队列状态与 SelectedImagesReview portal 逻辑。

import { useState, useCallback } from "react";
import type { CaptureCropJob, ImageIntakePurpose, CaptureMode } from "@/components/wardrobe-app";
import type { CaptureImageQueueItem, SelectedImagesReviewMode } from "@/components/selected-images-review";
import type { NormalizedCropBox } from "@/lib/image";
import { generateThumbnailSafe } from "@/lib/thumbnail-runtime";
import { getWardrobeSnapshot } from "@/lib/data-repo";
import { bridgeGarmentUpdate } from "@/lib/online/bridge-compat";

export interface UseWardrobeCaptureQueueControllerOptions {
  /** 来自 useWardrobeMessageController 的 showMessage */
  showMessage: (msg: string, type?: "success" | "error" | "info") => void;
  /** 来自 useWardrobeDataController 的 refreshState */
  refreshState: () => Promise<void>;
  /** 来自 wardrobe-app.tsx 的 patchItemInItemsState 函数 */
  patchItemInItemsState: (itemId: number, patch: Record<string, unknown>) => void;
  /** 来自 useWardrobeImageIntakeController 的 captureMode */
  captureMode: CaptureMode;
  /** 来自 useWardrobeImageIntakeController 的 imageIntakePurpose */
  imageIntakePurpose: ImageIntakePurpose;
}

export interface UseWardrobeCaptureQueueControllerReturn {
  captureCropJob: CaptureCropJob | null;
  setCaptureCropJob: (job: CaptureCropJob | null) => void;
  captureImageQueue: CaptureImageQueueItem[];
  setCaptureImageQueue: React.Dispatch<React.SetStateAction<CaptureImageQueueItem[]>>;
  captureQueueIndex: number;
  setCaptureQueueIndex: React.Dispatch<React.SetStateAction<number>>;
  captureQueueMode: SelectedImagesReviewMode;
  setCaptureQueueMode: React.Dispatch<React.SetStateAction<SelectedImagesReviewMode>>;
  referenceOutfitTargetItemId: number | null;
  setReferenceOutfitTargetItemId: React.Dispatch<React.SetStateAction<number | null>>;
  /** 同步 image intake 的 captureMode */
  setCaptureMode: (v: CaptureMode) => void;
  /** 同步 image intake 的 imageIntakePurpose */
  setImageIntakePurpose: (v: ImageIntakePurpose) => void;
  /** 触发当前图片裁切 */
  onCropCurrent: () => void;
  /** 删除指定 clientId 的图片 */
  onDelete: (clientId: string) => void;
  /** 取消队列 */
  onCancel: () => void;
  /** 确认队列（根据 mode 执行不同逻辑） */
  onConfirm: () => Promise<void>;
}

export function useWardrobeCaptureQueueController(
  options: UseWardrobeCaptureQueueControllerOptions,
): UseWardrobeCaptureQueueControllerReturn {
  const { showMessage, refreshState, patchItemInItemsState } = options;

  const [captureCropJob, setCaptureCropJob] = useState<CaptureCropJob | null>(null);
  const [captureImageQueue, setCaptureImageQueue] = useState<CaptureImageQueueItem[]>([]);
  const [captureQueueIndex, setCaptureQueueIndex] = useState(0);
  const [captureQueueMode, setCaptureQueueMode] = useState<SelectedImagesReviewMode>("capture");
  const [referenceOutfitTargetItemId, setReferenceOutfitTargetItemId] = useState<number | null>(null);
  // 同步来自 image intake controller 的状态
  const [captureMode, setCaptureMode] = useState<CaptureMode>(options.captureMode ?? "item");
  const [imageIntakePurpose, setImageIntakePurpose] = useState<ImageIntakePurpose>(options.imageIntakePurpose ?? null);

  // 触发当前图片裁切
  const onCropCurrent = useCallback(() => {
    if (!captureImageQueue.length) return;
    const item = captureImageQueue[captureQueueIndex];
    if (!item) return;
    setCaptureCropJob({
      dataUrl: item.originalDataUrl,
      fileName: item.fileName,
      mode: captureMode,
      purpose: imageIntakePurpose,
      startBox: item.cropBox,
      onConfirm: async (newImageDataUrl: string, newBox: NormalizedCropBox) => {
        const thumb = await generateThumbnailSafe(newImageDataUrl);
        setCaptureImageQueue((prev) =>
          prev.map((it, i) =>
            i === captureQueueIndex
              ? {
                  ...it,
                  imageDataUrl: newImageDataUrl,
                  cropBox: newBox,
                  cropped: true,
                  ...(thumb.thumbnailDataUrl ? { thumbnailDataUrl: thumb.thumbnailDataUrl } : {}),
                  ...(thumb.thumbnailVersion !== undefined ? { thumbnailVersion: thumb.thumbnailVersion } : {}),
                  ...(thumb.thumbnailUpdatedAt ? { thumbnailUpdatedAt: thumb.thumbnailUpdatedAt } : {}),
                  ...(thumb.thumbnailStatus === "failed" ? { thumbnailStatus: "failed" as const } : {}),
                }
              : it,
          ),
        );
        setCaptureCropJob(null);
      },
    });
  }, [captureImageQueue, captureQueueIndex, captureMode, imageIntakePurpose]);

  // 删除指定 clientId 的图片
  const onDelete = useCallback(
    (clientId: string) => {
      setCaptureImageQueue((prev) => {
        const next = prev.filter((it) => it.clientId !== clientId);
        const removedIndex = prev.findIndex((it) => it.clientId === clientId);
        if (next.length === 0) {
          setCaptureQueueIndex(0);
        } else {
          const safeRemoved = removedIndex >= 0 ? removedIndex : prev.length - 1;
          setCaptureQueueIndex(Math.min(safeRemoved, next.length - 1));
        }
        return next;
      });
    },
    [],
  );

  // 取消队列
  const onCancel = useCallback(() => {
    setCaptureImageQueue([]);
    setCaptureQueueIndex(0);
    setReferenceOutfitTargetItemId(null);
  }, []);

  // 确认队列
  const onConfirm = useCallback(async () => {
    if (imageIntakePurpose === "reference") {
      const targetId = referenceOutfitTargetItemId;
      if (targetId == null) {
        showMessage("未指定目标衣物，灵感图未保存", "error");
        setCaptureImageQueue([]);
        return;
      }
      const now = new Date().toISOString();
      const refs = await Promise.all(
        captureImageQueue.map(async (item) => {
          const thumb = await generateThumbnailSafe(item.imageDataUrl);
          return {
            id: `${item.clientId}-${Math.random().toString(36).slice(2, 8)}`,
            imageDataUrl: item.imageDataUrl,
            sourceImageDataUrl: item.originalDataUrl,
            cropBox: item.cropBox,
            createdAt: now,
            updatedAt: now,
            ...(thumb.thumbnailDataUrl ? { thumbnailDataUrl: thumb.thumbnailDataUrl } : {}),
            ...(thumb.thumbnailVersion !== undefined ? { thumbnailVersion: thumb.thumbnailVersion } : {}),
            ...(thumb.thumbnailUpdatedAt ? { thumbnailUpdatedAt: thumb.thumbnailUpdatedAt } : {}),
            ...(thumb.thumbnailStatus ? { thumbnailStatus: thumb.thumbnailStatus } : {}),
          };
        }),
      );
      const snapshot = await getWardrobeSnapshot();
      const item = snapshot.items.find((i) => i.id === targetId);
      if (!item) throw new Error("目标衣物不存在");
      const existing = Array.isArray(item.referenceOutfitImages) ? item.referenceOutfitImages : [];
      const updated = [...existing, ...refs];
      await bridgeGarmentUpdate({ ...item, referenceOutfitImages: updated, updatedAt: now });
      patchItemInItemsState(targetId, { referenceOutfitImages: updated, updatedAt: now });
      await refreshState();
      setCaptureImageQueue([]);
      setReferenceOutfitTargetItemId(null);
      showMessage(`已添加 ${refs.length} 张灵感图`);
      return;
    }
    // capture / garment_intake / wishlist_intake 的队列分流逻辑由 wardrobe-app.tsx 接管
    // 此处只处理 reference 模式，capture 模式由父组件处理
  }, [
    imageIntakePurpose,
    referenceOutfitTargetItemId,
    captureImageQueue,
    showMessage,
    refreshState,
    patchItemInItemsState,
  ]);

  return {
    captureCropJob,
    setCaptureCropJob,
    captureImageQueue,
    setCaptureImageQueue,
    captureQueueIndex,
    setCaptureQueueIndex,
    captureQueueMode,
    setCaptureQueueMode,
    referenceOutfitTargetItemId,
    setReferenceOutfitTargetItemId,
    setCaptureMode,
    setImageIntakePurpose,
    onCropCurrent,
    onDelete,
    onCancel,
    onConfirm,
  };
}