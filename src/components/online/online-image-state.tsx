import { ImageOff, LoaderCircle } from "lucide-react";

export function OnlineImagePlaceholder({ label = "正在加载" }: { label?: string }) {
  return (
    <div className="flex h-full min-h-28 w-full flex-col items-center justify-center gap-2 bg-denim/5 text-xs text-ink/50" role="status">
      <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin text-denim/60 motion-reduce:animate-none" />
      <span>{label}</span>
    </div>
  );
}

export function OnlineImageLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-full min-h-28 w-full flex-col items-center justify-center gap-1.5 bg-clay/5 px-3 text-center text-xs text-clay" role="alert">
      <ImageOff aria-hidden="true" className="h-5 w-5" strokeWidth={1.6} />
      <span>照片加载失败</span>
      <button type="button" onClick={onRetry} className="rounded-full px-2 py-1 font-medium underline underline-offset-2">重试</button>
    </div>
  );
}
