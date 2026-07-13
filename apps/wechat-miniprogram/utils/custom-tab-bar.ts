type CustomTabBar = {
  setData?: (data: { selected?: number; hidden?: boolean }) => void;
  selectTab?: (selected: number) => void;
};

type PageWithCustomTabBar = {
  getTabBar?: () => CustomTabBar | null;
};

export function selectCustomTab(page: unknown, selected: number): void {
  const tabBar = customTabBarFor(page);
  if (tabBar?.selectTab) {
    tabBar.selectTab(selected);
    return;
  }
  tabBar?.setData?.({ selected });
}

export function setCustomTabHidden(page: unknown, hidden: boolean): void {
  customTabBarFor(page)?.setData?.({ hidden });
}

function customTabBarFor(page: unknown): CustomTabBar | null {
  return (page as PageWithCustomTabBar | undefined)?.getTabBar?.() ?? null;
}
