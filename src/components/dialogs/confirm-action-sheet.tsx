import type { ReactNode } from "react";
import { MotionSheet } from "@/components/motion-common";
import { AsyncActionButton } from "@/components/async-action-button";

export interface ConfirmActionSheetProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  submitting?: boolean;
  error?: string | null;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  children?: ReactNode;
}

export function ConfirmActionSheet({ open, title, description, confirmLabel, cancelLabel = "取消", tone = "primary", submitting = false, error, onConfirm, onClose, children }: ConfirmActionSheetProps) {
  return <MotionSheet open={open} onClose={submitting ? () => undefined : onClose} preferBottom={false} className="z-[100]" panelClassName="sm:max-w-sm">
    <h3 className="text-base font-semibold">{title}</h3>
    {description ? <div className="mt-2 text-sm text-ink/55 whitespace-pre-wrap">{description}</div> : null}
    {children}
    {error ? <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p> : null}
    <div className="mt-4 grid grid-cols-2 gap-2">
      <AsyncActionButton label={cancelLabel} tone="neutral" disabled={submitting} onClick={onClose} />
      <AsyncActionButton label={confirmLabel} loadingLabel={`${confirmLabel}中…`} tone={tone} loading={submitting} onClick={onConfirm} />
    </div>
  </MotionSheet>;
}
