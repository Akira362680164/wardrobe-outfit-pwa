import { CloudOff } from "lucide-react";

import { OnlineButtonSpinner } from "@/components/online/online-button-spinner";

export function OnlinePageError({
  message = "请检查网络后重新尝试",
  onRetry,
  retrying = false,
}: {
  message?: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <main className="min-h-[100dvh] bg-mist px-5 text-ink">
      <div className="mx-auto flex min-h-[100dvh] max-w-sm flex-col items-center justify-center pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-center">
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-clay/5 text-clay">
          <CloudOff aria-hidden="true" className="h-6 w-6" strokeWidth={1.7} />
        </div>
        <h1 className="text-lg font-semibold">暂时无法打开衣橱</h1>
        <p className="mt-2 text-sm leading-6 text-ink/60">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-6 inline-flex h-12 min-w-32 items-center justify-center gap-2 rounded-xl bg-denim px-5 text-sm font-medium text-white shadow-sm transition-opacity disabled:opacity-60"
        >
          {retrying ? <OnlineButtonSpinner /> : null}
          {retrying ? "正在加载…" : "重新加载"}
        </button>
      </div>
    </main>
  );
}
