"use client";

/**
 * AppSubPageTopBar — 统一二级页顶部栏
 * 用于单品详情、套装详情、月历页、已买单品页、计划详情页、打包清单页。
 * 总高度 56px（h-14，与衣橱首页按钮行 token 一致），左右列 48px，
 * 返回按钮 / 更多按钮 40×40 视觉圆 + 48×48 点击热区。
 */
import { ChevronLeft, MoreHorizontal } from "lucide-react";
import type { RefObject } from "react";

export interface AppSubPageTopBarProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  rightAction?: React.ReactNode;
  onMore?: () => void;
  moreButtonRef?: RefObject<HTMLButtonElement | null>;
}

export function AppSubPageTopBar({
  title,
  subtitle,
  onBack,
  rightAction,
  onMore,
  moreButtonRef,
}: AppSubPageTopBarProps) {
  return (
    <div className={`grid ${rightAction ? "grid-cols-[48px_1fr_auto]" : "grid-cols-[48px_1fr_48px]"} items-stretch min-h-14 border-b border-ink/5 px-4`}>
      {/* Left: back button area (48px wide, includes px-4 indent) — 视觉圆顶对齐到行顶，与首页"全部衣橱"按钮顶部一致 */}
      <div className="flex items-start justify-start">
        <button
          type="button"
          onClick={onBack}
          aria-label="返回"
          className="grid h-10 w-10 place-items-center mt-0"
        >
          <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-ink/70 shadow-soft active:scale-95 hover:bg-ink/5 transition">
            <ChevronLeft size={18} />
          </span>
        </button>
      </div>

      {/* Center: title + optional subtitle */}
      <div className="flex flex-col items-center justify-center min-w-0">
        <span className="text-[16px] font-bold text-ink truncate max-w-full">
          {title}
        </span>
        {subtitle ? (
          <span className="text-[11px] text-ink/50 truncate max-w-full mt-0.5">
            {subtitle}
          </span>
        ) : null}
      </div>

      {/* Right: action or more button (48px wide) — 同左，顶对齐 */}
      <div className="flex items-start justify-end">
        {rightAction ? (
          rightAction
        ) : onMore ? (
          <button
            ref={moreButtonRef}
            type="button"
            onClick={onMore}
            aria-label="更多操作"
            className="grid h-10 w-10 place-items-center"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full text-ink/40 hover:bg-mist transition">
              <MoreHorizontal size={18} />
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
