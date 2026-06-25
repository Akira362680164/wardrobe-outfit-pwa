"use client";

import type { ReactElement } from "react";
import { getColorSwatchStyle } from "@/lib/catalog-card-format";

export function CategoryColorLine({
  categoryLabel,
  colors,
}: {
  categoryLabel: string;
  colors: string[];
}): ReactElement {
  const visibleColors = colors.slice(0, 3);
  const hiddenCount = Math.max(0, colors.length - visibleColors.length);

  return (
    <span className="inline-flex min-w-0 items-center gap-1 overflow-hidden truncate text-xs text-ink/54">
      <span className="shrink-0">{categoryLabel}</span>
      {visibleColors.length > 0 ? (
        <span className="shrink-0 text-ink/32">·</span>
      ) : null}
      {visibleColors.map((color, index) => {
        const swatch = getColorSwatchStyle(color);
        const swatchClassName = swatch.needsBorder
          ? "border border-ink/18"
          : "border border-ink/10";
        return (
          <span
            key={`${color}-${index}`}
            className="inline-flex min-w-0 items-center gap-1"
          >
            {index > 0 ? (
              <span className="text-ink/32">/</span>
            ) : null}
            <span
              className={`h-3 w-3 shrink-0 rounded-full ${swatchClassName}`}
              style={{ backgroundColor: swatch.backgroundColor }}
            />
            <span className="truncate">{color}</span>
          </span>
        );
      })}
      {hiddenCount > 0 ? (
        <span className="shrink-0 text-ink/42">+{hiddenCount}</span>
      ) : null}
    </span>
  );
}
