"use client";

import { Shirt } from "lucide-react";
import type { SavedOutfit, WardrobeItem } from "@/lib/types";
import { getOutfitCover, getCollageImageAssets } from "@/lib/outfit-cover";
import { OnlineAssetImage } from "@/components/online/online-asset-image";

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

  const content = (() => {
    switch (cover.mode) {
      case "preview":
      case "real_photo":
      case "source_photo":
      case "fallback":
        return cover.asset ? (
          <OnlineAssetImage asset={cover.asset} variant="thumbnail" alt={outfit.name} className="h-full w-full" imageClassName={isContain ? "object-contain" : "object-cover"} />
        ) : (
          <EmptyCover />
        );

      case "auto_collage": {
        const assets = getCollageImageAssets(outfit, items);
        if (assets.length === 0) return <EmptyCover />;
        return <CollageGrid assets={assets} />;
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
function CollageGrid({ assets }: { assets: import("@/lib/types").ImageAssetReference[] }) {
  if (assets.length === 1) {
    return (
      <div className="grid h-full w-full place-items-center bg-milk-darker/30 p-2">
        <OnlineAssetImage asset={assets[0]} variant="thumbnail" alt="" className="h-full w-full" />
      </div>
    );
  }

  if (assets.length === 2) {
    return (
      <div className="grid h-full w-full grid-cols-2 bg-milk-darker/30">
        {assets.map((asset, i) => (
          <div key={i} className="overflow-hidden">
            <OnlineAssetImage asset={asset} variant="thumbnail" alt="" className="h-full w-full" imageClassName="object-cover" />
          </div>
        ))}
      </div>
    );
  }

  if (assets.length === 3) {
    return (
      <div className="grid h-full w-full grid-rows-2 bg-milk-darker/30">
        <div className="overflow-hidden border-b border-white/50">
          <OnlineAssetImage asset={assets[0]} variant="thumbnail" alt="" className="h-full w-full" imageClassName="object-cover" />
        </div>
        <div className="grid grid-cols-2 overflow-hidden">
          {[assets[1], assets[2]].map((asset, i) => (
            <div key={i} className={`overflow-hidden ${i === 0 ? "border-r border-white/50" : ""}`}>
              <OnlineAssetImage asset={asset} variant="thumbnail" alt="" className="h-full w-full" imageClassName="object-cover" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 4+ items: 四宫格
  return (
    <div className="grid h-full w-full grid-cols-2 grid-rows-2 bg-milk-darker/30">
      {assets.slice(0, 4).map((asset, i) => (
        <div
          key={i}
          className={`overflow-hidden ${
            i === 0 ? "border-b border-r border-white/50" :
            i === 1 ? "border-b border-white/50" :
            i === 2 ? "border-r border-white/50" : ""
          }`}
        >
          <OnlineAssetImage asset={asset} variant="thumbnail" alt="" className="h-full w-full" imageClassName="object-cover" />
        </div>
      ))}
    </div>
  );
}
