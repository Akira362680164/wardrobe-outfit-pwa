import { Shirt } from "lucide-react";

export function SiteMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="site-mark" aria-label="Wardora">
      <span className="site-mark__icon" aria-hidden="true"><Shirt size={compact ? 17 : 20} /></span>
      <span className={compact ? "site-mark__word site-mark__word--compact" : "site-mark__word"}>Wardora</span>
    </span>
  );
}
