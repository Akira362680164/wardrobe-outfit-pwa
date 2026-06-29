// src/components/batch-review-view.tsx
// v1.1.9 4C: extracted BatchReviewView + SimilarMatchesPanel from wardrobe-app.tsx

import { useState, useEffect, useMemo, useRef, useLayoutEffect } from "react";
import { motion } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  SaveAll,
  Layers,
} from "lucide-react";
import { App } from "@capacitor/app";
import { GarmentImmersiveDetail } from "@/components/garment-immersive-detail";
import { GarmentImage } from "@/components/garment-image";
import { ImageCropEditor } from "@/components/image-crop-editor";
import { duration, staggerReveal } from "@/lib/motion-tokens";
import type { NormalizedCropBox } from "@/lib/image";
import { createGarmentThumbnailFromOriginal } from "@/lib/thumbnail-runtime";
import type {
  GarmentCategory,
  GarmentFitGender,
  GarmentStatus,
  Season,
  GarmentStyle,
  SimilarWardrobeMatch,
} from "@/lib/types";
import {
  CATEGORY_LABELS,
  SEASON_LABELS,
  STATUS_LABELS,
  STYLE_LABELS,
} from "@/lib/types";
import { COLOR_OPTIONS } from "@/lib/color-catalog";
import {
  ChipGroup,
  SelectableChipGroup,
  RangeField,
} from "@/components/wardrobe-form-controls";

export interface BatchReviewViewProps {
  drafts: WardrobeDraft[];
  locationNameById: Record<string, string>;
  reviewIndex: number;
  setReviewIndex: (index: number) => void;
  captureMode: CaptureMode;
  saveAsOutfit: boolean;
  setSaveAsOutfit: (value: boolean) => void;
  onUpdateDraft: (index: number, patch: Partial<WardrobeDraft>) => void;
  onSaveAll: () => void;
  onCancel: () => void;
  onExpandImage: (image: { src: string; alt: string }) => void;
  onSaveCurrent: (index: number, nextReviewIndex?: number) => void;
  onMessage?: (text: string, type?: "success" | "error" | "info") => void;
  onDetailChange?: (isDetail: boolean) => void;
}

type CaptureMode = "item" | "outfit";

export interface WardrobeDraft {
  clientId?: string;
  name: string;
  imageDataUrl?: string;
  thumbnailDataUrl?: string;
  sourceImageDataUrl?: string;
  cropBox?: NormalizedCropBox;
  category: GarmentCategory;
  seasons: Season[];
  status: GarmentStatus;
  locationId: string;
  primaryColors: string[];
  secondaryColors: string[];
  formality?: number;
  warmth?: number;
  notes?: string;
  aiConfidence?: number;
  needsReview?: boolean;
  styles: GarmentStyle[];
  fitGender?: GarmentFitGender;
  similarMatches?: SimilarWardrobeMatch[];
  useExistingItemId?: number;
  selected?: boolean;
}

const categoryOptions = Object.keys(CATEGORY_LABELS) as GarmentCategory[];
const seasonOptions = Object.keys(SEASON_LABELS) as Season[];
const styleOptions = Object.keys(STYLE_LABELS) as GarmentStyle[];
const statusOptions = Object.keys(STATUS_LABELS) as GarmentStatus[];

