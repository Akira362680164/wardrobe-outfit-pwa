declare const Component: any;
declare const wx: any;
declare function getCurrentPages(): Array<{ getTabBar?: () => ({ setData?: (data: { hidden: boolean }) => void } | null) }>;

type CreateActionType = "add_single_item" | "create_outfit" | "add_wishlist_item";

const ROUTES: Record<CreateActionType, string> = {
  add_single_item: "/pages/intake/camera/index",
  create_outfit: "/pages/outfits/compose/index",
  add_wishlist_item: "/pages/wishlist/edit/index",
};

Component({
  properties: {
    open: { type: Boolean, value: false },
    active: { type: String, value: "add_single_item" },
  },
  observers: {
    open(open: boolean) {
      setTabBarHidden(Boolean(open));
    },
  },
  methods: {
    onClose(this: any) {
      setTabBarHidden(false);
      this.triggerEvent("close");
    },
    onSelect(this: any, event: { currentTarget: { dataset: { type?: CreateActionType } } }) {
      const type = event.currentTarget.dataset.type;
      if (!type || !ROUTES[type]) return;
      setTabBarHidden(false);
      this.triggerEvent("close");
      wx.navigateTo({ url: ROUTES[type] });
    },
  },
});

function setTabBarHidden(hidden: boolean) {
  const pages = getCurrentPages();
  const tabBar = pages[pages.length - 1]?.getTabBar?.();
  tabBar?.setData?.({ hidden });
}

export {};
