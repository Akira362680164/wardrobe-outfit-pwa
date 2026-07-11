import { hasMiniMaxKey } from "../../../services/ai";
import { getCapsuleGeometry } from "../../../utils/capsule-layout";

Page({
  data: {
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
  return getCapsuleGeometry().topRpx;
}
