import { hydrateSession } from "./stores/session";
import { recoverSession } from "./services/http";

export interface WardrobeMiniAppGlobalData {
  apiBaseUrl: string;
  safeAreaBottom: number;
  statusBarHeight: number;
}

const globalData: WardrobeMiniAppGlobalData = {
  apiBaseUrl: "https://api.zhengfangapps.cloud",
  safeAreaBottom: 0,
  statusBarHeight: 0,
};

App<{
  globalData: WardrobeMiniAppGlobalData;
}>({
  globalData,

  onLaunch() {
    const session = hydrateSession();
    if (session?.refreshToken) void recoverSession().catch(() => undefined);

    const systemInfo = wx.getSystemInfoSync();
    globalData.statusBarHeight = systemInfo.statusBarHeight ?? 0;
    globalData.safeAreaBottom = Math.max(
      0,
      (systemInfo.screenHeight ?? 0) - (systemInfo.safeArea?.bottom ?? systemInfo.screenHeight ?? 0),
    );
  },
});
