export const ICON_PATHS = {
  home: "/assets/icons/home.svg",
  wardrobe: "/assets/icons/wardrobe.svg",
  "camera-plus": "/assets/icons/camera-plus.svg",
  sparkles: "/assets/icons/sparkles.svg",
  "shopping-bag": "/assets/icons/shopping-bag.svg",
  user: "/assets/icons/user.svg",
  settings: "/assets/icons/settings.svg",
  "chevron-right": "/assets/icons/chevron-right.svg",
  x: "/assets/icons/x.svg",
  check: "/assets/icons/check.svg",
  loader: "/assets/icons/loader.svg",
} as const;

export type UiIconName = keyof typeof ICON_PATHS;
