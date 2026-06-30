import { Shirt } from "lucide-react";

import { OnlineButtonSpinner } from "@/components/online/online-button-spinner";

export function OnlinePageLoader({ message = "正在打开你的衣橱" }: { message?: string }) {
  return (
    <main className="min-h-[100dvh] bg-mist px-5 text-ink" role="status" aria-live="polite">
      <div className="mx-auto flex min-h-[100dvh] max-w-sm flex-col items-center justify-center pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-center">
        <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-denim/10 bg-white/70 shadow-[0_12px_36px_rgba(42,55,73,0.08)]">
          <Shirt aria-hidden="true" className="h-8 w-8 text-denim" strokeWidth={1.6} />
        </div>
        <h1 className="text-lg font-semibold tracking-tight">{message}</h1>
        <OnlineButtonSpinner className="mt-4 h-5 w-5 text-denim/70" />
        <p className="mt-3 text-sm text-ink/55">请稍候…</p>
      </div>
    </main>
  );
}
