import { ICON_GLYPHS, ICON_PATHS, type UiIconName } from "./icons";

declare const Component: any;

function safeIconSize(size: number): number {
  return Number.isFinite(size) && size > 0 ? size : 40;
}

function buildIconStyle(size: number, color = "currentColor") {
  const safeSize = Number.isFinite(size) && size > 0 ? size : 40;
  const filters: Record<string, string> = {
    "#fffffc": "filter:brightness(0) invert(1);",
    white: "filter:brightness(0) invert(1);",
    "#355c7d": "filter:brightness(0) saturate(100%) invert(31%) sepia(18%) saturate(965%) hue-rotate(169deg) brightness(86%) contrast(88%);",
    "#dc2626": "filter:brightness(0) saturate(100%) invert(22%) sepia(92%) saturate(3063%) hue-rotate(346deg) brightness(89%) contrast(91%);",
    "#b42318": "filter:brightness(0) saturate(100%) invert(23%) sepia(81%) saturate(2622%) hue-rotate(349deg) brightness(82%) contrast(91%);",
  };
  const filter = filters[color.toLowerCase()] ?? "";
  return `width:${safeSize}rpx;height:${safeSize}rpx;font-size:${safeSize}rpx;line-height:${safeSize}rpx;${filter}`;
}

Component({
  properties: {
    name: { type: String, value: "home" },
    src: { type: String, value: "" },
    size: { type: Number, value: 40 },
    color: { type: String, value: "currentColor" },
    label: { type: String, value: "" },
    spin: { type: Boolean, value: false },
  },
  data: { iconGlyph: "", iconSrc: "", iconStyle: "" },
  observers: {
    "name, src, size, color": function updateIcon(this: any, name: UiIconName, src: string, size: number, color: string) {
      const iconSrc = src || ICON_PATHS[name] || "";
      this.setData({
        iconGlyph: ICON_GLYPHS[name] || ICON_GLYPHS.home,
        iconSrc,
        iconStyle: buildIconStyle(size, color),
      });
    },
  },
  lifetimes: {
    attached(this: any) {
      const { name, src, size, color } = this.properties as { name: UiIconName; src: string; size: number; color: string };
      const iconSrc = src || ICON_PATHS[name] || "";
      this.setData({
        iconGlyph: ICON_GLYPHS[name] || ICON_GLYPHS.home,
        iconSrc,
        iconStyle: buildIconStyle(size, color),
      });
    },
  },
});
