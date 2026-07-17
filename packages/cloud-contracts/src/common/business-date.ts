export const WARDORA_BUSINESS_TIMEZONE = "Asia/Shanghai" as const;

const BUSINESS_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: WARDORA_BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function wardoraBusinessDate(value: Date | string | number): string {
  const instant = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(instant.getTime())) throw new RangeError("invalid business date instant");
  return BUSINESS_DATE_FORMATTER.format(instant);
}

export function wardoraBusinessDateChanged(previous: Date | string | number, current: Date | string | number): boolean {
  return wardoraBusinessDate(previous) !== wardoraBusinessDate(current);
}
