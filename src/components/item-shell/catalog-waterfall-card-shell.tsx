"use client";

import type { ReactElement, ReactNode } from "react";
import { motion } from "motion/react";
import { spring } from "@/lib/motion-tokens";
import { CatalogSelectionCheck } from "@/components/catalog-selection/catalog-selection-check";

export interface CatalogWaterfallCardShellProps {
  media: ReactNode;
  title: ReactNode;
  meta: ReactNode;
  summary: ReactNode;

  selected?: boolean;
  selectionMode?: boolean;

  onOpen: () => void;
  onToggleSelection?: () => void;

  ariaLabel: string;
}

export function CatalogWaterfallCardShell({
  media,
  title,
  meta,
  summary,
  selected = false,
  selectionMode = false,
  onOpen,
  onToggleSelection,
  ariaLabel,
}: CatalogWaterfallCardShellProps): ReactElement {
  function handleClick() {
    if (selectionMode && onToggleSelection) {
      onToggleSelection();
      return;
    }
    onOpen();
  }

  function handleContextMenu(event: React.MouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    onToggleSelection?.();
  }

  return (
    <motion.button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={selected || undefined}
      whileTap={{ scale: 0.97 }}
      transition={spring.snappy}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      className={`relative flex h-[304px] min-w-0 flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-none select-none touch-manipulation [-webkit-touch-callout:none] ${
        selected ? "border-denim ring-2 ring-denim/30" : "border-ink/8"
      }`}
    >
      <div className="relative h-[210px] shrink-0 overflow-hidden bg-mist">
        {media}
        {selected && <CatalogSelectionCheck />}
      </div>
      <div className="flex h-[94px] min-w-0 shrink-0 flex-col gap-1 overflow-hidden p-3">
        <div className="truncate text-sm font-semibold text-ink">{title}</div>
        <div className="truncate text-xs text-ink/54">{meta}</div>
        <div className="truncate text-xs text-ink/38">{summary}</div>
      </div>
    </motion.button>
  );
}
