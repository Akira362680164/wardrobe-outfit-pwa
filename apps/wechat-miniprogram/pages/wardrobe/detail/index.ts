Page({
  data: {
    title: "单品详情",
    item: {
      name: "单品详情样例",
      meta: "鞋履 · 春 / 夏 / 秋 / 冬 · 休闲 / 户外",
      recordText: "暂无穿着记录",
      savedText: "已保存到衣橱",
      closetText: "默认衣橱",
      purchaseDate: "未记录",
      statusText: "可穿",
      primaryColor: "白",
      secondaryColor: "黑",
      temperatureText: "未识别",
      formalityText: "1/5",
      warmthText: "1/5",
      materialText: "网布鞋面 + 合成革",
      fitText: "中性版型",
      notes: "当前小程序单品详情仍使用占位数据，后续接入线上详情 API 后直接替换字段来源。",
    },
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "单品详情" });
  },
});
