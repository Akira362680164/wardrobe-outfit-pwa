"use client";

/**
 * AppSubPageTopBar — 统一二级页顶部栏
 * 用于单品详情、套装详情、月历页、已买单品页、计划详情页、打包清单页。
 * 总高度 56px（h-14，与衣橱首页按钮行 token 一致），左右列 48px，
 * 返回按钮 / 更多按钮 40×40 圆角矩形视觉 + 48×48 点击热区。
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
    <div className={`app-glass-top grid ${rightAction ? "grid-cols-[48px_1fr_auto]" : "grid-cols-[48px_1fr_48px]"} items-stretch min-h-14 px-2`}>
      {/* Left: back button area (48px wide, includes px-4 indent) — 视觉圆顶对齐到行顶，与首页"全部衣橱"按钮顶部一致 */}
      <div className="flex items-start justify-start">
        <button
          type="button"
          onClick={onBack}
          aria-label="返回"
          className="grid h-12 w-12 place-items-center -ml-1"
        >
          <span className="grid h-10 w-10 place-items-center ui-control-radius bg-transparent text-ink/75 active:scale-95 transition">
            <ChevronLeft size={20} strokeWidth={2.6} />
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
            className="grid h-12 w-12 place-items-center -mr-1"
          >
            <span className="grid h-10 w-10 place-items-center ui-control-radius bg-transparent text-ink/55 active:scale-95 transition">
              <MoreHorizontal size={20} strokeWidth={2.6} />
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
