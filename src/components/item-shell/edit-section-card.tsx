"use client";

import type { ReactNode } from "react";
import { ItemSectionCard } from "@/components/item-shell/item-section-card";

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
  return <ItemSectionCard title={title} icon={icon} description={description} required={required} right={right} bodyClassName={bodyClassName} className={className}>{children}</ItemSectionCard>;
}
