"use client";

import type { ReactNode } from "react";
import type { RefObject } from "react";
import { ChevronLeft, Loader2, MoreHorizontal, Plus, RefreshCw, Sparkles } from "lucide-react";
import { AppSubPageTopBar, type AppSubPageTopBarProps } from "@/components/app-sub-page-top-bar";
import { SwipeImageCarousel, type SwipeImageSlide } from "@/components/swipe-image-carousel";
import { DetailSectionCard } from "@/components/item-shell/detail-section-card";

export type DetailSlideKind = "garment_main" | "garment_reference" | "outfit_cover" | "outfit_real" | "wishlist_product";

export interface DetailShellSlide {
  id: string;
  label: string;
  alt: string;
  imageDataUrl?: string;
  thumbnailDataUrl?: string;
  renderContent?: ReactNode;
}

export interface DetailFilmstripItem {
  id: string;
  label: string;
  imageDataUrl?: string;
  thumbnailDataUrl?: string;
  renderContent?: ReactNode;
}

export interface DetailQuickAction {
  key: string;
  label: string;
  icon?: ReactNode;
  tone: "primary" | "success" | "neutral" | "danger";
  onClick: () => void;
  disabled?: boolean;
}

export interface DetailTabItem<T extends string> {
  key: T;
  label: string;
}

export function buildDetailMetaText(parts: Array<string | null | undefined | false>): string {
  return parts
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(" · ");
}

export function getDetailPageLabel(currentIndex: number, total: number): string {
  return total > 1 ? `${currentIndex + 1} / ${total}` : "";
}

export function shouldRenderDetailFilmstrip(kind: "garment" | "outfit" | "wishlist"): boolean {
  return kind !== "wishlist";
}

export function getDetailSlideLabel(kind: DetailSlideKind): string {
  switch (kind) {
    case "garment_main":
    case "outfit_cover":
      return "主图";
    case "garment_reference":
      return "灵感";
    case "outfit_real":
      return "套装示意";
    case "wishlist_product":
      return "商品图";
  }
}

export function DetailTopBar({
  title,
  onBack,
  onMore,
  moreButtonRef,
}: {
  title: string;
  onBack: () => void;
  onMore?: () => void;
  moreButtonRef?: RefObject<HTMLButtonElement | null>;
  moreOpen?: boolean;
}) {
  return (
    <AppSubPageTopBar
      title={title}
      onBack={onBack}
      onMore={onMore}
      moreButtonRef={moreButtonRef}
    />
  );
}

