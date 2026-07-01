"use client";

/**
 * GarmentDetail30 — 单品详情页 3.0
 * --------------------------------------------------------------
 * 三 Tab 结构: 信息 / 灵感 / 搭配
 * - 信息: AI建议卡 + 主信息 + 基础信息 + 备注
 * - 灵感: referenceOutfitImages 3 列网格 + 空状态 + 添加
 * - 搭配: 历史套装 + 推荐搭配单品
 *
 * 职责: 纯展示 + 事件委托, 不直接读写 Dexie / MiniMax。
 */

import { useState, useMemo, useRef, useEffect } from "react";
import { ChevronLeft, Plus, Check, Settings, Trash2, Image, Shirt } from "lucide-react";
import type { WardrobeItem, SavedOutfit, ClosetLocation, GarmentStyleAdvice, ReferenceOutfitImage } from "@/lib/types";
import { CATEGORY_LABELS, SEASON_LABELS, STYLE_LABELS } from "@/lib/types";
import { formatGarmentFitGender, formatSubcategoryLabel } from "@/lib/display-labels";
import type { WearSummary } from "@/lib/wear-records";
import { getWearSummary, getLocalDateKey } from "@/lib/wear-records";
import type { RecommendedPairingItem } from "@/lib/garment-detail-pairing";
import type { SwipeImageSlide } from "@/components/swipe-image-carousel";
import { clampCarouselIndex } from "@/lib/carousel-logic";
import { OutfitCover } from "@/components/outfit-cover";
import { MotionPopoverMenu } from "@/components/motion-common";
import { ItemDetailPageShell } from "@/components/item-shell/item-detail-page-shell";
import {
  DetailAiCard,
  DetailFilmstrip,
  DetailHeroGallery,
  DetailTabs,
  DetailTitleMetaBlock,
  DetailTopBar,
  getDetailSlideLabel,
} from "@/components/detail-shell";
import { ItemDetailSections } from "@/components/item/detail-sections";
import { WardrobeExtras } from "@/components/item/wardrobe-extras";

/* ------------------------------------------------------------------ */
/*  Props                                                             */
/* ------------------------------------------------------------------ */

