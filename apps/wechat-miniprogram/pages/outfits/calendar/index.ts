Page({
  data: {
    monthTitle: "",
    weekdays: ["一", "二", "三", "四", "五", "六", "日"],
    days: [] as Array<{ key: string; label: string; muted: boolean; active: boolean }>,
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "套装" });
    this.buildCalendar();
  },

  buildCalendar() {
    const current = new Date();
    const year = current.getFullYear();
    const month = current.getMonth();
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - offset);
    const days = Array.from({ length: 35 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return {
        key: `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`,
        label: String(day.getDate()),
        muted: day.getMonth() !== month,
        active: day.toDateString() === current.toDateString(),
      };
    });
    this.setData({ monthTitle: `${year}年${month + 1}月`, days });
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  openCompose() {
    wx.navigateTo({ url: "/pages/outfits/compose/index" });
  },
});
