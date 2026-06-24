"use client";

/**
 * v1.1.22 Step 3 (P0-3) — CategorySubcategoryPicker
 *
 * 衣物分类二级联动选择器：9 个一级 category chip + 动态二级 subcategory chip。
 * 数据源 GARMENT_CATEGORY_CATALOG（9 组 90 项细分）。
 *
 * 设计要点（AGENTS.md 移动端硬规则 + 业务需求 §4.2）：
 * - 一级 9 chip 横排（窄屏横向滚动，桌面 flex-wrap）
 * - 选中分类后才显示二级 chip，避免空状态
 * - 切换一级分类时自动清空二级（P1-6 fix in patchReviewDraft）
 * - 二级 chip 数量 4-22 项，自动 flex-wrap 避免单行滚动
 * - "不限/未识别" 状态：未选一级时整组不渲染；选了一级但未选二级时显示空态提示
 * - 不发任何网络/AI 请求，纯本地 UI 组件
 */

import {
  GARMENT_CATEGORY_CATALOG,
  getCategoryGroupById,
  type GarmentCategoryGroup,
} from "@/lib/garment-category-catalog";
import type { GarmentCategory } from "@/lib/types";

interface Props {
  category: GarmentCategory;
  subcategory: string | undefined;
  onCategoryChange: (next: GarmentCategory) => void;
  onSubcategoryChange: (next: string | undefined) => void;
  /** 一级 chip 区域上方的小标签，默认「分类」。 */
  categoryLabel?: string;
  /** 二级 chip 区域上方的小标签，默认「细分」。 */
  subcategoryLabel?: string;
  className?: string;
  /** 用于 aria / test 钩子。 */
  id?: string;
}

export function CategorySubcategoryPicker({
  category,
  subcategory,
  onCategoryChange,
  onSubcategoryChange,
  categoryLabel = "分类",
  subcategoryLabel = "细分",
  className,
  id,
}: Props) {
  // 一级不在 catalog 时回退到第一个 group，避免渲染空态
  const activeGroup: GarmentCategoryGroup | undefined = getCategoryGroupById(category);
  const subs = activeGroup?.subcategories ?? [];

  return (
    <div className={["grid gap-2 min-w-0", className].filter(Boolean).join(" ")}>
      <fieldset className="grid gap-1 min-w-0">
        <legend className="text-sm font-medium text-ink/80">{categoryLabel}</legend>
        <div
          id={id ? `${id}-categories` : undefined}
          role="radiogroup"
          aria-label={categoryLabel}
          className="-mx-1 flex min-w-0 gap-1.5 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {GARMENT_CATEGORY_CATALOG.map((g) => {
            const active = g.id === category;
            return (
              <button
                key={g.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  if (g.id === category) return;
                  onCategoryChange(g.id as GarmentCategory);
                  // 切大类时强制清空二级（P1-6 fix）
                  if (subcategory != null && subcategory !== "") {
                    onSubcategoryChange(undefined);
                  }
                }}
                className={[
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-denim text-white"
                    : "bg-mist text-ink/60 hover:bg-mist/70",
                ].join(" ")}
              >
                {g.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="grid gap-1 min-w-0">
        <legend className="text-sm font-medium text-ink/80">{subcategoryLabel}</legend>
        {subs.length === 0 ? (
          <p className="text-ink/40 text-xs">该分类暂无细分项</p>
        ) : (
          <div
            id={id ? `${id}-subcategories` : undefined}
            role="radiogroup"
            aria-label={subcategoryLabel}
            className="flex min-w-0 flex-wrap gap-1.5"
          >
            {/* 不限 chip：允许用户明确不选二级 */}
            <button
              type="button"
              role="radio"
              aria-checked={subcategory == null || subcategory === ""}
              onClick={() => onSubcategoryChange(undefined)}
              className={[
                "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                subcategory == null || subcategory === ""
                  ? "bg-ink/80 text-white"
                  : "bg-mist text-ink/50 hover:bg-mist/70",
              ].join(" ")}
            >
              不限
            </button>
            {subs.map((s) => {
              const active = s.id === subcategory;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onSubcategoryChange(active ? undefined : s.id)}
                  className={[
                    "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                    active
                      ? "bg-denim text-white"
                      : "bg-mist text-ink/60 hover:bg-mist/70",
                  ].join(" ")}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        )}
      </fieldset>
    </div>
  );
}
