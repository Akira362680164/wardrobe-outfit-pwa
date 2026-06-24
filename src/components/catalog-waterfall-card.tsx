"use client";

import type { ReactElement, ReactNode } from "react";
import { motion } from "motion/react";
import { getColorSwatchStyle } from "@/lib/catalog-card-format";
import { spring } from "@/lib/motion-tokens";

export function CatalogWaterfallCard({
  children,
  title,
  subtitle,
  record,
  onClick,
}: {
  children: ReactNode;
  title: string;
  subtitle: ReactNode;
  record: string;
  onClick: () => void;
}): ReactElement {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      transition={spring.snappy}
      onClick={onClick}
      className="relative flex h-[304px] flex-col overflow-hidden rounded-2xl border border-ink/8 bg-white text-left shadow-soft"
    >
      <div className="relative h-[210px] overflow-hidden bg-mist">
        {children}
      </div>
      <div className="flex h-[94px] shrink-0 flex-col gap-1 overflow-hidden p-3">
        <p className="truncate text-sm font-semibold text-ink">{title}</p>
        <div className="truncate text-xs text-ink/54">{subtitle}</div>
        <p className="truncate text-xs text-ink/38">{record}</p>
      </div>
    </motion.button>
  );
}

export function GarmentColorInline({ colors }: { colors: string[] }): ReactElement | null {
  if (colors.length === 0) return null;
  const visibleColors = colors.slice(0, 3);
  const hiddenCount = Math.max(0, colors.length - visibleColors.length);
  return (
    <span className="inline-flex min-w-0 items-center gap-1 overflow-hidden">
      {visibleColors.map((color, index) => {
        const swatch = getColorSwatchStyle(color);
        const swatchClassName = swatch.needsBorder ? "border border-ink/18" : "border border-ink/10";
        return (
          <span key={`${color}-${index}`} className="inline-flex min-w-0 items-center gap-1">
            {index > 0 ? <span className="text-ink/32">/</span> : null}
            <span
              className={`h-3 w-3 shrink-0 rounded-full ${swatchClassName}`}
              style={{ backgroundColor: swatch.backgroundColor }}
            />
            <span className="truncate">{color}</span>
          </span>
        );
      })}
      {hiddenCount > 0 ? <span className="shrink-0 text-ink/42">+{hiddenCount}</span> : null}
    </span>
  );
}
