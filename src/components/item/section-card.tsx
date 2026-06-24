"use client";

import type { ReactNode } from "react";

export interface ItemSectionCardProps {
  title?: string;
  icon?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function ItemSectionCard({
  title,
  icon,
  right,
  children,
  className,
  bodyClassName,
}: ItemSectionCardProps) {
  return (
    <section
      className={[
        "min-w-0 max-w-full overflow-hidden rounded-2xl bg-white p-4 shadow-soft",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {title || icon || right ? (
        <div className="mb-3 flex min-w-0 items-center gap-2">
          {icon ? (
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-denim/8 text-denim">
              {icon}
            </span>
          ) : null}
          {title ? <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{title}</h2> : <span className="min-w-0 flex-1" />}
          {right ? <div className="flex shrink-0 items-center gap-1.5">{right}</div> : null}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
