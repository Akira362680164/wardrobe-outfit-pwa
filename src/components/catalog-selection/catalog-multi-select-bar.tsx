import { Trash2 } from "lucide-react";

export interface CatalogMultiSelectBarProps {
  selectedCount: number;
  deleteLabel?: string;
  onCancel: () => void;
  onDelete: () => void;
}

export function CatalogMultiSelectBar({
  selectedCount,
  deleteLabel = "批量删除",
  onCancel,
  onDelete,
}: CatalogMultiSelectBarProps) {
  if (selectedCount <= 0) return null;

  return (
    <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-[#fbfbf8]/98 px-4 py-3 backdrop-blur-xl">
      <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-12 items-center justify-center rounded-lg border border-ink/10 bg-white text-sm font-semibold text-ink/70"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-red-600 text-sm font-semibold text-white"
        >
          <Trash2 size={16} />
          {deleteLabel} {selectedCount} 件
        </button>
      </div>
    </div>
  );
}