export interface GarmentDetail30Props {
  item: WardrobeItem;
  allItems: WardrobeItem[];
  outfits: SavedOutfit[];
  locations: ClosetLocation[];
  wearSummary: WearSummary;
  aiStyleAdvice?: GarmentStyleAdvice;
  aiAdviceState: "idle" | "loading" | "success" | "error" | "no_key";
  hasMiniMaxKey: boolean;
  pairingItems: RecommendedPairingItem[];
  currentImageIndex: number;
  onCurrentImageIndexChange: (idx: number) => void;
  onBack: () => void;
  onWearToggle: () => void;
  onEdit: () => void;
  onDelete: () => Promise<void> | void;
  onMoveItem: (locationId: string) => void;
  onAddReferenceImage: () => void;
  onViewReferenceImage: (ref: ReferenceOutfitImage) => void;
  onGenerateAdvice: () => void;
  onGoSettings: () => void;
  onViewOutfit: (outfitId: string) => void;
  onExpandImage: (image: { src: string; alt: string; thumbnailSrc?: string; cropBox?: WardrobeItem["cropBox"]; displayMode?: "original-cropped" }) => void;
  initialTab?: "info" | "inspiration" | "pairing";
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

export function GarmentDetail30({
  item, allItems, outfits, locations,
  wearSummary, aiStyleAdvice, aiAdviceState, hasMiniMaxKey, pairingItems,
  currentImageIndex, onCurrentImageIndexChange,
  onBack, onWearToggle, onEdit, onDelete, onMoveItem,
  onAddReferenceImage, onViewReferenceImage,
  onGenerateAdvice, onGoSettings, onViewOutfit,
  onExpandImage,
  initialTab,
}: GarmentDetail30Props) {
  const [activeTab, setActiveTab] = useState<"info" | "inspiration" | "pairing">(initialTab ?? "info");
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveSheetOpen, setMoveSheetOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const menuAnchorRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setActiveTab(initialTab ?? "info");
  }, [item.id, initialTab]);

  async function confirmDelete() {
    if (deleteSubmitting) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      await onDelete();
      setDeleteConfirmOpen(false);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "删除失败，请重试");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  // ── 图片区 ──
  const refs = useMemo(() => (Array.isArray(item.referenceOutfitImages) ? item.referenceOutfitImages : []), [item.referenceOutfitImages]);

  const slides: SwipeImageSlide[] = useMemo(() => {
    const mainOriginal = item.imageDataUrl;
    const main: SwipeImageSlide = {
      kind: "image",
      id: "main",
      imageDataUrl: item.thumbnailDataUrl || "",
      thumbnailSrc: item.thumbnailDataUrl,
      displaySrc: mainOriginal,
      sourceSrc: mainOriginal,
      alt: item.name,
      badge: "主图",
      badgeClassName: "bg-denim",
      displayMode: "original-cropped",
      originalSrc: mainOriginal,
      cropBox: item.cropBox,
    };
    const extras: SwipeImageSlide[] = refs.map((r, i) => ({
      kind: "image" as const,
      id: r.id,
      imageDataUrl: r.imageDataUrl,
      thumbnailSrc: r.thumbnailDataUrl || r.imageDataUrl,
      displaySrc: r.imageDataUrl,
      sourceSrc: r.sourceImageDataUrl || r.imageDataUrl,
      alt: r.caption || `灵感图 ${i + 1}`,
      badge: "灵感",
      badgeClassName: "bg-clay",
    }));
    return [main, ...extras];
  }, [item.imageDataUrl, item.thumbnailDataUrl, item.cropBox, item.cropRevision, item.thumbnailCropRevision, item.name, refs]);

  const safeIndex = clampCarouselIndex(currentImageIndex, slides.length);
  useEffect(() => {
    if (currentImageIndex !== safeIndex) onCurrentImageIndexChange(safeIndex);
  }, [currentImageIndex, safeIndex, onCurrentImageIndexChange]);

  const activeSlideId = slides[safeIndex]?.id ?? "main";
  const detailSlides = slides.map((slide) => ({
    id: slide.id,
    label: slide.id === "main" ? getDetailSlideLabel("garment_main") : getDetailSlideLabel("garment_reference"),
    alt: slide.alt || item.name,
    imageDataUrl: slide.displaySrc || slide.imageDataUrl,
    thumbnailDataUrl: slide.thumbnailSrc,
    displayMode: slide.displayMode,
    originalSrc: slide.originalSrc,
    cropBox: slide.cropBox,
  }));
  const filmstripItems = detailSlides.map((slide) => ({
    id: slide.id,
    label: slide.label,
    imageDataUrl: slide.imageDataUrl,
    thumbnailDataUrl: slide.thumbnailDataUrl,
  }));

  // ── 信息 Tab 派生 ──
  const locationLabel = useMemo(() => {
    const loc = locations.find((l) => l.id === item.locationId);
    return loc?.name ?? item.locationId ?? "未设置";
  }, [locations, item.locationId]);

  const seasonLabels = item.seasons.length > 0 ? item.seasons.map((s) => SEASON_LABELS[s]) : [];
  const styleLabels = item.styles.length > 0 ? item.styles.map((s) => STYLE_LABELS[s]) : [];
  const subcategory = item.subcategory ? formatSubcategoryLabel(item.category, item.subcategory) || undefined : undefined;
  const material = item.material;
  const purchaseDate = item.purchaseDate;
  const temperatureRange = item.temperatureRange;
  const notes = item.notes?.trim();
  const metaParts = [
    CATEGORY_LABELS[item.category],
    seasonLabels.join("/"),
    styleLabels.join("/"),
    locationLabel,
  ];

  // ── 搭配 Tab 派生 ──
  const historyOutfits = useMemo(() => {
    if (typeof item.id !== "number") return [];
    return outfits
      .filter((o) => Array.isArray(o.itemIds) && o.itemIds.includes(item.id!))
      .sort((a, b) => {
        // v0.9.49-dev auto-fix: 用本地时区日期避免中国/日本等时区跨日错位。
        // 之前用 new Date().toISOString().slice(0, 10) 在凌晨 0:00-1:00 UTC 切到下一天,
        // 本地用户的"今天"会少 8 小时。
        const today = getLocalDateKey();
        const aToday = (a.wornDates ?? []).includes(today) ? 1 : 0;
        const bToday = (b.wornDates ?? []).includes(today) ? 1 : 0;
        if (aToday !== bToday) return bToday - aToday;
        return b.updatedAt.localeCompare(a.updatedAt);
      })
      .slice(0, 10);
  }, [outfits, item.id]);

  // ── 三点菜单 ──
  const hasMultipleLocations = locations.length > 1;

  return (
    <ItemDetailPageShell
      contentClassName="mx-auto w-full max-w-4xl pb-[calc(env(safe-area-inset-bottom)+24px)]"
      topBar={<DetailTopBar title="" onBack={onBack} onMore={() => setMenuOpen((v) => !v)} moreButtonRef={menuAnchorRef} />}
      hero={
        <DetailHeroGallery
          slides={detailSlides}
          currentIndex={safeIndex}
          onIndexChange={onCurrentImageIndexChange}
          onExpandImage={onExpandImage}
          bottomRightAction={
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); onWearToggle(); }}
              className="inline-flex h-9 items-center gap-1 rounded-full bg-white/90 border border-white/60 px-3 text-xs font-semibold shadow-sm text-ink/80"
            >
              {wearSummary.hasToday ? "✓ 今天已穿" : "标记今天穿了"}
            </button>
          }
        />
      }
      filmstrip={
        <DetailFilmstrip
          items={filmstripItems}
          activeId={activeSlideId}
          onSelect={(id) => {
            const index = slides.findIndex((slide) => slide.id === id);
            if (index >= 0) onCurrentImageIndexChange(index);
          }}
          addLabel="灵感"
          onAdd={onAddReferenceImage}
        />
      }
      titleBlock={<DetailTitleMetaBlock eyebrow={wearSummary.label} title={item.name} metaParts={metaParts} />}
      tabs={
        <DetailTabs
          tabs={[
            { key: "info", label: "信息" },
            { key: "inspiration", label: "灵感" },
            { key: "pairing", label: "搭配" },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />
      }
      overlays={
        <>
        <MotionPopoverMenu
          visible={menuOpen}
          onClose={() => setMenuOpen(false)}
          anchorRef={menuAnchorRef as React.RefObject<HTMLElement | null>}
        >
          <div className="min-w-[160px] p-1">
            <button
              type="button"
              onClick={() => { setMenuOpen(false); onEdit(); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-ink/80 hover:bg-mist"
            >
              <Settings size={14} /> 编辑衣物
            </button>
            <button
              type="button"
              onClick={() => { setMenuOpen(false); setMoveSheetOpen(true); }}
              disabled={!hasMultipleLocations}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm hover:bg-mist ${hasMultipleLocations ? "text-ink/80" : "text-ink/25"}`}
            >
              <ChevronLeft size={14} className="rotate-90" /> 移动衣物
            </button>
            <button
              type="button"
              onClick={() => { setMenuOpen(false); setDeleteError(null); setDeleteConfirmOpen(true); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"
            >
              <Trash2 size={14} /> 删除衣物
            </button>
          </div>
        </MotionPopoverMenu>
          {moveSheetOpen ? <MoveLocationSheet locations={locations} currentLocationId={item.locationId} onMove={(locId) => { setMoveSheetOpen(false); onMoveItem(locId); }} onClose={() => setMoveSheetOpen(false)} /> : null}
          {deleteConfirmOpen ? <DeleteConfirmDialog onDelete={confirmDelete} onCancel={() => { if (!deleteSubmitting) setDeleteConfirmOpen(false); }} submitting={deleteSubmitting} errorMessage={deleteError} /> : null}
        </>
      }
    >
      {activeTab === "info" ? <InfoTab item={item} aiStyleAdvice={aiStyleAdvice} aiAdviceState={aiAdviceState} hasMiniMaxKey={hasMiniMaxKey} onGenerateAdvice={onGenerateAdvice} onGoSettings={onGoSettings} locationLabel={locationLabel} seasonLabels={seasonLabels} styleLabels={styleLabels} subcategory={subcategory} material={material} purchaseDate={purchaseDate} temperatureRange={temperatureRange} notes={notes} /> : null}
      {activeTab === "inspiration" ? <InspirationTab refs={refs} onAdd={onAddReferenceImage} onView={onViewReferenceImage} /> : null}
      {activeTab === "pairing" ? <PairingTab allItems={allItems} historyOutfits={historyOutfits} pairingItems={pairingItems} onViewOutfit={onViewOutfit} /> : null}
    </ItemDetailPageShell>
  );
}

/* ------------------------------------------------------------------ */
/*  InfoTab                                                           */
/* ------------------------------------------------------------------ */

function InfoTab({
  item, aiStyleAdvice, aiAdviceState, hasMiniMaxKey,
  onGenerateAdvice, onGoSettings,
  locationLabel, seasonLabels, styleLabels,
  subcategory, material, purchaseDate, temperatureRange, notes,
}: {
  item: WardrobeItem;
  aiStyleAdvice?: GarmentStyleAdvice;
  aiAdviceState: "idle" | "loading" | "success" | "error" | "no_key";
  hasMiniMaxKey: boolean;
  onGenerateAdvice: () => void;
  onGoSettings: () => void;
  locationLabel: string;
  seasonLabels: string[];
  styleLabels: string[];
  subcategory?: string;
  material?: string;
  purchaseDate?: string;
  temperatureRange?: { minC?: number; maxC?: number };
  notes?: string;
}) {
  const hasCache = !!aiStyleAdvice;
  const displayState = hasCache ? "success" : aiAdviceState;
  const aiSummary = aiStyleAdvice ? (
    <div className="space-y-3">
      <p>{aiStyleAdvice.summary}</p>
      {aiStyleAdvice.scenes.length > 0 ? (
        <div>
          <p className="text-[10px] font-semibold text-ink/35 mb-1">适合场景</p>
          <div className="flex flex-wrap gap-1">
            {aiStyleAdvice.scenes.map((s, i) => (
              <span key={i} className="rounded-full bg-mist px-2 py-0.5 text-[11px] font-medium text-ink/60">{s}</span>
            ))}
          </div>
        </div>
      ) : null}
      {aiStyleAdvice.pairingTips.length > 0 ? (
        <div>
          <p className="text-[10px] font-semibold text-ink/35 mb-1">搭配建议</p>
          <ol className="list-decimal list-inside space-y-0.5">
            {aiStyleAdvice.pairingTips.map((t, i) => (
              <li key={i} className="text-[11px] text-ink/60">{t}</li>
            ))}
          </ol>
        </div>
      ) : null}
      {aiStyleAdvice.avoidTips.length > 0 ? (
        <div>
          <p className="text-[10px] font-semibold text-ink/35 mb-1">避免</p>
          <ol className="list-decimal list-inside space-y-0.5">
            {aiStyleAdvice.avoidTips.map((t, i) => (
              <li key={i} className="text-[11px] text-ink/60">{t}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="space-y-4">
      <DetailAiCard
        title="AI穿搭建议"
        summary={displayState === "success" ? aiSummary : undefined}
        sourceLabel={aiStyleAdvice ? "基于 AI 建议" : displayState === "no_key" ? "本地规则来源" : undefined}
        loading={displayState === "loading"}
        error={displayState === "error" ? "生成失败，网络或模型响应异常，请稍后重试。" : undefined}
        emptyText={displayState === "no_key" ? "未配置 AI Key，可先根据本地标签查看基础信息。" : "还没有生成建议"}
        actionLabel={hasCache ? "刷新" : displayState === "no_key" ? "去设置" : "生成"}
        onAction={displayState === "no_key" && !hasMiniMaxKey ? onGoSettings : onGenerateAdvice}
      />

      <ItemDetailSections
        name={item.name}
        categoryLabel={CATEGORY_LABELS[item.category]}
        subcategoryLabel={subcategory}
        priceLabel={item.price != null ? `${item.price}` : undefined}
        productUrl={item.productUrl}
        basicExtraRows={(
          <WardrobeExtras
            mode="view"
            locationLabel={locationLabel}
            purchaseDate={purchaseDate}
            status={item.status}
          />
        )}
        colors={item.colors}
        seasonLabel={seasonLabels.join(" / ") || undefined}
        styleLabel={styleLabels.join(" / ") || undefined}
        temperatureRange={temperatureRange}
        formality={item.formality}
        warmth={item.warmth}
        material={material}
        fitGenderLabel={formatGarmentFitGender(item.fitGender)}
        fitNotes={item.fitNotes}
        notes={notes}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  InspirationTab                                                     */
/* ------------------------------------------------------------------ */

function InspirationTab({
  refs, onAdd, onView,
}: {
  refs: ReferenceOutfitImage[];
  onAdd: () => void;
  onView: (ref: ReferenceOutfitImage) => void;
}) {
  // v0.9.49-dev auto-fix: 删除 InspirationTab 内 3 个完全未使用的 dead state (menuRef/setMenuRef/menuOpen/setMenuOpen/menuAnchorRef)。
  // 真正的灵感图编辑入口通过 onView/onEditCaption/onDelete props 由 wardrobe-app.tsx 触发。
  if (refs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-16 w-16 rounded-full bg-mist grid place-items-center mb-3">
          <Image size={24} className="text-ink/25" />
        </div>
        <p className="text-sm font-medium text-ink/40">还没有灵感图</p>
        <p className="text-xs text-ink/30 mt-1 max-w-[240px]">
          可以添加参考穿搭、买家秀或自己的穿搭照片。
        </p>
        <button
          type="button"
          onClick={onAdd}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-denim px-4 py-2 text-sm font-semibold text-white hover:bg-denim/90 transition-colors"
        >
          <Plus size={16} /> 添加灵感图
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-ink/40">{refs.length} 张参考穿搭</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {refs.map((ref) => (
          <div key={ref.id} className="relative group">
            <button
              type="button"
              onClick={() => onView(ref)}
              className="block w-full aspect-[3/4] overflow-hidden rounded-xl bg-mist"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ref.thumbnailDataUrl || ref.imageDataUrl}
                alt={ref.caption || "灵感图"}
                className="h-full w-full object-cover"
              />
            </button>
            {ref.caption && (
              <p className="text-[10px] text-ink/50 mt-1 truncate px-0.5">{ref.caption}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PairingTab                                                         */
/* ------------------------------------------------------------------ */

function PairingTab({
  allItems, historyOutfits, pairingItems, onViewOutfit,
}: {
  allItems: WardrobeItem[];
  historyOutfits: SavedOutfit[];
  pairingItems: RecommendedPairingItem[];
  onViewOutfit: (outfitId: string) => void;
}) {

  return (
    <div className="space-y-5">
      {/* 历史套装 */}
      {historyOutfits.length > 0 && (
        <div>
          <p className="text-xs font-medium text-ink/40 mb-2">历史套装</p>
          <div className="flex gap-2 overflow-x-auto">
            {historyOutfits.map((outfit) => {
              const summary = getWearSummary(outfit.wornDates);
              const validCount = outfit.itemIds.length;
              return (
                <button
                  key={outfit.id}
                  type="button"
                  onClick={() => onViewOutfit(outfit.id)}
                  className="shrink-0 w-[140px] overflow-hidden rounded-xl border border-ink/8 bg-white text-left"
                >
                  <div className="aspect-square">
                    <OutfitCover outfit={outfit} items={allItems} size="card" />
                  </div>
                  <div className="p-2 space-y-0.5">
                    <p className="text-xs font-medium truncate">{outfit.name}</p>
                    <p className="text-[11px] text-ink/40">{validCount}件</p>
                    <p className={`text-[11px] ${summary.hasToday ? "text-denim font-medium" : "text-ink/30"}`}>
                      {summary.label}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 推荐搭配单品 */}
      <div>
        <p className="text-xs font-medium text-ink/40 mb-2">推荐搭配单品</p>
        {pairingItems.length === 0 ? (
          <div className="rounded-2xl bg-mist/50 p-6 text-center">
            <p className="text-sm text-ink/40">衣橱数据还不够</p>
            <p className="text-xs text-ink/30 mt-1">添加更多衣物或创建更多套装后，这里会显示更准确的搭配建议。</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pairingItems.map((r) => (
              <div key={r.item.id} className="flex items-center gap-3 rounded-xl bg-milk-darker/30 px-3 py-2.5">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-milk-darker/40">
                  {r.item.thumbnailDataUrl ? (
                    <img src={r.item.thumbnailDataUrl} alt={r.item.name} className="h-full w-full object-contain" />
                  ) : (
                    <div className="grid h-full place-items-center text-ink/25">
                      <Shirt size={16} />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate flex items-center gap-1.5">
                    {r.item.name}
                    {r.availabilityHint && (
                      <span className="shrink-0 text-[10px] font-normal text-clay bg-clay/8 rounded-full px-1.5 py-0.5">{r.availabilityHint}</span>
                    )}
                  </p>
                  <p className="text-[11px] text-ink/40 mt-0.5">{r.reasons.join(" · ")}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MoveLocationSheet                                                  */
/* ------------------------------------------------------------------ */

function MoveLocationSheet({
  locations, currentLocationId, onMove, onClose,
}: {
  locations: ClosetLocation[];
  currentLocationId: string;
  onMove: (locationId: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(currentLocationId);

  return (
    // v0.9.49-dev auto-fix: z-50 与项目 memory 建议的 popover:45 + sheet:50 一致, 但与 lightbox:80 距离太近;
    // 提到 z-55, 介于 popover (45) 与 lightbox (80) 之间, 避免 lightbox 全屏时弹层仍可见。
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/30" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-3">移动衣物</h3>
        <p className="text-xs text-ink/40 mb-3">选择要移动到的衣橱</p>
        <div className="space-y-1">
          {locations.map((loc) => (
            <button
              key={loc.id}
              type="button"
              onClick={() => setSelected(loc.id)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                selected === loc.id ? "bg-denim/10 text-denim font-semibold" : "text-ink/70 hover:bg-mist"
              }`}
            >
              {selected === loc.id && <Check size={14} />}
              <span className={selected !== loc.id ? "ml-[22px]" : ""}>{loc.name}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onClose}
            className="flex-1 rounded-xl border border-ink/10 py-2.5 text-sm font-semibold text-ink/60 hover:bg-mist transition-colors"
          >取消</button>
          <button type="button" onClick={() => onMove(selected)}
            className="flex-1 rounded-xl bg-denim py-2.5 text-sm font-semibold text-white hover:bg-denim/90 transition-colors"
          >移动</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  DeleteConfirmDialog                                                */
/* ------------------------------------------------------------------ */

function DeleteConfirmDialog({
  onDelete,
  onCancel,
  submitting,
  errorMessage,
}: {
  onDelete: () => void;
  onCancel: () => void;
  submitting: boolean;
  errorMessage: string | null;
}) {
  return (
    // v0.9.49-dev auto-fix: z-50 与 MoveLocationSheet 一致, 同时打开会 stacking 错乱;
    // 提到 z-60, 高于 moveSheet (55), 表达 "删除" 是更高优先级确认。
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-4" onClick={submitting ? undefined : onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold">删除这件衣物？</h3>
        <p className="text-xs text-ink/45 mt-2">
          删除后无法在衣橱中查看这件衣物。如果它出现在套装中，也会从相关套装中移除。
        </p>
        {errorMessage ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            删除失败：{errorMessage}
          </p>
        ) : null}
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCancel} disabled={submitting}
            className="flex-1 rounded-xl border border-ink/10 py-2.5 text-sm font-semibold text-ink/60 hover:bg-mist transition-colors disabled:opacity-45"
          >取消</button>
          <button type="button" onClick={onDelete} disabled={submitting}
            className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-60"
          >{submitting ? "删除中..." : "删除"}</button>
        </div>
      </div>
    </div>
  );
}
