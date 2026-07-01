"use client";

import type { ReactNode } from "react";
import { ItemSectionCard } from "@/components/item-shell/item-section-card";

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
  return <ItemSectionCard title={title} icon={icon} right={right} bodyClassName={bodyClassName}>{children}</ItemSectionCard>;
}