function SimilarMatchesPanel({
  matches,
  selectedExistingId,
  onUseExisting,
  onKeepNew,
  onExpandImage,
}: {
  matches: SimilarWardrobeMatch[];
  selectedExistingId?: number;
  onUseExisting: (itemId: number) => void;
  onKeepNew: () => void;
  onExpandImage: (image: { src: string; alt: string }) => void;
}) {
  if (matches.length === 0) return null;

  return (
    <div className="grid gap-2 rounded-lg border border-clay/20 bg-clay/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">发现相似衣物</p>
        <button type="button" onClick={onKeepNew} className="rounded-lg border border-ink/10 bg-white px-2.5 py-1 text-xs font-semibold">
          保留新增
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto hide-scrollbar">
        {matches.map((match) => (
          <div key={match.item.id} className={`w-28 shrink-0 rounded-lg border bg-white p-2 ${selectedExistingId === match.item.id ? "border-denim" : "border-ink/10"}`}>
            <button
              type="button"
              onClick={() => onExpandImage({ src: match.item.imageDataUrl ?? "", alt: match.item.name })}
              className="aspect-square w-full overflow-hidden rounded-md bg-mist"
            >
              {match.item.imageDataUrl ? (
                <GarmentImage src={match.item.thumbnailDataUrl} alt={match.item.name} imageClassName="object-contain" />
              ) : null}
            </button>
            <p className="mt-1 truncate text-xs font-semibold">{match.item.name}</p>
            <p className="text-[11px] text-clay">{match.similarity}% 相似</p>
            <p className="line-clamp-2 text-[10px] text-ink/45">{match.reasons.join("、")}</p>
            {match.item.id ? (
              <button
                type="button"
                onClick={() => onUseExisting(match.item.id as number)}
                className={`mt-2 h-7 w-full rounded-md text-[11px] font-semibold ${selectedExistingId === match.item.id ? "bg-denim text-white" : "bg-mist text-ink/70"}`}
              >
                {selectedExistingId === match.item.id ? "已使用已有" : "用已有"}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function BatchReviewView({
  drafts,
  locationNameById,
  reviewIndex,
  setReviewIndex,
  captureMode,
  saveAsOutfit,
  setSaveAsOutfit,
  onUpdateDraft,
  onSaveAll,
  onCancel,
  onExpandImage,
  onSaveCurrent,
  onMessage,
  onDetailChange,
}: BatchReviewViewProps) {
  const [isDetail, setIsDetail] = useState(false);
  useEffect(() => {
    onDetailChange?.(isDetail);
  }, [isDetail, onDetailChange]);
  useEffect(() => () => { onDetailChange?.(false); }, [onDetailChange]);
  const [showAdjust, setShowAdjust] = useState(false);
  const [captureCropJob, setCaptureCropJob] = useState<{
    dataUrl: string;
    startBox?: WardrobeDraft["cropBox"];
    onConfirm: (newImageDataUrl: string, newBox: NormalizedCropBox) => void | Promise<void>;
  } | null>(null);
  useEffect(() => {
    if (!isDetail && captureCropJob) setCaptureCropJob(null);
  }, [isDetail, captureCropJob]);
  useEffect(() => {
    if (isDetail && drafts.length === 0) setIsDetail(false);
  }, [drafts.length, isDetail]);
  const brvPrimaryRef = useRef<HTMLDivElement>(null);
  const brvSecondaryRef = useRef<HTMLDivElement>(null);
  const selectedDraftCount = drafts.filter((d) => d.selected !== false).length;

  const sortedDisplay = useMemo(() => {
    return drafts
      .map((draft, originalIndex) => ({ draft, originalIndex }))
      .sort((a, b) => {
        const aRisk = (a.draft.needsReview ? 0 : 1) + (a.draft.aiConfidence != null && a.draft.aiConfidence < 0.7 ? 0 : 1);
        const bRisk = (b.draft.needsReview ? 0 : 1) + (b.draft.aiConfidence != null && b.draft.aiConfidence < 0.7 ? 0 : 1);
        const aSim = a.draft.similarMatches?.[0]?.similarity ?? 0;
        const bSim = b.draft.similarMatches?.[0]?.similarity ?? 0;
        if (aRisk !== bRisk) return aRisk - bRisk;
        return bSim - aSim;
      });
  }, [drafts]);

  useEffect(() => {
    if (isDetail) window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [isDetail]);

  useEffect(() => {
    if (!isDetail) return;
    let removed = false;
    let handle: { remove: () => void } | null = null;
    App.addListener("backButton", () => {
      if (removed) return;
      if (captureCropJob) {
        setCaptureCropJob(null);
        return;
      }
      setIsDetail(false);
    }).then((h) => { if (!removed) handle = h; });
    return () => { removed = true; handle?.remove(); };
  }, [isDetail, captureCropJob]);
  const activeDisplayIndex = sortedDisplay.length > 0 ? Math.max(0, Math.min(reviewIndex, sortedDisplay.length - 1)) : 0;
  const currentEntry = sortedDisplay[activeDisplayIndex];
  const current = currentEntry?.draft;
  const currentOriginalIndex = currentEntry?.originalIndex ?? 0;

  useLayoutEffect(() => {
    if (sortedDisplay.length > 0 && reviewIndex >= sortedDisplay.length) {
      setReviewIndex(sortedDisplay.length - 1);
    }
  }, [reviewIndex, setReviewIndex, sortedDisplay.length]);

  function goPrev() {
    if (activeDisplayIndex > 0) setReviewIndex(activeDisplayIndex - 1);
  }

  function goNext() {
    if (activeDisplayIndex < sortedDisplay.length - 1) setReviewIndex(activeDisplayIndex + 1);
  }

  function openDetail(displayIndex: number) {
    setReviewIndex(displayIndex);
    setIsDetail(true);
  }

  if (isDetail && current) {
    return (
      <div className="grid gap-4">
        <GarmentImmersiveDetail
          item={{
            name: current.name || "候选衣物",
            imageDataUrl: current.imageDataUrl,
            thumbnailDataUrl: current.thumbnailDataUrl,
            cropBox: current.cropBox,
            categoryLabel: CATEGORY_LABELS[current.category],
            seasonLabels: current.seasons.map((s) => SEASON_LABELS[s]),
            statusLabel: STATUS_LABELS[current.status],
            locationLabel: locationNameById[current.locationId] ?? current.locationId,
            primaryColors: current.primaryColors,
            secondaryColors: current.secondaryColors,
            confidenceLabel: current.aiConfidence !== undefined ? `识别置信度 ${Math.round(current.aiConfidence * 100)}%` : undefined,
            needsReview: current.needsReview,
            notes: current.notes,
          }}
          counterText={`${activeDisplayIndex + 1} / ${sortedDisplay.length}`}
          onBack={() => {
            if (captureCropJob) {
              setCaptureCropJob(null);
              return;
            }
            setIsDetail(false);
          }}
          onOpenImage={() => onExpandImage({ src: current.imageDataUrl || "", alt: current.name || "候选衣物" })}
          onCrop={current.imageDataUrl ? () => {
            const originalDataUrl = current.imageDataUrl!;
            setCaptureCropJob({
              dataUrl: originalDataUrl,
              startBox: current.cropBox,
              onConfirm: async (_newImageDataUrl, newBox) => {
                const thumb = await createGarmentThumbnailFromOriginal({ originalDataUrl, cropBox: newBox });
                onUpdateDraft(currentOriginalIndex, { cropBox: newBox, ...(thumb.thumbnailDataUrl ? { thumbnailDataUrl: thumb.thumbnailDataUrl } : {}) });
                setCaptureCropJob(null);
              },
            });
          } : undefined}
          detailEditor={
            <details
              open={showAdjust}
              onToggle={(e) => setShowAdjust((e.currentTarget as HTMLDetailsElement).open)}
              className="rounded-lg overflow-hidden"
            >
              <summary className="cursor-pointer select-none py-2 flex items-center justify-between text-sm font-semibold">
                <span>调整属性</span>
                <span className="text-ink/40 text-xs">{showAdjust ? "收起" : "展开"}</span>
              </summary>
              <div className="border-t border-ink/10 pt-3 grid gap-4">
                <label className="grid gap-1 text-sm font-medium">
                  名称
                  <input
                    value={current.name}
                    onChange={(event) => onUpdateDraft(currentOriginalIndex, { name: event.target.value })}
                    className="h-11 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
                  />
                </label>

                <label className="grid gap-1 text-sm font-medium">
                  类别
                  <select
                    value={current.category}
                    onChange={(event) => onUpdateDraft(currentOriginalIndex, { category: event.target.value as GarmentCategory })}
                    className="h-11 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
                  >
                    {categoryOptions.map((cat) => (
                      <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                    ))}
                  </select>
                </label>

                <ChipGroup title="主色" options={[...COLOR_OPTIONS]} values={current.primaryColors} onChange={(primaryColors) => onUpdateDraft(currentOriginalIndex, { primaryColors })} scrollRef={brvPrimaryRef} />
                <ChipGroup title="配色" options={[...COLOR_OPTIONS]} values={current.secondaryColors} onChange={(secondaryColors) => onUpdateDraft(currentOriginalIndex, { secondaryColors })} scrollRef={brvSecondaryRef} />
                <ChipGroup title="季节" options={seasonOptions} labels={SEASON_LABELS} values={current.seasons} onChange={(seasons) => onUpdateDraft(currentOriginalIndex, { seasons })} />
                <ChipGroup title="风格" options={styleOptions} labels={STYLE_LABELS} values={current.styles} onChange={(styles) => onUpdateDraft(currentOriginalIndex, { styles })} />
                <SelectableChipGroup
                  title="版型倾向"
                  options={["menswear", "womenswear", "unisex", "unknown"] as GarmentFitGender[]}
                  labels={{ menswear: "男装", womenswear: "女装", unisex: "中性", unknown: "未判断" }}
                  values={current.fitGender ? [current.fitGender] : []}
                  onChange={(v) => onUpdateDraft(currentOriginalIndex, { fitGender: v[0] ?? "unknown" })}
                  mode="single"
                  maxSelected={1}
                  selectedFirst
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <RangeField label="正式度" value={current.formality ?? 0} onChange={(formality) => onUpdateDraft(currentOriginalIndex, { formality })} />
                  <RangeField label="保暖度" value={current.warmth ?? 0} onChange={(warmth) => onUpdateDraft(currentOriginalIndex, { warmth })} />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm font-medium">
                    位置
                    <span className="h-11 flex items-center rounded-lg border border-ink/10 bg-white px-3 text-sm text-ink/60">
                      {locationNameById[current.locationId] ?? current.locationId}
                    </span>
                  </label>
                  <label className="grid gap-1 text-sm font-medium">
                    状态
                    <select
                      value={current.status}
                      onChange={(event) => onUpdateDraft(currentOriginalIndex, { status: event.target.value as GarmentStatus })}
                      className="h-11 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
                    >
                      {statusOptions.map((s) => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="grid gap-1 text-sm font-medium">
                  备注
                  <textarea
                    value={current.notes ?? ""}
                    onChange={(event) => onUpdateDraft(currentOriginalIndex, { notes: event.target.value })}
                    rows={2}
                    className="resize-none rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm outline-none focus:border-denim"
                  />
                </label>

                <SimilarMatchesPanel
                  matches={current.similarMatches ?? []}
                  selectedExistingId={current.useExistingItemId}
                  onUseExisting={(useExistingItemId) => onUpdateDraft(currentOriginalIndex, { useExistingItemId })}
                  onKeepNew={() => onUpdateDraft(currentOriginalIndex, { useExistingItemId: undefined })}
                  onExpandImage={onExpandImage}
                />
              </div>
            </details>
          }
        />

        <div className="fixed bottom-20 left-0 right-0 z-40 px-3 pb-[env(safe-area-inset-bottom)] pointer-events-none">
          <div className="mx-auto max-w-md bg-white border border-ink/10 rounded-2xl shadow-lg p-1.5 flex items-center gap-1.5 pointer-events-auto">
            <button type="button" onClick={goPrev} disabled={activeDisplayIndex === 0} aria-label="上一件" className="grid h-11 w-11 place-items-center rounded-full bg-mist text-ink disabled:opacity-30 hover:bg-ink/10 transition-colors">
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <span className="text-xs font-medium text-ink/60 tabular-nums px-1"><b className="text-ink">{activeDisplayIndex + 1}</b> / {sortedDisplay.length}</span>
            <button type="button" onClick={goNext} disabled={activeDisplayIndex >= sortedDisplay.length - 1} aria-label="下一件" className="grid h-11 w-11 place-items-center rounded-full bg-mist text-ink disabled:opacity-30 hover:bg-ink/10 transition-colors">
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => onSaveCurrent(currentOriginalIndex, activeDisplayIndex >= sortedDisplay.length - 1 ? 0 : activeDisplayIndex)}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-clay px-4 text-sm font-semibold text-white active:scale-95 transition-transform"
            >
              <SaveAll size={15} />
              录入这件
            </button>
          </div>
        </div>
        <div className="h-20" />

        {captureCropJob && (
          <ImageCropEditor
            source={captureCropJob.dataUrl}
            initialCropBox={captureCropJob.startBox}
            aspectRatio="free"
            onCancel={() => setCaptureCropJob(null)}
            onConfirm={(newImageDataUrl, newBox) => {
              void captureCropJob.onConfirm(newImageDataUrl, newBox);
            }}
            onError={(msg) => onMessage?.(msg)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="surface rounded-lg p-3 flex items-center gap-3 flex-wrap">
        <Layers size={20} className="text-denim" aria-hidden="true" />
        <span className="text-sm font-semibold">
          {captureMode === "outfit" ? "确认录入套装" : "确认录入"} {selectedDraftCount} 件
        </span>
        {captureMode === "outfit" ? (
          <label className="flex items-center gap-2 rounded-lg border border-ink/10 bg-white px-3 py-2 text-xs font-medium">
            <input
              type="checkbox"
              checked={saveAsOutfit}
              onChange={(event) => setSaveAsOutfit(event.target.checked)}
              className="h-4 w-4 accent-denim"
            />
            收藏当前套装
          </label>
        ) : null}
        <div className="flex-1" />
        <button type="button" onClick={onCancel} className="inline-flex h-9 items-center gap-1 rounded-lg border border-ink/10 bg-white px-3 text-sm">
          取消
        </button>
        <button type="button" onClick={onSaveAll} disabled={selectedDraftCount === 0} className="inline-flex h-9 items-center gap-2 rounded-lg bg-clay px-4 text-sm font-semibold text-white disabled:opacity-40">
          <SaveAll size={16} aria-hidden="true" />
          {captureMode === "outfit" ? `确认套装 ${selectedDraftCount} 件` : `保存所选 ${selectedDraftCount} 件`}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {sortedDisplay.map(({ draft: d, originalIndex }, displayIndex) => (
          <motion.div
            key={d.clientId ?? originalIndex}
            variants={staggerReveal}
            initial="initial"
            animate="in"
            transition={{ duration: duration.normal, delay: Math.min(displayIndex * 0.05, 0.3) }}
          >
            <div className={`overflow-hidden rounded-lg border bg-white shadow-sm transition-colors ${
              d.selected === false ? "border-ink/10 opacity-55" : "border-denim/35"
            }`}>
              <button type="button" onClick={() => openDetail(displayIndex)} className="w-full text-left">
                <div className="aspect-[4/5] bg-mist">
                  <GarmentImage src={d.imageDataUrl || undefined} alt={d.name} fallbackSize={24} />
                </div>
                <div className="p-2">
                  <p className="truncate text-xs font-semibold">{d.name || "未命名"}</p>
                  <p className="truncate text-[11px] text-ink/50">{CATEGORY_LABELS[d.category]}</p>
                  {d.needsReview ? (
                    <span className="inline-block mt-1 rounded-md bg-clay/12 px-1.5 py-0.5 text-[10px] text-clay">待确认</span>
                  ) : null}
                  {d.similarMatches?.length ? (
                    <span className="ml-1 inline-block mt-1 rounded-md bg-denim/10 px-1.5 py-0.5 text-[10px] text-denim">
                      相似 {d.similarMatches[0].similarity}%
                    </span>
                  ) : null}
                </div>
              </button>
              <button
                type="button"
                onClick={() => onUpdateDraft(originalIndex, { selected: d.selected === false })}
                className="flex h-8 w-full items-center justify-center border-t border-ink/8 text-[11px] font-semibold text-ink/62"
              >
                {d.selected === false ? "加入录入" : "已选择"}
              </button>
            </div>
          </motion.div>
        ))}
      </div>
      <p className="text-xs text-ink/50 text-center">点击卡片查看和编辑详情，左右滑动切换上一件/下一件</p>
    </div>
  );
}
