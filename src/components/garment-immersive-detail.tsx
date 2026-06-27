"use client";

/**
 * GarmentImmersiveDetail
 * --------------------------------------------------------------
 * 沉浸式衣物详情 / 录入确认页的纯展示壳。
 *
 * 职责:
 * - 顶部轻量操作区 (返回 + 序号 + topActions slot)
 * - 中部大图 (浅雾面背景, 可选 crop 角标)
 * - 下部白色 metadata 面板 (衣物名 + 类别/季节/状态 + 圆形色块 + 摘要信息)
 *
 * 边界:
 * - 不直接读写 Dexie / MiniMax / prompt
 * - 浮动确认条由父级在组件外自行渲染 (z-40, 避开 5 tab)
 * - 属性编辑表单 (detailEditor) 由父级插入, 组件本身不耦合表单
 * - 颜色映射仅用于色块渲染, 不替代中文颜色名 (文字 + 色块都显示)
 */

import { useEffect, useMemo } from "react";
import { ChevronLeft, Crop } from "lucide-react";
import { SwipeImageCarousel, type SwipeAddSlide, type SwipeImageSlide, type SwipeSlide } from "@/components/swipe-image-carousel";
import { clampCarouselIndex } from "@/lib/carousel-logic";
import type { GarmentImageEntry } from "@/lib/garment-image-source";

/* ------------------------------------------------------------------ */
/*  颜色色块映射                                                        */
/*  v1.1.27: 不再本地维护 COLOR_SWATCHES，统一从 @/lib/color-catalog 读取。 */
/* ------------------------------------------------------------------ */
import { COLOR_SWATCHES, type SystemColor } from "@/lib/color-catalog";

/* ------------------------------------------------------------------ */
/*  GarmentColorSwatches – 颜色文字 + 圆形色块                            */
/* ------------------------------------------------------------------ */

