import { LoaderCircle } from "lucide-react";

export function OnlineButtonSpinner({ className = "h-4 w-4" }: { className?: string }) {
  return <LoaderCircle aria-hidden="true" className={`${className} shrink-0 animate-spin motion-reduce:animate-none`} />;
}
