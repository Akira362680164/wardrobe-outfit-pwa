"use client";

import type { ReactNode } from "react";
import type { ColorInfo, TemperatureRange } from "@/lib/types";
import { TemperatureRangeBar } from "@/components/temperature-range-bar";
import { ItemRow } from "@/components/item/row";
import { NotesBlock } from "@/components/item/notes-block";
import { DetailSectionCard } from "@/components/item-shell/detail-section-card";
import { ItemColorFields } from "@/components/item/color-fields";

export interface ItemDetailSectionsProps {
  name: string;
  categoryLabel?: string;
  subcategoryLabel?: string;
  priceLabel?: string;
  productUrl?: string;
  basicExtraRows?: ReactNode;
  colors: ColorInfo;
  seasonLabel?: string;
  styleLabel?: string;
  temperatureRange?: TemperatureRange | null;
  formality?: number;
  warmth?: number;
  material?: string;
  fitGenderLabel?: string;
  fitNotes?: string;
  notes?: string;
}

export function ItemDetailSections({
  name,
  categoryLabel,
  subcategoryLabel,
  priceLabel,
  productUrl,
  basicExtraRows,
  colors,
  seasonLabel,
  styleLabel,
  temperatureRange,
  formality,
  warmth,
  material,
  fitGenderLabel,
  fitNotes,
  notes,
}: ItemDetailSectionsProps) {
  return (
    <>
      <DetailSectionCard title="基础信息">
        <div className="grid gap-3">
          <ItemRow label="名称" value={name} />
          <ItemRow label="分类" value={categoryLabel} />
          <ItemRow label="细分" value={subcategoryLabel} />
          <ItemRow label="价格" value={priceLabel} />
          <ItemRow label="商品链接" value={productUrl} />
          {basicExtraRows}
        </div>
      </DetailSectionCard>

      <DetailSectionCard title="颜色">
        <ItemColorFields mode="view" colors={colors} />
      </DetailSectionCard>

      <DetailSectionCard title="穿着属性">
        <div className="grid gap-3">
          <ItemRow label="季节" value={seasonLabel} />
          <ItemRow label="风格" value={styleLabel} />
          <ItemRow label="适穿温度" value={<TemperatureRangeBar value={temperatureRange} size="sm" />} />
          <ItemRow label="正式度" value={formality != null ? `${formality}/5` : undefined} />
          <ItemRow label="保暖度" value={warmth != null ? `${warmth}/5` : undefined} />
          <ItemRow label="材质" value={material} />
          <ItemRow label="版型倾向" value={fitGenderLabel} />
          <ItemRow label="版型说明" value={fitNotes} />
        </div>
      </DetailSectionCard>

      <DetailSectionCard title="备注">
        <NotesBlock value={notes} mode="view" />
      </DetailSectionCard>
    </>
  );
}
