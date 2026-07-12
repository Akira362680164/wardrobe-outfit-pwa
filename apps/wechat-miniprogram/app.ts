import type { SessionState } from "./stores/session";
import { bootstrapSession } from "./services/session-bootstrap";

export interface WardrobeMiniAppGlobalData {
  apiBaseUrl: string;
  safeAreaBottom: number;
  statusBarHeight: number;
  sessionReady: Promise<SessionState | null>;
}

const globalData: WardrobeMiniAppGlobalData = {
  apiBaseUrl: "https://api.zhengfangapps.cloud",
  safeAreaBottom: 0,
  statusBarHeight: 0,
  sessionReady: Promise.resolve(null),
};

App<{
  globalData: WardrobeMiniAppGlobalData;
}>({
  globalData,

  onLaunch() {
    globalData.sessionReady = bootstrapSession();

    const systemInfo = wx.getSystemInfoSync();
    globalData.statusBarHeight = systemInfo.statusBarHeight ?? 0;
    globalData.safeAreaBottom = Math.max(
      0,
      (systemInfo.screenHeight ?? 0) - (systemInfo.safeArea?.bottom ?? systemInfo.screenHeight ?? 0),
    );
  },
});
