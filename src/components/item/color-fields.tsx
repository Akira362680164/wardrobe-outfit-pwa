"use client";

import { useState } from "react";
import type { ColorInfo, ColorMode } from "@/lib/types";
import {
  COLOR_OPTIONS,
  COMMON_COLOR_OPTIONS,
  EXTENDED_COLOR_GROUPS,
  COLOR_SWATCHES,
  isSystemColor,
  type SystemColor,
} from "@/lib/color-catalog";
import { buildColorInfo, getAccentColors, getPrimaryColors, uniqueTrimmed } from "@/lib/color-fields";
import { formatColorModeLabel } from "@/lib/display-labels";
import { IntakeSourceBadge, type IntakeSourceBadgeLabel } from "@/components/intake-source-badge";
import { ColorChipList } from "@/components/color-chip";
import { ItemRow } from "@/components/item/row";
import { ChevronDown, ChevronUp, X } from "lucide-react";

type ItemColorFieldsProps =
  | {
      mode: "view";
      colors: ColorInfo;
    }
  | {
      mode: "edit";
      colors: ColorInfo;
      sourceLabel?: IntakeSourceBadgeLabel;
      onChange: (colors: ColorInfo) => void;
    };

const modeOptions: Array<{ value: ColorMode; label: string }> = [
  { value: "single", label: "单主色" },
  { value: "multicolor", label: "拼色" },
  { value: "main_with_accent", label: "主辅色" },
];

const colorSet = new Set<string>(COLOR_OPTIONS);

function sanitizeColorList(values: string[], max: number): string[] {
  const result: string[] = [];
  for (const value of values) {
    const clean = typeof value === "string" ? value.trim() : "";
    if (!clean || !colorSet.has(clean) || result.includes(clean)) continue;
    result.push(clean);
    if (result.length >= max) break;
  }
  return result;
}

