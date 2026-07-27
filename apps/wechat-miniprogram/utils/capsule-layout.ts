export interface CapsuleGeometry {
  topRpx: number;
  heightRpx: number;
  rightInsetRpx: number;
  contentTopRpx: number;
}

export interface CapsuleGeometryInput {
  windowWidth: number;
  statusBarHeight?: number;
  menu?: { top: number; height: number; left: number };
}

export interface SubPageTopBarLayout {
  rightSlotRpx: number;
  titleLeftRpx: number;
  titleRightRpx: number;
}

export function calculateCapsuleGeometry(input: CapsuleGeometryInput): CapsuleGeometry {
  const width = Math.max(1, input.windowWidth || 375);
  const scale = 750 / width;
  const menu = input.menu;
  const statusTop = input.statusBarHeight ?? 0;
  const top = menu?.top ?? statusTop + 8;
  const height = menu?.height ?? 32;
  const right = menu ? Math.max(0, width - menu.left) : 96;
  return {
    topRpx: Math.round(top * scale),
    heightRpx: Math.round(height * scale),
    rightInsetRpx: Math.round(right * scale),
    contentTopRpx: Math.round((top + height + 12) * scale),
  };
}

export function calculateSubPageTopBarLayout(
  geometry: CapsuleGeometry,
  hasRightAction: boolean,
  rightActionWidthRpx = 96,
): SubPageTopBarLayout {
  const rightSlotRpx = geometry.rightInsetRpx + 16;
  const safeRightRpx = hasRightAction
    ? rightSlotRpx + Math.max(72, rightActionWidthRpx) + 16
    : Math.max(96, rightSlotRpx);
  return {
    rightSlotRpx,
    titleLeftRpx: hasRightAction ? 96 : safeRightRpx,
    titleRightRpx: safeRightRpx,
  };
}

export function getCapsuleGeometry(): CapsuleGeometry {
  const windowInfo = wx.getWindowInfo();
  const menu = (wx as typeof wx & {
    getMenuButtonBoundingClientRect?: () => { top: number; height: number; left: number };
  }).getMenuButtonBoundingClientRect?.();
  return calculateCapsuleGeometry({
    windowWidth: windowInfo.windowWidth ?? 375,
    statusBarHeight: windowInfo.statusBarHeight,
    menu,
  });
}
