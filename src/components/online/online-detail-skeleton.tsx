import { ChevronLeft } from "lucide-react";

export function OnlineDetailSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-[100dvh] bg-mist text-ink" aria-label="正在加载详情" role="status">
      <header className="flex h-14 items-center px-3 pt-[env(safe-area-inset-top)]">
        <button type="button" onClick={onBack} aria-label="返回" className="grid h-11 w-11 place-items-center rounded-full text-ink/70">
          <ChevronLeft aria-hidden="true" className="h-6 w-6" />
        </button>
      </header>
      <div className="mx-auto max-w-lg px-4 pb-8">
        <div className="aspect-[4/5] w-full animate-pulse rounded-2xl bg-ink/[0.07] motion-reduce:animate-none" />
        <div className="mt-5 space-y-3">
          <div className="h-5 w-2/3 animate-pulse rounded-lg bg-ink/[0.08] motion-reduce:animate-none" />
          <div className="h-4 w-1/2 animate-pulse rounded-lg bg-ink/[0.07] motion-reduce:animate-none" />
          <div className="h-4 w-5/6 animate-pulse rounded-lg bg-ink/[0.07] motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
}
