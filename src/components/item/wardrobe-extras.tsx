"use client";

/**
 * v1.1.23 six-page design §2.5: WardrobeExtras 业务独有字段。
 *
 * - Step 3 / 编辑页: 衣橱位置 (select) + 状态 (4 态 select)，两行连排。
 * - 详情页: 衣橱位置 + 购买日期 + 状态三行 ItemRow。
 * - 不展示 AI 置信度；不展示 review-pill (详情页禁止, 编辑页由 ItemField 自行接)。
 */

import type { ClosetLocation, GarmentStatus } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { ItemRow } from "@/components/item/row";
import { ItemField } from "@/components/item/field";

export interface WardrobeExtrasViewProps {
  mode: "view";
  locationLabel: string;
  purchaseDate?: string;
  status: GarmentStatus;
}

export interface WardrobeExtrasEditProps {
  mode: "edit";
  draft: {
    locationId: string;
    status: GarmentStatus;
    purchaseDate?: string;
  };
  locations: ClosetLocation[];
  onPatch: (patch: { locationId?: string; status?: GarmentStatus; purchaseDate?: string }) => void;
  /** review-pill 开关位 (供 ItemField 透传 review=...)。 */
  locationReview?: boolean;
  statusReview?: boolean;
  purchaseDateReview?: boolean;
}

export type WardrobeExtrasProps = WardrobeExtrasViewProps | WardrobeExtrasEditProps;

const STATUS_OPTIONS: GarmentStatus[] = ["active", "laundry", "repair", "archived"];

export function WardrobeExtras(props: WardrobeExtrasProps) {
  if (props.mode === "view") {
    return (
      <>
        <ItemRow label="衣橱" value={props.locationLabel} />
        <ItemRow label="购买日期" value={props.purchaseDate || undefined} />
        <ItemRow label="状态" value={STATUS_LABELS[props.status] ?? "未知"} />
      </>
    );
  }

  const { draft, locations, onPatch, locationReview, statusReview, purchaseDateReview } = props;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <ItemField label="衣橱位置" review={locationReview}>
        <select
          value={draft.locationId}
          onChange={(e) => onPatch({ locationId: e.target.value })}
          className="h-11 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
        >
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </ItemField>
      <ItemField label="状态" review={statusReview}>
        <select
          value={draft.status}
          onChange={(e) => onPatch({ status: e.target.value as GarmentStatus })}
          className="h-11 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </ItemField>
      <ItemField label="购买日期" review={purchaseDateReview} className="sm:col-span-2" hint="非必填；记录首次购入日期">
        <input
          type="date"
          value={draft.purchaseDate ?? ""}
          onChange={(e) => onPatch({ purchaseDate: e.target.value || undefined })}
          className="h-11 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
        />
      </ItemField>
    </div>
  );
}