export function ItemColorFields(props: ItemColorFieldsProps) {
  const colorMode = modeOptions.some((option) => option.value === props.colors.mode) ? props.colors.mode : "single";
  const primaryColors = sanitizeColorList(getPrimaryColors(props.colors), colorMode === "multicolor" ? 5 : 1);
  const accentColors = colorMode === "main_with_accent"
    ? sanitizeColorList(getAccentColors(props.colors), 5).filter((color) => color !== primaryColors[0])
    : [];

  if (props.mode === "view") {
    return (
      <div className="grid gap-3" data-item-color-fields="view" data-color-mode={colorMode}>
        <ItemRow label="主色" value={<ColorChipList colors={primaryColors.length > 0 ? primaryColors : undefined} />} />
        {colorMode === "main_with_accent" ? (
          <ItemRow label="辅助色" value={<ColorChipList colors={accentColors.length > 0 ? accentColors : undefined} />} />
        ) : null}
        <ItemRow label="颜色模式" value={formatColorModeLabel(colorMode)} />
      </div>
    );
  }

  const { onChange, sourceLabel } = props;

  function emit(nextMode: ColorMode, nextPrimary = primaryColors, nextAccent = accentColors) {
    const cleanPrimary = sanitizeColorList(nextPrimary, nextMode === "multicolor" ? 5 : 1);
    const cleanAccent = nextMode === "main_with_accent"
      ? sanitizeColorList(nextAccent, 5).filter((color) => color !== cleanPrimary[0])
      : [];
    onChange(buildColorInfo(nextMode, cleanPrimary, cleanAccent));
  }

  function switchMode(nextMode: ColorMode) {
    const merged = uniqueTrimmed([...primaryColors, ...accentColors]).slice(0, 5);
    if (nextMode === "single") {
      emit("single", merged[0] ? [merged[0]] : [], []);
      return;
    }
    if (nextMode === "main_with_accent") {
      emit("main_with_accent", merged[0] ? [merged[0]] : [], merged.slice(1));
      return;
    }
    emit("multicolor", merged, []);
  }

  function togglePrimary(color: string) {
    if (colorMode === "multicolor") {
      const exists = primaryColors.includes(color);
      const next = exists ? primaryColors.filter((c) => c !== color) : [...primaryColors, color].slice(0, 5);
      emit("multicolor", next, []);
      return;
    }
    const next = primaryColors[0] === color ? [] : [color];
    emit(colorMode, next, accentColors.filter((c) => c !== color));
  }

  function toggleAccent(color: string) {
    if (colorMode !== "main_with_accent" || primaryColors[0] === color) return;
    const exists = accentColors.includes(color);
    const next = exists ? accentColors.filter((c) => c !== color) : [...accentColors, color].slice(0, 5);
    emit("main_with_accent", primaryColors, next);
  }

  return (
    <div className="grid min-w-0 gap-3" data-item-color-fields="edit" data-color-mode={colorMode}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink/55">颜色模式</span>
        {sourceLabel ? <IntakeSourceBadge label={sourceLabel} /> : null}
      </div>
      <div className="grid min-w-0 grid-cols-3 gap-2">
        {modeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => switchMode(option.value)}
            className={`min-h-10 min-w-0 rounded-lg border px-2 text-xs font-semibold ${
              colorMode === option.value ? "border-denim/45 bg-denim/10 text-denim" : "border-ink/10 bg-white text-ink/58"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <ColorSwatchPicker
        title="主色"
        selected={primaryColors}
        disabledColors={[]}
        maxSelected={colorMode === "multicolor" ? 5 : 1}
        onToggle={togglePrimary}
      />
      {colorMode === "main_with_accent" ? (
        <ColorSwatchPicker
          title="辅助色"
          selected={accentColors}
          disabledColors={primaryColors}
          maxSelected={5}
          onToggle={toggleAccent}
        />
      ) : null}
    </div>
  );
}

interface ColorSwatchPickerProps {
  title: string;
  selected: string[];
  disabledColors: string[];
  maxSelected: number;
  onToggle: (color: string) => void;
}

/**
 * v1.1.27: 统一 ColorSwatchPicker。
 * 渲染 1) 标题 + 计数 2) 已选颜色区(常驻) 3) 12 常用色 4) 展开按钮 5) 4 组扩展色 6) 收起按钮。
 * 主色与辅助色复用同一个组件，各自维护展开状态。
 */
function ColorSwatchPicker({
  title,
  selected,
  disabledColors,
  maxSelected,
  onToggle,
}: ColorSwatchPickerProps) {
  const [expanded, setExpanded] = useState(false);
  const disabledSet = new Set(disabledColors);
  const limitLabel = `已选 ${selected.length}/${maxSelected}`;
  const extendedCount = COLOR_OPTIONS.length - COMMON_COLOR_OPTIONS.length;

  return (
    <div className="grid min-w-0 gap-1.5" data-color-picker>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink/55">{title}</span>
        <span className="text-[11px] text-ink/40" data-color-picker-count>{limitLabel}</span>
      </div>

      <div className="grid min-w-0 gap-1.5" data-color-picker-selected>
        <span className="text-[11px] font-medium text-ink/45">已选颜色</span>
        {selected.length === 0 ? (
          <span className="text-[11px] text-ink/40" data-color-picker-empty>暂未选择</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {selected.map((color) => (
              <SelectedColorChip key={color} color={color} onRemove={() => onToggle(color)} />
            ))}
          </div>
        )}
      </div>

      <div className="grid min-w-0 grid-cols-3 gap-2">
        {COMMON_COLOR_OPTIONS.map((color) => (
          <SwatchButton
            key={color}
            color={color}
            selected={selected.includes(color)}
            disabled={disabledSet.has(color)}
            onClick={() => onToggle(color)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="inline-flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-ink/10 bg-white px-3 text-xs font-semibold text-ink/65"
        data-color-picker-toggle
        aria-expanded={expanded}
      >
        <span>{expanded ? "收起更多颜色" : `展开更多颜色 +${extendedCount}`}</span>
        {expanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
      </button>

      {expanded ? (
        <div className="grid min-w-0 gap-2" data-color-picker-extended>
          {EXTENDED_COLOR_GROUPS.map((group) => (
            <div key={group.family} className="grid min-w-0 gap-1.5" data-color-picker-group={group.family}>
              <span className="mt-3 text-[12px] font-medium text-ink/45">{group.label}</span>
              <div className="grid min-w-0 grid-cols-3 gap-2">
                {group.colors.map((color) => (
                  <SwatchButton
                    key={color}
                    color={color}
                    selected={selected.includes(color)}
                    disabled={disabledSet.has(color)}
                    onClick={() => onToggle(color)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SelectedColorChip({ color, onRemove }: { color: string; onRemove: () => void }) {
  const swatch = isSystemColor(color) ? COLOR_SWATCHES[color as SystemColor] : null;
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white px-2 pr-1 text-xs font-medium text-ink/70 border border-ink/10">
      <span
        className="h-4 w-4 shrink-0 rounded-full"
        style={{
          background: swatch?.bg ?? "#cbd5e1",
          border: swatch?.border ? `1px solid ${swatch.border}` : undefined,
        }}
        aria-hidden="true"
      />
      <span>{color}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`移除${color}`}
        className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-ink/45 hover:bg-ink/5"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </span>
  );
}

function SwatchButton({
  color,
  selected,
  disabled,
  onClick,
}: {
  color: SystemColor;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const swatch = COLOR_SWATCHES[color];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-color-swatch={color}
      data-color-selected={selected}
      data-color-disabled={disabled}
      className={`inline-flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-semibold disabled:opacity-35 ${
        selected ? "border-denim/45 bg-denim/10 text-denim" : "border-ink/10 bg-white text-ink/65"
      }`}
    >
      <span
        className="h-4 w-4 rounded-full"
        style={{
          background: swatch.bg,
          border: swatch.border ? `1px solid ${swatch.border}` : undefined,
        }}
        aria-hidden="true"
      />
      {color}
    </button>
  );
}