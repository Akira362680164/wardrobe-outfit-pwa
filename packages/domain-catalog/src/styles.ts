export const STYLE_VALUES = ["casual", "sweet", "elegant", "commute", "outdoor", "dinner", "vacation"] as const;

export type GarmentStyle = (typeof STYLE_VALUES)[number];

export const STYLE_CATALOG: ReadonlyArray<{ value: GarmentStyle; label: string }> = [
  { value: "casual", label: "休闲" },
  { value: "sweet", label: "甜美" },
  { value: "elegant", label: "优雅" },
  { value: "commute", label: "通勤" },
  { value: "outdoor", label: "户外" },
  { value: "dinner", label: "约会/宴请" },
  { value: "vacation", label: "度假" },
] as const;

export const STYLE_LABELS: Readonly<Record<GarmentStyle, string>> =
  Object.fromEntries(STYLE_CATALOG.map((entry) => [entry.value, entry.label])) as Record<GarmentStyle, string>;

export function getStyleLabel(value: string): string {
  return STYLE_LABELS[value as GarmentStyle] ?? value;
}
