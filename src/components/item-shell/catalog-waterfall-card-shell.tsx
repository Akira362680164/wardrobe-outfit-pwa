"use client";

import type { ReactElement, ReactNode } from "react";
import { motion } from "motion/react";
import { spring } from "@/lib/motion-tokens";

export interface CatalogWaterfallCardShellProps {
  media: ReactNode;
  title: ReactNode;
  meta: ReactNode;
  summary: ReactNode;

  selected?: boolean;
  disableTap?: boolean;

  onClick: () => void;
  onContextMenu?: (event: React.MouseEvent<HTMLElement>) => void;

  ariaLabel: string;
}

export function CatalogWaterfallCardShell({
  media,
  title,
  meta,
  summary,
  selected = false,
  disableTap = false,
  onClick,
  onContextMenu,
  ariaLabel,
}: CatalogWaterfallCardShellProps): ReactElement {
  return (
    <motion.button
      type="button"
      aria-label={ariaLabel}
      whileTap={disableTap ? undefined : { scale: 0.97 }}
      transition={spring.snappy}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`relative flex h-[304px] min-w-0 flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-none ${
        selected ? "border-denim ring-2 ring-denim/30" : "border-ink/8"
      }`}
    >
      <div className="relative h-[210px] shrink-0 overflow-hidden bg-mist">
        {media}
      </div>
      <div className="flex h-[94px] min-w-0 shrink-0 flex-col gap-1 overflow-hidden p-3">
        <div className="truncate text-sm font-semibold text-ink">{title}</div>
        <div className="truncate text-xs text-ink/54">{meta}</div>
        <div className="truncate text-xs text-ink/38">{summary}</div>
      </div>
    </motion.button>
  );
}
