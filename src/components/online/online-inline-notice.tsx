import { AlertCircle, LoaderCircle } from "lucide-react";

export function OnlineInlineNotice({
  message,
  tone = "loading",
  retryLabel = "重试",
  onRetry,
}: {
  message: string;
  tone?: "loading" | "error" | "info";
  retryLabel?: string;
  onRetry?: () => void;
}) {
  const error = tone === "error";
  return (
    <div
      role={error ? "alert" : "status"}
      className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-[13px] leading-5 ${error ? "border-clay/20 bg-clay/5 text-clay" : "border-denim/10 bg-denim/5 text-ink/65"}`}
    >
      {tone === "loading" ? <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" /> : <AlertCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry ? <button type="button" onClick={onRetry} className="shrink-0 rounded-full px-2 py-0.5 font-medium underline-offset-2 hover:underline">{retryLabel}</button> : null}
    </div>
  );
}
