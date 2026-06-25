// v1.1.7 4A: AppRoute 导航模型纯函数测试
import { strict as assert } from "node:assert";
import {
  getMainTabFromRoute,
  getBackRoute,
  isDetailRoute,
  isWishlistRouteName,
  routeToDebugLabel,
} from "../src/lib/app-route";
import type { AppRoute } from "../src/lib/app-route";

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

// ===== getMainTabFromRoute =====
console.log("\n=== getMainTabFromRoute ===");
check("wardrobe_home → wardrobe", getMainTabFromRoute({ name: "wardrobe_home" }) === "wardrobe");
check("garment_detail returnTo wardrobe_home → wardrobe", getMainTabFromRoute({ name: "garment_detail", itemId: 1, returnTo: "wardrobe_home" }) === "wardrobe");
check("garment_detail returnTo wishlist_purchased → shopping", getMainTabFromRoute({ name: "garment_detail", itemId: 2, returnTo: "wishlist_purchased" }) === "shopping");
check("garment_detail returnTo wishlist_archived → shopping", getMainTabFromRoute({ name: "garment_detail", itemId: 3, returnTo: "wishlist_archived" }) === "shopping");
check("outfit_home → recommend", getMainTabFromRoute({ name: "outfit_home" }) === "recommend");
check("outfit_detail → recommend", getMainTabFromRoute({ name: "outfit_detail", outfitId: "o1", returnTo: "outfit_home" }) === "recommend");
check("outfit_calendar → recommend", getMainTabFromRoute({ name: "outfit_calendar" }) === "recommend");
check("wishlist_home → shopping", getMainTabFromRoute({ name: "wishlist_home" }) === "shopping");
check("wishlist_purchased → shopping", getMainTabFromRoute({ name: "wishlist_purchased" }) === "shopping");
check("wishlist_rejected → shopping", getMainTabFromRoute({ name: "wishlist_rejected" }) === "shopping");
check("wishlist_archived → shopping", getMainTabFromRoute({ name: "wishlist_archived" }) === "shopping");
check("settings_home → settings", getMainTabFromRoute({ name: "settings_home" }) === "settings");
check("account_management → settings", getMainTabFromRoute({ name: "account_management" }) === "settings");
check("change_password → settings", getMainTabFromRoute({ name: "change_password" }) === "settings");

// ===== getBackRoute =====
console.log("\n=== getBackRoute ===");
check("garment_detail + wishlist_purchased → wishlist_purchased",
  JSON.stringify(getBackRoute({ name: "garment_detail", itemId: 10, returnTo: "wishlist_purchased" })) === JSON.stringify({ name: "wishlist_purchased" }));
check("garment_detail + wishlist_rejected → wishlist_rejected",
  JSON.stringify(getBackRoute({ name: "garment_detail", itemId: 11, returnTo: "wishlist_rejected" })) === JSON.stringify({ name: "wishlist_rejected" }));
check("garment_detail + wishlist_archived → wishlist_archived",
  JSON.stringify(getBackRoute({ name: "garment_detail", itemId: 12, returnTo: "wishlist_archived" })) === JSON.stringify({ name: "wishlist_archived" }));
check("garment_detail + wardrobe_home → wardrobe_home",
  JSON.stringify(getBackRoute({ name: "garment_detail", itemId: 13, returnTo: "wardrobe_home" })) === JSON.stringify({ name: "wardrobe_home" }));
check("garment_detail + outfit_home → wardrobe_home",
  JSON.stringify(getBackRoute({ name: "garment_detail", itemId: 14, returnTo: "outfit_home" })) === JSON.stringify({ name: "wardrobe_home" }));
check("outfit_detail + outfit_calendar → outfit_calendar",
  JSON.stringify(getBackRoute({ name: "outfit_detail", outfitId: "o1", returnTo: "outfit_calendar" })) === JSON.stringify({ name: "outfit_calendar" }));
check("outfit_detail + outfit_home → outfit_home",
  JSON.stringify(getBackRoute({ name: "outfit_detail", outfitId: "o2", returnTo: "outfit_home" })) === JSON.stringify({ name: "outfit_home" }));
