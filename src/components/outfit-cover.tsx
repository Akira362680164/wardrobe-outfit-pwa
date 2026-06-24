"use client";

import { Shirt } from "lucide-react";
import type { SavedOutfit, WardrobeItem } from "@/lib/types";
import { getOutfitCover, getCollageImageUrls } from "@/lib/outfit-cover";

interface OutfitCoverProps {
  outfit: SavedOutfit;
  items: WardrobeItem[];
  size?: "card" | "detail";
  className?: string;
  onClick?: () => void;
}

/**
 * 套装封面组件。
 * - card: 卡片封面 1:1, object-cover
 * - detail: 详情主图, object-contain
 * - auto_collage: 四宫格 / 多宫格缩略图
 */
export function OutfitCover({ outfit, items, size = "card", className = "", onClick }: OutfitCoverProps) {
  const cover = getOutfitCover(outfit, items);
  const isContain = size === "detail";

  const renderImage = (src: string, alt: string, extraClass = "") => (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={`h-full w-full ${isContain ? "object-contain" : "object-cover"} ${extraClass}`}
    />
  );

  const content = (() => {
    switch (cover.mode) {
      case "preview":
      case "real_photo":
      case "source_photo":
      case "fallback":
        return cover.imageDataUrl ? (
          renderImage(cover.imageDataUrl, outfit.name)
        ) : (
          <EmptyCover />
        );

      case "auto_collage": {
        const urls = getCollageImageUrls(outfit, items);
        if (urls.length === 0) return <EmptyCover />;
        return <CollageGrid urls={urls} />;
      }

      case "empty":
      default:
        return <EmptyCover />;
    }
  })();

  const wrapper = (
    <div
      className={`overflow-hidden ${size === "card" ? "aspect-square" : ""} ${className}`}
    >
      {content}
    </div>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="w-full">
        {wrapper}
      </button>
    );
  }

  return wrapper;
}

function EmptyCover() {
  return (
    <div className="grid h-full w-full place-items-center text-ink/25 bg-milk-darker/40">
      <Shirt size={40} />
    </div>
  );
}

/**
 * 多宫格缩略图。
 * 1 件: 单图居中
 * 2 件: 左右两格 (2×1 拉伸)
 * 3 件: 上方 1 件, 下方 2 件
 * 4+ 件: 四宫格取前 4 件
 */
function CollageGrid({ urls }: { urls: string[] }) {
  if (urls.length === 1) {
    return (
      <div className="grid h-full w-full place-items-center bg-milk-darker/30 p-2">
        <img src={urls[0]} alt="" loading="lazy" decoding="async" className="max-h-full max-w-full object-contain" />
      </div>
    );
  }

  if (urls.length === 2) {
    return (
      <div className="grid h-full w-full grid-cols-2 bg-milk-darker/30">
        {urls.map((url, i) => (
          <div key={i} className="overflow-hidden">
            <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          </div>
        ))}
      </div>
    );
  }

  if (urls.length === 3) {
    return (
      <div className="grid h-full w-full grid-rows-2 bg-milk-darker/30">
        <div className="overflow-hidden border-b border-white/50">
          <img src={urls[0]} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        </div>
        <div className="grid grid-cols-2 overflow-hidden">
          {[urls[1], urls[2]].map((url, i) => (
            <div key={i} className={`overflow-hidden ${i === 0 ? "border-r border-white/50" : ""}`}>
              <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 4+ items: 四宫格
  return (
    <div className="grid h-full w-full grid-cols-2 grid-rows-2 bg-milk-darker/30">
      {urls.slice(0, 4).map((url, i) => (
        <div
          key={i}
          className={`overflow-hidden ${
            i === 0 ? "border-b border-r border-white/50" :
            i === 1 ? "border-b border-white/50" :
            i === 2 ? "border-r border-white/50" : ""
          }`}
        >
          <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        </div>
      ))}
    </div>
  );
}
