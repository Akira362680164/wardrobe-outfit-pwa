"use client";

import type { ReactNode } from "react";
import { ITEM_SURFACE_CLASS } from "@/components/item-shell/item-surface-tokens";

export interface DetailSectionCardProps {
  title?: string;
  icon?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}

export function DetailSectionCard({
  title,
  icon,
  right,
  children,
  bodyClassName,
}: DetailSectionCardProps) {
  return (
    <section className={`${ITEM_SURFACE_CLASS} p-4`}>
      {title || icon || right ? (
        <div className="mb-3 flex min-w-0 items-center gap-2">
          {icon ? (
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-denim/8 text-denim">
              {icon}
            </span>
          ) : null}
          {title ? (
            <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
              {title}
            </h2>
          ) : (
            <span className="min-w-0 flex-1" />
          )}
          {right ? (
            <div className="flex shrink-0 items-center gap-1.5">{right}</div>
          ) : null}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
