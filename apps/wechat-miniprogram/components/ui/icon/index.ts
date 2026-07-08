import { ICON_PATHS, type UiIconName } from "./icons";

declare const Component: any;

function buildIconStyle(src: string, size: number, color: string) {
  const safeSize = Number.isFinite(size) && size > 0 ? size : 40;
  return `width:${safeSize}rpx;height:${safeSize}rpx;color:${color};background-color:${color};--ui-icon-url:url("${src}");`;
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
  data: { iconStyle: "" },
  observers: {
    "name, src, size, color": function updateIcon(this: any, name: UiIconName, src: string, size: number, color: string) {
      const iconSrc = src || ICON_PATHS[name] || ICON_PATHS.home;
      this.setData({ iconStyle: buildIconStyle(iconSrc, size, color || "currentColor") });
    },
  },
  lifetimes: {
    attached(this: any) {
      const { name, src, size, color } = this.properties as { name: UiIconName; src: string; size: number; color: string };
      const iconSrc = src || ICON_PATHS[name] || ICON_PATHS.home;
      this.setData({ iconStyle: buildIconStyle(iconSrc, size, color || "currentColor") });
    },
  },
});
