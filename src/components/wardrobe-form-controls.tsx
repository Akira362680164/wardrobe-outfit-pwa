// src/components/wardrobe-form-controls.tsx
// v1.1.9 4C: ChipGroup / SelectableChipGroup / RangeField extracted from wardrobe-app.tsx
// to break the wardrobe-app.tsx → batch-review-view.tsx → wardrobe-app.tsx circular import

import { useState, useRef } from "react";
import { Check } from "lucide-react";
import { COLOR_SWATCHES, type SystemColor } from "@/lib/color-catalog";

function toggle<T>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function ColorDot({ color, className = "h-4 w-4" }: { color: string; className?: string }) {
  const swatch = COLOR_SWATCHES[color as SystemColor] ?? { bg: "#cbd5e1", border: "rgba(29,34,40,0.18)" };
  return (
    <span
      className={`inline-block shrink-0 rounded-full ${className}`}
      style={{
        background: swatch.bg,
        border: swatch.border ? `1px solid ${swatch.border}` : "1px solid rgba(255,255,255,0.38)",
      }}
      aria-hidden="true"
    />
  );
}

export function SelectableChipGroup<T extends string>({
  title,
  options,
  labels,
  values,
  onChange,
  mode = "multiple",
  maxSelected,
  disabledValues = [],
  disabledMessage = "当前选项不可选择",
  showColorDot = false,
  selectedFirst = false,
  maxCollapsedOptions = 6,
  scrollRef,
  onLimit,
}: {
  title: string;
  options: readonly T[];
  labels?: Record<T, string>;
  values: T[];
  onChange: (values: T[]) => void;
  mode?: "single" | "multiple";
  maxSelected?: number;
  disabledValues?: T[];
  disabledMessage?: string;
  showColorDot?: boolean;
  selectedFirst?: boolean;
  maxCollapsedOptions?: number;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  onLimit?: (message: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const valueSet = new Set(values);
  const disabledSet = new Set(disabledValues);
  const orderedOptions = selectedFirst
    ? [
        ...options.filter((option) => valueSet.has(option)),
        ...options.filter((option) => !valueSet.has(option)),
      ]
    : [...options];
  const visibleOptions = expanded ? orderedOptions : orderedOptions.slice(0, maxCollapsedOptions);
  const hiddenCount = Math.max(0, orderedOptions.length - visibleOptions.length);

  function select(option: T) {
    const active = valueSet.has(option);
    if (disabledSet.has(option) && !active) {
      onLimit?.(disabledMessage);
      return;
    }
    if (mode === "single") {
      if (!active) onChange([option]);
      return;
    }
    if (active) {
      onChange(values.filter((value) => value !== option));
      return;
    }
    if (maxSelected && values.length >= maxSelected) {
      onLimit?.(`${title.replace(/（.*$/, "")}最多选择 ${maxSelected} 个`);
      return;
    }
    onChange([...values, option]);
  }

  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">{title}</span>
      <div ref={scrollRef} className="flex flex-wrap gap-2 overflow-hidden">
        {visibleOptions.map((option) => {
          const active = valueSet.has(option);
          const disabled = disabledSet.has(option) && !active;
          return (
            <button
              type="button"
              key={option}
              data-active={active}
              aria-pressed={active}
              aria-disabled={disabled}
              onClick={() => select(option)}
              className={`inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors ${
                active
                  ? "border-denim bg-denim text-white shadow-sm"
                  : disabled
                    ? "border-ink/8 bg-mist/60 text-ink/30"
                    : "border-ink/10 bg-white text-ink/70 active:bg-mist"
              }`}
            >
              {showColorDot ? <ColorDot color={option} /> : null}
              <span className="block max-w-[6.75rem] truncate">{labels?.[option] ?? option}</span>
              {active ? <Check size={13} className="shrink-0" aria-hidden="true" /> : null}
            </button>
          );
        })}
        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex min-h-9 items-center rounded-lg border border-ink/10 bg-white px-3 text-sm font-semibold text-ink/60 active:bg-mist"
          >
            展开更多 <span className="ml-1 text-ink/45">+{hiddenCount}</span>
          </button>
        ) : expanded && orderedOptions.length > maxCollapsedOptions ? (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="inline-flex min-h-9 items-center rounded-lg border border-ink/10 bg-white px-3 text-sm font-semibold text-ink/60 active:bg-mist"
          >
            收起
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ChipGroup<T extends string>({
  title,
  options,
  labels,
  values,
  onChange,
  scrollRef,
}: {
  title: string;
  options: T[];
  labels?: Record<T, string>;
  values: T[];
  onChange: (values: T[]) => void;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">{title}</span>
      <div ref={scrollRef} className="flex gap-2 overflow-x-auto hide-scrollbar -mx-1 px-1">
        {options.map((option) => {
          const active = values.includes(option);
          return (
            <button
              type="button"
              key={option}
              data-active={active}
              onClick={() => onChange(toggle(values, option))}
              className={`shrink-0 min-h-9 rounded-lg border px-3 text-sm ${
                active ? "border-denim bg-denim text-white" : "border-ink/10 bg-white text-ink/70"
              }`}
            >
              {labels?.[option] ?? option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function RangeField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const min = 1;
  const max = 5;
  const trackRef = useRef<HTMLDivElement>(null);
  const clampedValue = clampNumber(value, min, max);
  const percent = ((clampedValue - min) / (max - min)) * 100;

  function updateFromClientX(clientX: number) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const nextPercent = clampNumber((clientX - rect.left) / rect.width, 0, 1);
    const nextValue = clampNumber(Math.round(min + nextPercent * (max - min)), min, max);
    if (nextValue !== value) onChange(nextValue);
  }

  function handleThumbPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.currentTarget.focus();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
  }

  function handleThumbPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    updateFromClientX(event.clientX);
  }

  function handleThumbPointerEnd(event: React.PointerEvent<HTMLButtonElement>) {
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {}
  }

  function handleThumbKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    let nextValue = value;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") nextValue = value - 1;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") nextValue = value + 1;
    if (event.key === "Home") nextValue = min;
    if (event.key === "End") nextValue = max;
    nextValue = clampNumber(nextValue, min, max);
    if (nextValue !== value) {
      event.preventDefault();
      onChange(nextValue);
    }
  }

  return (
    <label className="grid gap-2 text-sm font-medium">
      <span className="flex items-center justify-between">
        {label}
        <span className="text-xs text-ink/54">{value}/5</span>
      </span>
      <span ref={trackRef} className="relative block h-8 touch-pan-y">
        <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-mist" />
        <span aria-hidden="true" className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-denim" style={{ width: `${percent}%` }} />
        <button
          type="button"
          role="slider"
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={clampedValue}
          aria-valuetext={`${clampedValue}/5`}
          onPointerDown={handleThumbPointerDown}
          onPointerMove={handleThumbPointerMove}
          onPointerUp={handleThumbPointerEnd}
          onPointerCancel={handleThumbPointerEnd}
          onKeyDown={handleThumbKeyDown}
          className="absolute top-1/2 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-denim/35 bg-white shadow-sm outline-none ring-denim/20 transition focus:ring-4"
          style={{ left: `${percent}%`, touchAction: "none" }}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-denim" />
        </button>
      </span>
    </label>
  );
}