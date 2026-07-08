export const ICON_PATHS = {
  home: "/assets/icons/home.svg",
  wardrobe: "/assets/icons/wardrobe.svg",
  camera: "/assets/icons/camera.svg",
  "camera-plus": "/assets/icons/camera-plus.svg",
  layers: "/assets/icons/layers.svg",
  sparkles: "/assets/icons/sparkles.svg",
  "shopping-bag": "/assets/icons/shopping-bag.svg",
  user: "/assets/icons/user.svg",
  settings: "/assets/icons/settings.svg",
  "chevron-right": "/assets/icons/chevron-right.svg",
  "chevron-down": "/assets/icons/chevron-down.svg",
  search: "/assets/icons/search.svg",
  "bar-chart-3": "/assets/icons/bar-chart-3.svg",
  "wand-sparkles": "/assets/icons/wand-sparkles.svg",
  plus: "/assets/icons/plus.svg",
  x: "/assets/icons/x.svg",
  check: "/assets/icons/check.svg",
  loader: "/assets/icons/loader.svg",
} as const;

export type UiIconName = keyof typeof ICON_PATHS;
