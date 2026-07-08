declare const Component: any;

const tabs = [
  { key: "home", label: "首页", url: "/pages/home/index", icon: "home" },
  { key: "wardrobe", label: "衣橱", url: "/pages/wardrobe/index/index", icon: "wardrobe" },
  { key: "add", label: "添加", url: "/pages/intake/camera/index", icon: "camera-plus", center: true },
  { key: "outfits", label: "穿搭", url: "/pages/outfits/index/index", icon: "sparkles" },
  { key: "me", label: "我的", url: "/pages/settings/index/index", icon: "user" },
];

Component({
  data: { selected: 0, tabs },
  methods: {
    switchTab(this: any, event: any) {
      const { index, url } = event.currentTarget.dataset;
      if (!url) return;
      this.setData({ selected: index || 0 });
      wx.switchTab({ url });
    },
  },
});

export {};
