import { ICON_PATHS, ICON_TONES, type UiIconName, type UiIconTone } from "./icons";

declare const Component: any;

function safeIconSize(size: number): number {
  return Number.isFinite(size) && size > 0 ? size : 40;
}

function buildIconStyle(size: number) {
  const safeSize = Number.isFinite(size) && size > 0 ? size : 40;
  return `width:${safeSize}rpx;height:${safeSize}rpx;`;
}

function safeTone(value: string): UiIconTone {
  return ICON_TONES.includes(value as UiIconTone) ? value as UiIconTone : "ink";
}

function resolveIcon(name: UiIconName, tone: UiIconTone): string {
  return (ICON_PATHS[name] ?? ICON_PATHS.home)[tone];
}

Component({
  properties: {
    name: { type: String, value: "home" },
    src: { type: String, value: "" },
    size: { type: Number, value: 40 },
    tone: { type: String, value: "ink" },
    label: { type: String, value: "" },
    spin: { type: Boolean, value: false },
  },
  data: { iconSrc: "", iconStyle: "" },
  observers: {
    "name, src, size, tone": function updateIcon(this: any, name: UiIconName, src: string, size: number, tone: string) {
      const safeIconTone = safeTone(tone);
      this.setData({
        iconSrc: src || resolveIcon(name, safeIconTone),
        iconStyle: buildIconStyle(size),
      });
    },
  },
  lifetimes: {
    attached(this: any) {
      const { name, src, size, tone } = this.properties as { name: UiIconName; src: string; size: number; tone: string };
      const safeIconTone = safeTone(tone);
      this.setData({
        iconSrc: src || resolveIcon(name, safeIconTone),
        iconStyle: buildIconStyle(size),
      });
    },
  },
});
