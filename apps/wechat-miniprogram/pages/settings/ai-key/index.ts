import { clearMiniMaxSettings, loadMiniMaxSettings, saveMiniMaxSettings } from "../../../services/ai";

Page({
  data: {
    apiKey: "",
    apiHost: "https://api.minimaxi.com",
    model: "MiniMax-M3",
    timeoutMs: "60000",
    statusText: "未配置",
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "AI Key" });
    const settings = loadMiniMaxSettings();
    this.setData({
      apiKey: settings.apiKey,
      apiHost: settings.apiHost,
      model: settings.model,
      timeoutMs: String(settings.timeoutMs),
      statusText: settings.apiKey ? "已配置，本机保存" : "未配置",
    });
  },

  handleKeyInput(event: WechatMiniprogram.InputEvent) {
    this.setData({ apiKey: event.detail.value });
  },

  handleHostInput(event: WechatMiniprogram.InputEvent) {
    this.setData({ apiHost: event.detail.value });
  },

  handleModelInput(event: WechatMiniprogram.InputEvent) {
    this.setData({ model: event.detail.value });
  },

  save() {
    const timeoutMs = Number(this.data.timeoutMs) || 60000;
    saveMiniMaxSettings({
      apiKey: this.data.apiKey,
      apiHost: this.data.apiHost,
      model: this.data.model,
      timeoutMs,
    });
    this.setData({ statusText: this.data.apiKey.trim() ? "已配置，本机保存" : "未配置" });
    wx.showToast({ title: "AI 设置已保存", icon: "success" });
  },

  clear() {
    clearMiniMaxSettings();
    this.setData({
      apiKey: "",
      apiHost: "https://api.minimaxi.com",
      model: "MiniMax-M3",
      timeoutMs: "60000",
      statusText: "未配置",
    });
    wx.showToast({ title: "已清除", icon: "success" });
  },
});
