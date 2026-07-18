declare const Component: any;
declare function getCurrentPages(): Array<{ route?: string }>;

const tabs = [
  { key: "home", label: "首页", url: "/pages/home/index", icon: "home" },
  { key: "outfits", label: "穿搭", url: "/pages/outfits/index/index", icon: "sparkles" },
  { key: "wishlist", label: "种草", url: "/pages/wishlist/index/index", icon: "shopping-bag" },
  { key: "settings", label: "设置", url: "/pages/settings/index/index", icon: "settings" },
];

Component({
  data: { selected: -1, tabs, hidden: false, motionReady: false },
  lifetimes: {
    attached(this: any) {
      this.syncSelected();
    },
  },
  pageLifetimes: {
    show(this: any) {
      this.switchingTab = false;
      this.syncSelected();
    },
  },
  methods: {
    commitSelected(this: any, selected: number) {
      if (!Number.isInteger(selected) || selected < 0 || selected >= tabs.length) return;
      if (selected === Number(this.data.selected)) {
        if (this.selectionRenderPending) return;
        this.enableMotionAfterRender();
        return;
      }
      const selectionGeneration = Number(this.selectionGeneration || 0) + 1;
      this.selectionGeneration = selectionGeneration;
      this.selectionRenderPending = true;
      this.setData({ selected, motionReady: false }, () => {
        if (selectionGeneration !== this.selectionGeneration) return;
        this.selectionRenderPending = false;
        this.enableMotionAfterRender();
      });
    },
    enableMotionAfterRender(this: any) {
      if (this.data.motionReady || Number(this.data.selected) < 0) return;
      this.setData({ motionReady: true });
    },
    syncSelected(this: any) {
      const pages = getCurrentPages();
      const current = pages[pages.length - 1]?.route;
      const selected = tabs.findIndex((tab) => tab.url === `/${current}`);
      this.commitSelected(selected);
    },
    selectTab(this: any, selected: number) {
      this.commitSelected(Number(selected));
    },
    switchTab(this: any, event: any) {
      const { index, url } = event.currentTarget.dataset;
      if (!url) return;
      const selected = Number(index) || 0;
      if (selected === Number(this.data.selected)) return;
      if (this.switchingTab) return;
      this.switchingTab = true;
      (wx.switchTab as any)({
        url,
        fail: () => {
          this.switchingTab = false;
        },
      });
    },
    openCreate(this: any) {
      const pages = getCurrentPages() as Array<{ openCreateSheet?: () => void }>;
      const page = pages[pages.length - 1];
      if (typeof page?.openCreateSheet === "function") {
        page.openCreateSheet();
        return;
      }
      wx.navigateTo({ url: "/pages/intake/camera/index" });
    },
  },
});

export {};
