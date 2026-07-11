export interface CapsuleGeometry {
  topRpx: number;
  heightRpx: number;
  rightInsetRpx: number;
  contentTopRpx: number;
}

export function getCapsuleGeometry(): CapsuleGeometry {
  const system = wx.getSystemInfoSync() as WechatMiniprogram.SystemInfo & { windowWidth?: number };
  const width = Math.max(1, system.windowWidth ?? 375);
  const scale = 750 / width;
  const menu = (wx as typeof wx & {
    getMenuButtonBoundingClientRect?: () => { top: number; height: number; left: number };
  }).getMenuButtonBoundingClientRect?.();
  const statusTop = system.statusBarHeight ?? 0;
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
