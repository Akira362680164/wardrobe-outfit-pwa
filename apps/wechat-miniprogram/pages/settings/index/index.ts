Page({
  data: {
    profileCopy: "后续接入 App 端穿衣画像；小程序当前仅同步服务器衣橱和穿搭数据。",
    aiPhotoCopy: "照片仅在生成试穿图时使用；当前小程序暂不保存参考照片。",
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "设置" });
    setCustomTabBarSelected(this, 3);
  },

  onShow() {
    setCustomTabBarSelected(this, 3);
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
  const getTabBar = (page as { getTabBar?: () => ({ setData?: (data: { selected: number }) => void } | null) }).getTabBar;
  const tabBar = getTabBar?.();
  if (tabBar && typeof tabBar.setData === "function") tabBar.setData({ selected });
}
