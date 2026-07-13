"use client";

import type { ReactElement, ReactNode } from "react";
import { AppPressable } from "@/components/motion-common";
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
    <AppPressable
      type="button"
      feedback="card"
      pressDisabled={selectionMode}
      aria-label={ariaLabel}
      aria-pressed={selected || undefined}
      data-parity-id="parity.app.app.src.components.item.shell.catalog.waterfall.card.shell.f30d27758f" onClick={handleClick}
      onContextMenu={handleContextMenu}
      className={`ui-card relative flex h-[304px] min-w-0 flex-col overflow-hidden text-left shadow-none select-none touch-manipulation [-webkit-touch-callout:none] ${
        selected ? "border-denim ring-2 ring-denim/30" : "border-ink/8"
      }`}
    >
      <div className="ui-inner-card relative mx-3 mt-3 h-[194px] w-auto shrink-0 overflow-hidden">
        {media}
        {selected && <CatalogSelectionCheck />}
      </div>
      <div className="flex h-[97px] min-w-0 shrink-0 flex-col gap-1 overflow-hidden p-3">
        <div className="truncate text-sm font-semibold text-ink">{title}</div>
        <div className="truncate text-xs text-ink/54">{meta}</div>
        <div className="truncate text-xs text-ink/38">{summary}</div>
      </div>
    </AppPressable>
  );
}
