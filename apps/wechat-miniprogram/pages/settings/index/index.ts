import { hasMiniMaxKey } from "../../../services/ai";

Page({
  data: {
    profileCopy: "后续接入 App 端穿衣画像；小程序当前仅同步服务器衣橱和穿搭数据。",
    aiPhotoCopy: "照片仅在用户主动触发 AI 能力时发送；当前试穿预览仍未开放。",
    aiStatusText: "未配置",
    titleTopRpx: 0,
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "设置" });
    this.setData({ titleTopRpx: getTitleTopRpx() });
    setCustomTabBarSelected(this, 3);
  },

  onShow() {
    setCustomTabBarSelected(this, 3);
    this.setData({ aiStatusText: hasMiniMaxKey() ? "已配置" : "未配置" });
  },

  onReady() {
    setCustomTabBarSelected(this, 3);
  },

  openSection(event: { currentTarget: { dataset: { url?: string } } }) {
    const url = event.currentTarget.dataset.url;
    if (url) wx.navigateTo({ url });
  },
});

function setCustomTabBarSelected(page: unknown, selected: number) {
  const pageWithTabBar = page as { getTabBar?: () => ({ setData?: (data: { selected: number }) => void } | null) };
  const tabBar = pageWithTabBar.getTabBar?.();
  if (tabBar && typeof tabBar.setData === "function") tabBar.setData({ selected });
}

function getTitleTopRpx() {
  const systemInfo = wx.getSystemInfoSync();
  const menuRect = (wx as unknown as { getMenuButtonBoundingClientRect?: () => { top?: number } }).getMenuButtonBoundingClientRect?.();
  const windowWidth = (systemInfo as WechatMiniprogram.SystemInfo & { windowWidth?: number }).windowWidth || 375;
  const pixelRatio = 750 / windowWidth;
  return Math.round((menuRect?.top ?? (systemInfo.statusBarHeight ?? 0) + 8) * pixelRatio);
}
