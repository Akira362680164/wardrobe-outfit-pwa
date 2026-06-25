"use client";

import type { ReactNode } from "react";
import { ITEM_SURFACE_CLASS } from "@/components/item-shell/item-surface-tokens";

export interface EditSectionCardProps {
  title?: string;
  icon?: ReactNode;
  description?: string;
  required?: boolean;
  right?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
  className?: string;
}

export function EditSectionCard({
  title,
  icon,
  description,
  required = false,
  right,
  children,
  bodyClassName,
  className,
}: EditSectionCardProps) {
  return (
    <section className={`${ITEM_SURFACE_CLASS} p-4 ${className ?? ""}`}>
      {title || icon || description ? (
        <div className="mb-3 flex min-w-0 items-center gap-2">
          {icon ? (
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-denim/8 text-denim">
              {icon}
            </span>
          ) : null}
          {title ? (
            <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
              {title}
              {required ? (
                <span className="ml-1 text-xs font-normal text-red-500">*</span>
              ) : null}
            </h2>
          ) : (
            <span className="min-w-0 flex-1" />
          )}
          {right ? (
            <div className="flex shrink-0 items-center gap-1.5">{right}</div>
          ) : null}
        </div>
      ) : null}
      {description ? (
        <p className="mb-2 text-xs text-ink/45">{description}</p>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
