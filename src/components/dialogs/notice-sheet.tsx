import type { ReactNode } from "react";
import { MotionSheet } from "@/components/motion-common";
import { AsyncActionButton } from "@/components/async-action-button";

export function NoticeSheet({ open, title, description, actionLabel = "知道了", onClose }: { open: boolean; title: string; description?: ReactNode; actionLabel?: string; onClose: () => void }) {
  return <MotionSheet open={open} onClose={onClose} preferBottom={false} className="z-[100]" panelClassName="sm:max-w-sm"><h3 className="text-base font-semibold">{title}</h3>{description ? <div className="mt-2 text-sm text-ink/55 whitespace-pre-wrap">{description}</div> : null}<AsyncActionButton label={actionLabel} className="mt-4 w-full" onClick={onClose} /></MotionSheet>;
}
