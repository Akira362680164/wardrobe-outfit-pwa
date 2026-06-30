import { CheckCircle2 } from "lucide-react";

import { MotionToast } from "@/components/motion-common";

export function OnlineSuccessToast({ visible, message }: { visible: boolean; message: string }) {
  return (
    <MotionToast visible={visible} type="success" placement="top" className="fixed inset-x-4 top-[calc(env(safe-area-inset-top)+12px)] z-[70] mx-auto max-w-sm">
      <div className="flex items-center gap-2 rounded-xl border border-moss/15 bg-white/95 px-4 py-3 text-sm text-ink shadow-lg backdrop-blur">
        <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-moss" />
        <span>{message}</span>
      </div>
    </MotionToast>
  );
}
