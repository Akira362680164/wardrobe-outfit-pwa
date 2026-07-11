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
    <div className="app-glass-bottom safe-bottom fixed inset-x-0 bottom-0 z-40 px-4 py-3">
      <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
        <button
          type="button"
          data-parity-id="parity.app.app.src.components.catalog.selection.catalog.multi.select.bar.0a08cacfc9" onClick={onCancel}
          className="inline-flex h-12 items-center justify-center ui-control-radius border border-ink/10 bg-white/76 text-sm font-semibold text-ink/70"
        >
          取消
        </button>
        <button
          type="button"
          data-parity-id="parity.app.app.src.components.catalog.selection.catalog.multi.select.bar.0390f9a9fd" onClick={onDelete}
          className="inline-flex h-12 items-center justify-center gap-2 ui-control-radius bg-red-600 text-sm font-semibold text-white"
        >
          <Trash2 size={16} />
          {deleteLabel} {selectedCount} 件
        </button>
      </div>
    </div>
  );
}