export function DetailHeroGallery({
  slides,
  currentIndex,
  onIndexChange,
  onExpandImage,
  bottomRightAction,
  emptyIcon,
  emptyText = "暂无图片",
}: {
  slides: DetailShellSlide[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  onExpandImage?: (image: { src: string; alt: string }) => void;
  bottomRightAction?: ReactNode;
  emptyIcon?: ReactNode;
  emptyText?: string;
}) {
  const safeIndex = Math.min(Math.max(currentIndex, 0), Math.max(slides.length - 1, 0));
  const activeSlide = slides[safeIndex];
  const imageSlides: SwipeImageSlide[] = slides.map((slide) => ({
    kind: "image",
    id: slide.id,
    imageDataUrl: slide.imageDataUrl || "",
    thumbnailSrc: slide.thumbnailDataUrl || slide.imageDataUrl || "",
    displaySrc: slide.imageDataUrl || "",
    alt: slide.alt,
  }));
  const pageLabel = getDetailPageLabel(safeIndex, slides.length);

  return (
    <div className="mt-3">
      <div
        className="relative mx-auto overflow-hidden rounded-3xl bg-mist"
        style={{ height: "clamp(300px, 52dvh, 500px)" }}
      >
        {activeSlide ? (
          activeSlide.renderContent ? (
            <button
              type="button"
              onClick={() => {
                if (activeSlide.imageDataUrl) onExpandImage?.({ src: activeSlide.imageDataUrl, alt: activeSlide.alt });
              }}
              className="h-full w-full"
            >
              {activeSlide.renderContent}
            </button>
          ) : (
            <SwipeImageCarousel
              slides={imageSlides}
              index={safeIndex}
              onIndexChange={onIndexChange}
              onImageClick={(slide) => {
                const src = slide.displaySrc || slide.imageDataUrl;
                if (src) onExpandImage?.({ src, alt: slide.alt || "" });
              }}
              className="absolute inset-0"
              imageClassName="object-contain"
              showCounter={false}
              showDots={false}
              ariaLabel="详情图片"
            />
          )
        ) : (
          <div className="grid h-full w-full place-items-center px-6 text-center text-ink/35">
            <div className="grid gap-2 place-items-center">
              {emptyIcon}
              <p className="text-sm">{emptyText}</p>
            </div>
          </div>
        )}
        {activeSlide ? (
          <span className="absolute left-3 top-3 z-10 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
            {activeSlide.label}
          </span>
        ) : null}
        {pageLabel ? (
          <span className="absolute bottom-3 left-3 z-10 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
            {pageLabel}
          </span>
        ) : null}
        {bottomRightAction ? (
          <span className="absolute bottom-3 right-3 z-10">
            {bottomRightAction}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function DetailFilmstrip({
  items,
  activeId,
  onSelect,
  addLabel,
  onAdd,
}: {
  items: DetailFilmstripItem[];
  activeId: string;
  onSelect: (id: string) => void;
  addLabel: string;
  onAdd?: () => void;
}) {
  return (
    <div className="mt-3 flex gap-2 overflow-x-auto">
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition ${
              active ? "border-denim shadow-sm" : "border-transparent opacity-60 hover:opacity-100"
            }`}
          >
            {item.renderContent ? item.renderContent : item.imageDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.thumbnailDataUrl || item.imageDataUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-mist" />
            )}
            <span className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-0.5 py-0.5 text-center text-[9px] font-semibold text-white">
              {item.label}
            </span>
          </button>
        );
      })}
      {onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border border-dashed border-ink/20 bg-mist/45 text-ink/45"
        >
          <span className="grid place-items-center gap-0.5">
            <Plus size={16} aria-hidden="true" />
            <span className="text-[9px] font-semibold">{addLabel}</span>
          </span>
        </button>
      ) : null}
    </div>
  );
}

export function DetailQuickActions({ actions, layout = "flex" }: { actions: DetailQuickAction[]; layout?: "flex" | "grid" }) {
  return (
    <div
      className={layout === "grid" ? "mt-4 grid gap-3" : "mt-4 flex items-center gap-3"}
      style={layout === "grid" ? { gridTemplateColumns: `repeat(${Math.max(actions.length, 1)}, minmax(0, 1fr))` } : undefined}
    >
      {actions.map((action) => (
        <button
          key={action.key}
          type="button"
          onClick={action.onClick}
          disabled={action.disabled}
          className={`inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold transition disabled:opacity-45 ${quickActionClass(action.tone)}`}
        >
          {action.icon ? <span className="grid h-4 w-4 shrink-0 place-items-center [&_svg]:h-4 [&_svg]:w-4">{action.icon}</span> : null}
          <span className="truncate">{action.label}</span>
        </button>
      ))}
    </div>
  );
}

function quickActionClass(tone: DetailQuickAction["tone"]): string {
  switch (tone) {
    case "primary":
      return "bg-denim text-white";
    case "success":
      return "border border-moss/30 bg-moss/12 text-moss";
    case "danger":
      return "border border-red-500/35 bg-white text-red-600";
    case "neutral":
      return "border border-ink/10 bg-white text-ink/65";
  }
}

export function DetailTitleMetaBlock({ eyebrow, title, metaParts }: { eyebrow?: React.ReactNode; title: string; metaParts: Array<string | null | undefined | false> }) {
  const metaText = buildDetailMetaText(metaParts);
  return (
    <div className="mt-4">
      {eyebrow ? <p className="text-[12px] text-clay/75">{eyebrow}</p> : null}
      <h1 className="break-words text-xl font-semibold leading-tight text-ink">{title || "未命名"}</h1>
      {metaText ? <p className="mt-1 break-words text-sm leading-relaxed text-ink/50">{metaText}</p> : null}
    </div>
  );
}

export function DetailTabs<T extends string>({
  tabs,
  activeTab,
  onChange,
}: {
  tabs: Array<DetailTabItem<T>>;
  activeTab: T;
  onChange: (tab: T) => void;
}) {
  return (
    <div className="mt-4">
      <div className="grid rounded-2xl bg-mist p-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`h-11 rounded-xl text-sm font-semibold transition ${activeTab === tab.key ? "bg-white text-ink shadow-sm" : "text-ink/40 hover:text-ink/60"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ponytail: DetailSurfaceCard kept as thin alias — outfit-list-view still imports it
export function DetailSurfaceCard({ title, children }: { title?: string; children: ReactNode }) {
  return <DetailSectionCard title={title}>{children}</DetailSectionCard>;
}

export function DetailInfoRow({ label, value }: { label: string; value?: ReactNode }) {
  const empty = value == null || value === "";
  return (
    <div className="grid grid-cols-[76px_1fr] gap-3 text-sm">
      <span className="text-xs font-medium text-ink/35">{label}</span>
      <span className="min-w-0 break-words text-ink/70">{empty ? "未填写" : value}</span>
    </div>
  );
}

export function DetailAiCard({
  title,
  summary,
  sourceLabel,
  generatedAt,
  loading,
  error,
  emptyText = "还没有生成建议",
  actionLabel,
  onAction,
}: {
  title: string;
  summary?: ReactNode;
  sourceLabel?: string;
  generatedAt?: string;
  loading?: boolean;
  error?: string;
  emptyText?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <DetailSurfaceCard>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-denim">
            <Sparkles size={14} aria-hidden="true" />
            {title}
          </p>
          <div className="mt-2 text-sm leading-relaxed text-ink/68">
            {loading ? (
              <div className="grid gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-ink/55">
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                  正在生成建议
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-mist">
                  <div className="h-full w-2/3 animate-pulse rounded-full bg-denim/55" />
                </div>
              </div>
            ) : error ? (
              <p className="text-xs text-red-500">{error}</p>
            ) : summary ? (
              summary
            ) : (
              <p className="text-xs text-ink/42">{emptyText}</p>
            )}
          </div>
          {sourceLabel || generatedAt ? (
            <p className="mt-2 text-[11px] text-ink/40">{[sourceLabel, generatedAt?.slice(0, 10)].filter(Boolean).join(" · ")}</p>
          ) : null}
        </div>
        {onAction && actionLabel ? (
          <button
            type="button"
            onClick={onAction}
            disabled={loading}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg bg-mist px-3 text-xs font-semibold text-denim disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} aria-hidden="true" />
            {actionLabel}
          </button>
        ) : null}
      </div>
    </DetailSurfaceCard>
  );
}
