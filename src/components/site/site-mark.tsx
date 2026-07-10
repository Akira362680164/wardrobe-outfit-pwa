import { Shirt } from "lucide-react";
import { siteConfig } from "@/lib/site-config";

export function SiteMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="site-mark" aria-label={siteConfig.siteName}>
      <span className="site-mark__icon" aria-hidden="true"><Shirt size={compact ? 17 : 20} /></span>
      <span className={compact ? "site-mark__word site-mark__word--compact" : "site-mark__word"}>{compact ? siteConfig.siteShortName : siteConfig.siteName}</span>
    </span>
  );
}
