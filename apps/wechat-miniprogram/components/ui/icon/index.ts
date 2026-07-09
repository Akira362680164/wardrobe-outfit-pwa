import { ICON_GLYPHS, type UiIconName } from "./icons";

declare const Component: any;

function buildIconStyle(size: number) {
  const safeSize = Number.isFinite(size) && size > 0 ? size : 40;
  return `width:${safeSize}rpx;height:${safeSize}rpx;font-size:${safeSize}rpx;line-height:${safeSize}rpx;`;
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
  data: { iconGlyph: "", iconStyle: "" },
  observers: {
    "name, src, size, color": function updateIcon(this: any, name: UiIconName, _src: string, size: number) {
      this.setData({ iconGlyph: ICON_GLYPHS[name] || ICON_GLYPHS.home, iconStyle: buildIconStyle(size) });
    },
  },
  lifetimes: {
    attached(this: any) {
      const { name, size } = this.properties as { name: UiIconName; size: number };
      this.setData({ iconGlyph: ICON_GLYPHS[name] || ICON_GLYPHS.home, iconStyle: buildIconStyle(size) });
    },
  },
});
