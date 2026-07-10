import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

export function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site-shell">
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}
