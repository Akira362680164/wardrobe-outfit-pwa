/**
 * ColorChip - 统一色卡组件
 *
 * v1.1.27: 不再本地维护 COLOR_SWATCHES / COLOR_OPTIONS，统一从 @/lib/color-catalog 读取。
 *
 * 展示规则：
 * - 颜色存在：左侧圆形色块，右侧中文颜色
 * - 颜色不存在：灰色空心色块，右侧"未识别"
 * - 未知颜色：灰色实心色块，右侧原文字
 *
 * 精确样式：
 * - ColorChip 高度 28
 * - 圆角 14
 * - 背景 white
 * - 边框 ink/10
 * - 左侧色块 14x14
 * - 色块左边距 10
 * - 文字字号 12
 * - 文字右边距 10
 */
import { COLOR_SWATCHES, type SystemColor } from "@/lib/color-catalog";

export function ColorChip(props: {
  color?: string;
  label?: string;
  size?: "sm" | "md";
}) {
  const { color, label, size = "md" } = props;

  const swatchSize = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
  const chipHeight = size === "sm" ? "min-h-[24px]" : "min-h-[28px]";

  if (!color && !label) {
    // 颜色不存在：灰色空心色块，右侧"未识别"
    return (
      <span
        className={`inline-flex ${chipHeight} items-center gap-2 rounded-full bg-white px-3 pr-[10px] text-xs border border-ink/10`}
      >
        <span
          className={`${swatchSize} shrink-0 rounded-full border border-ink/20`}
          style={{ background: "transparent" }}
        />
        <span className="text-ink/40">未识别</span>
      </span>
    );
  }

  const mapped = color ? COLOR_SWATCHES[color as SystemColor] : null;
  if (mapped) {
    // 颜色存在：左侧圆形色块，右侧中文颜色
    return (
      <span
        className={`inline-flex ${chipHeight} items-center gap-2 rounded-full bg-white px-3 pr-[10px] text-xs border border-ink/10`}
      >
        <span
          className={`${swatchSize} shrink-0 rounded-full`}
          style={{
            background: mapped.bg,
            border: mapped.border ? `1px solid ${mapped.border}` : undefined,
          }}
        />
        <span className="text-ink/70">{label ?? color}</span>
      </span>
    );
  }

  // 未知颜色：灰色实心色块，右侧原文字
  return (
    <span
      className={`inline-flex ${chipHeight} items-center gap-2 rounded-full bg-white px-3 pr-[10px] text-xs border border-ink/10`}
    >
      <span
        className={`${swatchSize} shrink-0 rounded-full bg-[#cbd5e1]`}
      />
      <span className="text-ink/70">{label ?? color}</span>
    </span>
  );
}

export function ColorChipList(props: {
  colors?: string[];
  emptyText?: string;
}) {
  const { colors, emptyText = "未识别" } = props;

  if (!colors || colors.length === 0) {
    return <ColorChip color={undefined} label={emptyText} />;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((c) => (
        <ColorChip key={c} color={c} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ColorSwatchButton — 色卡点选按钮（用于编辑/录入页）                     */
/* ------------------------------------------------------------------ */

/**
 * ColorSwatchButton
 * 高度：36px
 * 圆角：999px
 * 左侧：14px 圆形色卡
 * 右侧：中文颜色文字
 * 选中态：denim 背景，白色文字
 * 未选中态：白色背景，ink/10 描边
 */
export function ColorSwatchButton(props: {
  color: string;
  selected: boolean;
  onClick: () => void;
}) {
  const { color, selected, onClick } = props;
  const mapped = COLOR_SWATCHES[color as SystemColor];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors ${
        selected
          ? "bg-denim text-white border-denim"
          : "bg-white text-ink/60 border-ink/10"
      }`}
    >
      <span
        className="h-3.5 w-3.5 shrink-0 rounded-full"
        style={{
          background: mapped?.bg ?? "#cbd5e1",
          border: mapped?.border ? `1px solid ${mapped.border}` : undefined,
        }}
      />
      <span>{color}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  ColorChipGroup — 色卡组展示组件                                      */
/* ------------------------------------------------------------------ */

/**
 * ColorChipGroup
 * 展示多个色卡 Chip，适用于主色+辅助色的组展示
 */
export function ColorChipGroup(props: {
  mainColor?: string;
  accentColors?: string[];
  emptyText?: string;
}) {
  const { mainColor, accentColors, emptyText = "未识别" } = props;

  if (!mainColor && (!accentColors || accentColors.length === 0)) {
    return <ColorChip color={undefined} label={emptyText} />;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {mainColor && <ColorChip color={mainColor} />}
      {accentColors?.map((c) => (
        <ColorChip key={c} color={c} />
      ))}
    </div>
  );
}