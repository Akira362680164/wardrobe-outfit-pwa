"use client";

import type { ColorInfo } from "@/lib/types";
import type { IntakeSourceBadgeLabel } from "@/components/intake-source-badge";
import { ItemColorFields } from "@/components/item/color-fields";

interface IntakeColorModeEditorProps {
  colors: ColorInfo;
  sourceLabel?: IntakeSourceBadgeLabel;
  onChange(input: ColorInfo): void;
}

export function IntakeColorModeEditor({
  colors,
  sourceLabel,
  onChange,
}: IntakeColorModeEditorProps) {
  return (
    <ItemColorFields
      mode="edit"
      colors={colors}
      sourceLabel={sourceLabel}
      onChange={onChange}
    />
  );
}
