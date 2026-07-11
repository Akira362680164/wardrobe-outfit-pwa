"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { siteLinks } from "@/lib/site-config";
import { SiteMark } from "./site-mark";

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="site-container site-header__inner">
        <Link href="/" className="site-brand"><SiteMark /></Link>
        <button
          type="button"
          className="site-menu-button"
          aria-label={open ? "关闭导航菜单" : "打开导航菜单"}
          aria-expanded={open}
          aria-controls="site-navigation"
          data-parity-id="parity.app.app.src.components.site.site.header.efb7cfe2f5" onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
        </button>
        <nav id="site-navigation" aria-label="主导航" className={open ? "site-nav site-nav--open" : "site-nav"}>
          {siteLinks.map((link) => {
            const active = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                data-parity-id={`parity.app.app.src.components.site.site.header.3d66f910af.${encodeURIComponent(link.href)}`}
                href={link.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
