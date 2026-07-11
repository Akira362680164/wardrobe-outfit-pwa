declare const Component: any;
declare function getCurrentPages(): Array<{ route?: string }>;

const tabs = [
  { key: "wardrobe", label: "衣橱", url: "/pages/wardrobe/index/index", icon: "wardrobe" },
  { key: "outfits", label: "套装", url: "/pages/outfits/index/index", icon: "sparkles" },
  { key: "wishlist", label: "种草", url: "/pages/wishlist/index/index", icon: "shopping-bag" },
  { key: "settings", label: "设置", url: "/pages/settings/index/index", icon: "settings" },
];

Component({
  data: { selected: 0, tabs, hidden: false },
  lifetimes: {
    attached(this: any) {
      this.syncSelected();
      setTimeout(() => this.syncSelected(), 0);
      setTimeout(() => this.syncSelected(), 300);
    },
  },
  pageLifetimes: {
    show(this: any) {
      this.syncSelected();
      setTimeout(() => this.syncSelected(), 0);
    },
  },
  methods: {
    syncSelected(this: any) {
      const pages = getCurrentPages();
      const current = pages[pages.length - 1]?.route;
      const selected = tabs.findIndex((tab) => tab.url === `/${current}`);
      if (selected >= 0 && selected !== this.data.selected) this.setData({ selected });
    },
    switchTab(this: any, event: any) {
      const { index, url } = event.currentTarget.dataset;
      if (!url) return;
      const selected = Number(index) || 0;
      if (selected === Number(this.data.selected)) return;
      this.setData({ selected });
      wx.switchTab({ url });
    },
  },
});

export {};
