"use client";

import type { ReactNode } from "react";
import {
  ITEM_PAGE_ROOT_CLASS,
  ITEM_PAGE_SCROLL_CLASS,
  ITEM_PAGE_CONTENT_CLASS,
} from "@/components/item-shell/item-surface-tokens";

export interface ItemDetailPageShellProps {
  topBar: ReactNode;

  hero: ReactNode;
  filmstrip?: ReactNode;
  quickActions?: ReactNode;

  titleBlock: ReactNode;
  tabs?: ReactNode;

  children: ReactNode;
  overlays?: ReactNode;

  contentClassName?: string;
}

export function ItemDetailPageShell({
  topBar,
  hero,
  filmstrip,
  quickActions,
  titleBlock,
  tabs,
  children,
  overlays,
  contentClassName,
}: ItemDetailPageShellProps) {
  return (
    <section className={ITEM_PAGE_ROOT_CLASS}>
      <div className="shrink-0">{topBar}</div>

      <main className={ITEM_PAGE_SCROLL_CLASS}>
        <div className={contentClassName ?? ITEM_PAGE_CONTENT_CLASS}>
          {hero}
          {filmstrip}
          {quickActions}
          {titleBlock}
          {tabs}

          <div className="mt-4 space-y-4">{children}</div>
        </div>
      </main>

      {overlays}
    </section>
  );
}
