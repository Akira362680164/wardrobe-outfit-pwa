import { AppPressable, MotionSheet } from "@/components/motion-common";

export interface CatalogBulkDeleteSheetProps {
  open: boolean;
  count: number;

  title: string;
  description: string;

  submitting: boolean;
  error?: string | null;

  onClose: () => void;
  onConfirm: () => void;
}

export function CatalogBulkDeleteSheet({
  open,
  title,
  description,
  submitting,
  error,
  onClose,
  onConfirm,
}: CatalogBulkDeleteSheetProps) {
  return (
    <MotionSheet
      open={open}
      onClose={submitting ? (() => {}) : onClose}
      panelClassName="!max-w-xs"
    >
      <p className="text-sm font-semibold mb-2">{title}</p>
      <p className="text-xs text-ink/60 mb-4">{description}</p>
      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
          删除失败：{error}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <AppPressable
          type="button"
          feedback="control"
          data-parity-id="parity.app.app.src.components.catalog.selection.catalog.bulk.delete.sheet.3623ae10d2" onClick={onClose}
          disabled={submitting}
          className="h-10 rounded-lg border border-ink/10 text-sm disabled:opacity-45"
        >
          取消
        </AppPressable>
        <AppPressable
          type="button"
          feedback="control"
          data-parity-id="parity.app.app.src.components.catalog.selection.catalog.bulk.delete.sheet.6cf258f93b" onClick={onConfirm}
          disabled={submitting}
          className="h-10 rounded-lg bg-red-600 text-sm font-semibold text-white disabled:opacity-60"
        >
          {submitting ? "删除中..." : "确认删除"}
        </AppPressable>
      </div>
    </MotionSheet>
  );
}
