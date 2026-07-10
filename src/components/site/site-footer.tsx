import { complianceLinks, siteConfig, siteStatus } from "@/lib/site-config";
import { SiteMark } from "./site-mark";

function OptionalLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  return href ? <a href={href} target="_blank" rel="noreferrer">{children}</a> : <span>{children}</span>;
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-container site-footer__grid">
        <div>
          <SiteMark compact />
          <p className="site-footer__description">{siteConfig.siteDescription}</p>
        </div>
        <nav aria-label="合规信息" className="site-footer__links">
          {complianceLinks.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
        </nav>
      </div>
      <div className="site-container site-footer__bottom">
        <span>© 2026 {siteStatus.operatorLabel}</span>
        <span className="site-footer__records">
          <OptionalLink href={siteStatus.icpUrl}>{siteStatus.icpLabel}</OptionalLink>
          <span aria-hidden="true">·</span>
          <OptionalLink href={siteStatus.policeUrl}>{siteStatus.policeLabel}</OptionalLink>
        </span>
      </div>
    </footer>
  );
}
