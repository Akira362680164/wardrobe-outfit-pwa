import { hasMiniMaxKey } from "../../../services/ai";
import { getCapsuleGeometry } from "../../../utils/capsule-layout";
import { selectCustomTab } from "../../../utils/custom-tab-bar";

Page({
  data: {
    aiStatusText: "未配置",
    titleTopRpx: 0,
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "设置" });
    this.setData({ titleTopRpx: getTitleTopRpx() });
    selectCustomTab(this, 3);
  },

  onShow() {
    selectCustomTab(this, 3);
    this.setData({ aiStatusText: hasMiniMaxKey() ? "已配置" : "未配置" });
  },

  onReady() {
    selectCustomTab(this, 3);
  },

  openSection(event: { currentTarget: { dataset: { url?: string } } }) {
    const url = event.currentTarget.dataset.url;
    if (url) wx.navigateTo({ url });
  },
});

function getTitleTopRpx() {
  return getCapsuleGeometry().topRpx;
}
