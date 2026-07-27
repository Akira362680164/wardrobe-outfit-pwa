const DEFAULT_FONT_SIZE_SETTING = 16;
const MAX_FONT_SCALE = 1.5;

const BASE_FONT_TOKENS = {
  title: 44,
  section: 34,
  body: 28,
  caption: 24,
  label: 22,
} as const;

export function accessibilityFontStyle(fontSizeSetting: number): string {
  const normalizedSetting = Number.isFinite(fontSizeSetting)
    ? fontSizeSetting
    : DEFAULT_FONT_SIZE_SETTING;
  const scale = Math.min(
    MAX_FONT_SCALE,
    Math.max(1, normalizedSetting / DEFAULT_FONT_SIZE_SETTING),
  );
  return Object.entries(BASE_FONT_TOKENS)
    .map(([token, size]) => `--font-${token}:${formatRpx(size * scale)}rpx`)
    .join(";");
}

export function currentAccessibilityFontStyle(): string {
  const systemInfo = (wx as typeof wx & {
    getAppBaseInfo?: () => { fontSizeSetting?: number };
  }).getAppBaseInfo?.();
  return accessibilityFontStyle(
    Number(systemInfo?.fontSizeSetting ?? DEFAULT_FONT_SIZE_SETTING),
  );
}

function formatRpx(value: number): string {
  return Number(value.toFixed(2)).toString();
}