export function GarmentColorSwatches({
  colors,
  variant = "primary",
}: {
  colors: string[];
  variant?: "primary" | "secondary";
}) {
  if (!colors || colors.length === 0) return null;
  const isSecondary = variant === "secondary";
  return (
    <div className="flex items-center gap-1.5 flex-wrap" aria-label={isSecondary ? "配色" : "主色"}>
      {colors.map((name) => {
        const sw = COLOR_SWATCHES[name as SystemColor] ?? { bg: "#cbd5e1" };
        const sizeClass = isSecondary ? "h-3.5 w-3.5 opacity-80" : "h-4 w-4";
        return (
          <span
            key={`${variant}-${name}`}
            title={name}
            aria-label={`${isSecondary ? "配" : "主"}色：${name}`}
            className="inline-flex h-6 items-center gap-1 rounded-full bg-mist px-1.5 pr-2 text-[11px] font-medium text-ink/62"
          >
            <span
              className={`inline-block shrink-0 rounded-full ${sizeClass}`}
              style={{
                background: sw.bg,
                border: sw.border ? `1px solid ${sw.border}` : undefined,
              }}
            />
            <span>{name}</span>
          </span>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  GarmentDetailModel – 纯展示模型, 不耦合 WardrobeItem 字段          */
/* ------------------------------------------------------------------ */

export interface GarmentDetailModel {
  name: string;
  imageDataUrl?: string;
  sourceImageDataUrl?: string;
  categoryLabel: string;
  seasonLabels: string[];
  statusLabel?: string;
  locationLabel?: string;
  primaryColors: string[];
  secondaryColors: string[];
  /** 例如 "识别置信度 87%" / "待确认" */
  confidenceLabel?: string;
  needsReview?: boolean;
  notes?: string;
  /** v0.9.22: 版型倾向 (男装/女装/中性/未判断) */
  fitGenderLabel?: string;
  /** v0.9.22: AI 识别给出的版型判断理由 */
  fitNotes?: string;
}

/* ------------------------------------------------------------------ */
/*  GarmentMetadataPanel – 白色 metadata 面板                            */
/* ------------------------------------------------------------------ */

export function GarmentMetadataPanel({
  item,
  detailEditor,
}: {
  item: GarmentDetailModel;
  detailEditor?: React.ReactNode;
}) {
  const metaParts: string[] = [];
  if (item.categoryLabel) metaParts.push(item.categoryLabel);
  if (item.seasonLabels.length > 0) metaParts.push(item.seasonLabels.join("/"));
  if (item.statusLabel) metaParts.push(item.statusLabel);
  if (item.locationLabel) metaParts.push(item.locationLabel);

  return (
    <div className="rounded-2xl bg-white p-4 shadow-soft">
      <h2 className="break-words text-lg font-semibold leading-snug">{item.name}</h2>
      {metaParts.length > 0 ? (
        <p className="mt-0.5 break-words text-xs text-ink/55">{metaParts.join(" · ")}</p>
      ) : null}

      <div className="mt-3 flex items-start gap-4 flex-wrap">
        {item.primaryColors.length > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-ink/50">主色</span>
            <GarmentColorSwatches colors={item.primaryColors} variant="primary" />
          </div>
        ) : null}
        {item.secondaryColors.length > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-ink/50">配色</span>
            <GarmentColorSwatches colors={item.secondaryColors} variant="secondary" />
          </div>
        ) : null}
      </div>

      {(item.confidenceLabel || item.needsReview) ? (
        <div className="mt-3 flex items-center gap-2 flex-wrap text-[11px] text-ink/55">
          {item.confidenceLabel ? <span>{item.confidenceLabel}</span> : null}
          {item.needsReview ? (
            <span className="rounded-md bg-clay/12 px-1.5 py-0.5 text-[10px] font-medium text-clay">待确认</span>
          ) : null}
        </div>
      ) : null}

      {item.notes ? (
        <p className="mt-3 break-words text-xs text-ink/65 leading-relaxed">{item.notes}</p>
      ) : null}

      {detailEditor ? <div className="mt-3 border-t border-ink/8 pt-3">{detailEditor}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  GarmentImmersiveDetail – 沉浸式详情壳                                */
/* ------------------------------------------------------------------ */

export interface GarmentImmersiveDetailProps {
 item: GarmentDetailModel;
 /**顶部居中或靠右的序号文字, 例如 "1 /3" 或 "第2套 ·1 /4 件" */
 counterText?: string;
 onBack: () => void;
 /** 点击图片全屏查看 (图片整块可点, 与 onCrop互不冲突) */
 onOpenImage?: () => void;
 /** 图片右上角"重新裁切"按钮 */
 onCrop?: () => void;
 /**顶部右上角自定义操作区 (删除/编辑/重拍/换图 等) */
 topActions?: React.ReactNode;
 /** v0.9.45-dev 详情页 2.0: 顶部导航栏中间内容 (穿着摘要) */
 headerCenter?: React.ReactNode;
 /** v0.9.45-dev 详情页 2.0: 缩略图胶片栏, 放在大图下方 */
 filmstrip?: React.ReactNode;
 /** v0.9.45-dev 详情页 2.0: 快捷操作按钮行, 放在胶片栏下方 */
 quickActions?: React.ReactNode;
 /** v0.9.45-dev 详情页 2.0: AI 建议卡, 放在快捷操作下方, 主信息上方 */
 aiAdvice?: React.ReactNode;
 /**详情编辑区,插入到 metadata面板下方 */
 detailEditor?: React.ReactNode;
 /** 自定义外层 className,用来控制 padding / animated page 等 */
 className?: string;
 /** 默认沿用历史方图；衣物详情页可切成竖版。 */
 imageLayout?: "square" | "portrait";
 /** v0.9.32-dev: 主图之后的图片列表 (主图本身来自 item.imageDataUrl,索引 0)。
  *  通常由父级 `deriveGarmentImageList(item, outfits).slice(1)` 派生:
  *  - 来源 reference_outfit:手动添加的参考穿搭图 (renderKind="image")
  *  - 来源 saved_outfit: 关联套装引用 (renderKind="outfit"), 在 carousel 中过滤
  *  - 去重 + 按 createdAt 排序
  *  空数组/不传时不绑定横滑手势。
  */
 extraImages?: GarmentImageEntry[];
 /** v0.9.32-dev: 当前图片索引(主图为0)。受控,父级持有。 */
 currentImageIndex?: number;
 /** v0.9.32-dev: 图片索引变更回调(父级收到后 setState)。 */
 onCurrentImageIndexChange?: (next: number) => void;
 /** v0.9.32-dev: 点击主图时打开大图回调 (用于区分主图 vs 参考图)。 */
 onOpenImageAt?: (index: number) => void;
/** v0.9.32-dev:裁切当前显示的图片 (主图或参考图)。 */
  onCropAt?: (index: number) => void;
  /** v0.9.34-dev: 右滑到最后一张参考图后, 再右滑显示"添加参考图"占位卡。
   *  点击占位卡触发该回调 (父级通常会打开相册选择器)。
   *  不传则不显示占位卡 (行为同 v0.9.33-dev)。
   */
  onRequestAddReference?: () => void;
}

export function GarmentImmersiveDetail({
 item,
 counterText,
 onBack,
 onOpenImage,
 onCrop,
 topActions,
 headerCenter,
 filmstrip,
 quickActions,
 aiAdvice,
 detailEditor,
 className = "",
 imageLayout = "square",
extraImages,
  currentImageIndex =0,
  onCurrentImageIndexChange,
  onOpenImageAt,
  onCropAt,
  onRequestAddReference,
}: GarmentImmersiveDetailProps) {
  // ================================================================
  // v0.9.38-dev P0 §1.5 / §3: 详情页 slide/index 模型重整
  // ------------------------------------------------------------
  // 旧实现 (v0.9.37-dev 及更早) 用 6+ 派生变量 (extraCount / hasAddCard /
  // addCardIndex / safeIndex / isMainImage / isAddCard) 把"真实图索引"和
  // "add slide 索引"混在一起, 容易导致:
  // - 顶部角标乱 (isAddCard vs isMainImage 各种特判)
  // - onCropAt / onOpenImageAt 在 add slide 上越界
  // - 新增/删除参考图后 index 不 clamp
  // - add slide 视觉混乱
  //
  // 新实现: 用 discriminated union `SwipeSlide` (SwipeImageCarousel 已升级
  // 到 v0.9.38-dev), 父级只需要派生 slides 数组 + safeSlide, 所有 onClick
  // / 角标 / 裁切按钮都基于 slide.kind, 真实图 / 参考图 / add slide 互不
  // 干扰, 边界条件统一通过 index clamp 解决。
  // ================================================================
  const hasAddCard = typeof onRequestAddReference === "function";
  const hasExtra = Array.isArray(extraImages) ? extraImages.length > 0 : false;

  // 派生 slides 数组: [主图, ...extraImages, ?addSlide]
  // v0.9.43-dev 批次 6: 填 thumbnailSrc / displaySrc 双图源 (批次 6 §2 规则)
  // - 主图: thumbnailSrc = entry.cardImageDataUrl, displaySrc = entry.displayImageDataUrl ?? imageDataUrl
  // - 参考图: thumbnailSrc = entry.cardImageDataUrl, displaySrc = entry.displayImageDataUrl
  // - sourceSrc: 主图 = item.sourceImageDataUrl, 参考图 = entry.sourceImageDataUrl
  const slides: SwipeSlide[] = useMemo(() => {
    const main: SwipeImageSlide = {
      kind: "image",
      id: "main",
      imageDataUrl: item.imageDataUrl || item.sourceImageDataUrl || "",
      thumbnailSrc: (item as { thumbnailDataUrl?: string }).thumbnailDataUrl || item.imageDataUrl || item.sourceImageDataUrl || "",
      displaySrc: item.imageDataUrl || item.sourceImageDataUrl || "",
      sourceSrc: item.sourceImageDataUrl || item.imageDataUrl || "",
      alt: item.name,
      badge: "主图",
      badgeClassName: "bg-denim",
    };
    const extras: SwipeImageSlide[] = (extraImages ?? [])
      .filter((entry) => entry.renderKind !== "outfit")
      .map((entry, i) => {
      const isSavedOutfit = entry.source === "saved_outfit";
      return {
        kind: "image",
        id: entry.refId || `entry-${i}`,
        imageDataUrl: entry.imageDataUrl,
        thumbnailSrc: entry.cardImageDataUrl,
        displaySrc: entry.displayImageDataUrl,
        sourceSrc: entry.sourceImageDataUrl || entry.imageDataUrl,
        alt: `参考穿搭 ${i + 1}`,
        badge: isSavedOutfit ? "套装" : "参考",
        badgeClassName: isSavedOutfit ? "bg-moss" : "bg-clay",
      };
    });
    const base: SwipeSlide[] = [main, ...extras];
    if (hasAddCard) {
      const add: SwipeAddSlide = {
        kind: "add",
        id: "add-reference",
        title: "添加参考穿搭图",
        description: "记录这件衣物的搭配灵感",
        actionText: "从相册选择",
      };
      base.push(add);
    }
    return base;
  }, [item.imageDataUrl, item.sourceImageDataUrl, item.name, extraImages, hasAddCard]);

  const safeIndex = clampCarouselIndex(currentImageIndex, slides.length);
  const safeSlide = slides[safeIndex];

  useEffect(() => {
    if (currentImageIndex !== safeIndex) onCurrentImageIndexChange?.(safeIndex);
  }, [currentImageIndex, onCurrentImageIndexChange, safeIndex]);

  const indicatorText: string | null = useMemo(() => {
    if (!hasExtra && !hasAddCard) return null;
    if (slides.length <= 1 || !safeSlide) return null;
    if (safeSlide.kind === "add") return "添加参考图";
    if (safeSlide.id === "main") return "主图";

    const sameKindImageSlides = slides.filter((slide) =>
      slide.kind === "image"
      && slide.id !== "main"
      && slide.badge === safeSlide.badge,
    );
    const sameKindIndex = sameKindImageSlides.findIndex((slide) => slide.id === safeSlide.id);
    const label = safeSlide.badge === "套装" ? "套装" : "参考";
    return sameKindImageSlides.length > 1
      ? `${label} ${sameKindIndex + 1}/${sameKindImageSlides.length}`
      : label;
  }, [hasExtra, hasAddCard, slides, safeSlide]);

  // v0.9.44-dev 回归修复 2: 图片容器高度固定, 避免横滑时不同比例的图片导致
  // 下方 metadata 面板上下跳。每张图的 aspectRatio 变化不再影响外层 div 高度。
  // height: clamp(300px, 52dvh, 500px) 兼顾小屏顶部栏+底部 tab 空间。
  const imageShellStyle: React.CSSProperties = {
    height: "clamp(300px, 52dvh, 500px)",
    maxWidth: imageLayout === "portrait" ? "340px" : "min(100%, 400px)",
  };

  return (
 <div className={`mx-auto grid w-full max-w-md gap-3 ${className}`}>
 {/*顶部轻量操作区 */}
 <div className="flex items-center gap-2 px-1">
 <button
 type="button"
 onClick={onBack}
 aria-label="返回"
 className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-mist text-ink hover:bg-ink/10 transition-colors"
 >
 <ChevronLeft size={17} aria-hidden="true" />
 </button>
 {/* v0.9.45-dev 详情页 2.0: headerCenter 优先; 否则回退旧 counterText / indicatorText */}
 {headerCenter ? (
   <div className="flex-1 min-w-0 text-center">{headerCenter}</div>
 ) : (
   <>
   {counterText ? (
   <span className="ml-1 text-xs text-ink/55 tabular-nums">{counterText}</span>
   ) : null}
   {indicatorText ? (
   <span className="ml-1 min-w-0 truncate text-xs text-ink/55 tabular-nums whitespace-nowrap">
   {indicatorText}
   </span>
   ) : null}
   </>
 )}
 <div className="ml-auto flex shrink-0 items-center gap-2">
 {topActions}
 </div>
 </div>

 {/* 中部大图 */}
 <div
   className="relative mx-auto w-full overflow-hidden rounded-2xl bg-mist select-none"
   style={imageShellStyle}
 >
   <SwipeImageCarousel
     slides={slides}
     index={safeIndex}
     onIndexChange={(next) => {
       onCurrentImageIndexChange?.(next);
     }}
     onImageClick={() => {
       if (onOpenImageAt) onOpenImageAt(safeIndex);
       else if (onOpenImage) onOpenImage();
     }}
     onAddClick={() => {
       onRequestAddReference?.();
     }}
     className="absolute inset-0"
     imageClassName="object-contain"
     showDots={slides.length > 2 || (slides.length === 2 && hasAddCard)}
     showCounter={false}
     ariaLabel="衣物图片组"
   />

  {/*重新裁切按钮:作用于当前显示的图片。add slide 不显示 (无可裁切对象)。 */}
  {(onCrop || onCropAt) && safeSlide?.kind === "image" ? (
  <button
  type="button"
  onClick={() => {
  if (onCropAt) onCropAt(safeIndex);
  else if (onCrop) onCrop();
  }}
  className="absolute bottom-3 right-3 inline-flex min-h-[36px] items-center gap-1 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white shadow-sm backdrop-blur-sm hover:bg-black/85 active:scale-95 transition-all"
  title="基于原图重新裁切"
  aria-label="重新裁切"
  >
  <Crop size={13} strokeWidth={2.2} aria-hidden="true" />
  重新裁切
  </button>
  ) : null}
 </div>

 {/* v0.9.45-dev 详情页 2.0: 缩略图胶片栏 */}
 {filmstrip}

 {/* v0.9.45-dev 详情页 2.0: 快捷操作按钮行 */}
 {quickActions}

 {/* v0.9.45-dev 详情页 2.0: AI 建议卡 */}
 {aiAdvice}

 {/* 下部白色 metadata面板 */}
 <GarmentMetadataPanel item={item} detailEditor={detailEditor} />
    </div>
  );
}