check("outfit_detail + returnRoute → garment_detail pairing",
  JSON.stringify(getBackRoute({
    name: "outfit_detail",
    outfitId: "o3",
    returnTo: "wardrobe_home",
    returnRoute: { name: "garment_detail", itemId: 99, returnTo: "wardrobe_home", initialTab: "pairing" },
  })) === JSON.stringify({ name: "garment_detail", itemId: 99, returnTo: "wardrobe_home", initialTab: "pairing" }));
check("wishlist_purchased → wishlist_home",
  JSON.stringify(getBackRoute({ name: "wishlist_purchased" })) === JSON.stringify({ name: "wishlist_home" }));
check("wishlist_rejected → wishlist_home",
  JSON.stringify(getBackRoute({ name: "wishlist_rejected" })) === JSON.stringify({ name: "wishlist_home" }));
check("wishlist_archived → wishlist_home",
  JSON.stringify(getBackRoute({ name: "wishlist_archived" })) === JSON.stringify({ name: "wishlist_home" }));
check("outfit_calendar → outfit_home",
  JSON.stringify(getBackRoute({ name: "outfit_calendar" })) === JSON.stringify({ name: "outfit_home" }));
check("wardrobe_home → wardrobe_home",
  JSON.stringify(getBackRoute({ name: "wardrobe_home" })) === JSON.stringify({ name: "wardrobe_home" }));
check("outfit_home → outfit_home",
  JSON.stringify(getBackRoute({ name: "outfit_home" })) === JSON.stringify({ name: "outfit_home" }));
check("wishlist_home → wishlist_home",
  JSON.stringify(getBackRoute({ name: "wishlist_home" })) === JSON.stringify({ name: "wishlist_home" }));
check("settings_home → settings_home",
  JSON.stringify(getBackRoute({ name: "settings_home" })) === JSON.stringify({ name: "settings_home" }));
check("account_management → settings_home",
  JSON.stringify(getBackRoute({ name: "account_management" })) === JSON.stringify({ name: "settings_home" }));
check("change_password → account_management",
  JSON.stringify(getBackRoute({ name: "change_password" })) === JSON.stringify({ name: "account_management" }));

// ===== isDetailRoute =====
console.log("\n=== isDetailRoute ===");
check("garment_detail is detail", isDetailRoute({ name: "garment_detail", itemId: 1, returnTo: "wardrobe_home" }) === true);
check("outfit_detail is detail", isDetailRoute({ name: "outfit_detail", outfitId: "o1", returnTo: "outfit_home" }) === true);
check("wardrobe_home is not detail", isDetailRoute({ name: "wardrobe_home" }) === false);
check("wishlist_home is not detail", isDetailRoute({ name: "wishlist_home" }) === false);
check("outfit_calendar is not detail", isDetailRoute({ name: "outfit_calendar" }) === false);

// ===== isWishlistRouteName =====
console.log("\n=== isWishlistRouteName ===");
check("wishlist_home is wishlist", isWishlistRouteName("wishlist_home") === true);
check("wishlist_purchased is wishlist", isWishlistRouteName("wishlist_purchased") === true);
check("wardrobe_home is not wishlist", isWishlistRouteName("wardrobe_home") === false);
check("outfit_home is not wishlist", isWishlistRouteName("outfit_home") === false);

// ===== routeToDebugLabel =====
console.log("\n=== routeToDebugLabel ===");
check("debug label returns string", typeof routeToDebugLabel({ name: "wardrobe_home" }) === "string");
check("debug label garment_detail includes itemId", routeToDebugLabel({ name: "garment_detail", itemId: 42, returnTo: "wardrobe_home" }).includes("42"));
check("debug label outfit_detail includes outfitId", routeToDebugLabel({ name: "outfit_detail", outfitId: "abc", returnTo: "outfit_home" }).includes("abc"));
check("debug label account_management", routeToDebugLabel({ name: "account_management" }) === "账号管理");
check("debug label change_password", routeToDebugLabel({ name: "change_password" }) === "修改密码");

// ===== Summary =====
console.log(`\n${pass} passed, ${fail} failed`);

if (fail > 0) process.exit(1);
