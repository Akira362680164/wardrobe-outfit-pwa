export const SEASON_VALUES = ["spring", "summer", "autumn", "winter", "all"] as const;

export type Season = (typeof SEASON_VALUES)[number];

export const SEASON_CATALOG: ReadonlyArray<{ value: Season; label: string }> = [
  { value: "all", label: "四季" },
  { value: "spring", label: "春" },
  { value: "summer", label: "夏" },
  { value: "autumn", label: "秋" },
  { value: "winter", label: "冬" },
] as const;

export const SEASON_LABELS: Readonly<Record<Season, string>> = {
  all: "四季",
  spring: "春",
  summer: "夏",
  autumn: "秋",
  winter: "冬",
};

export function getSeasonLabel(value: string): string {
  return SEASON_LABELS[value as Season] ?? value;
}
