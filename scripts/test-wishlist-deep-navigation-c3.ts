import assert from "node:assert/strict";

import {
  armWishlistIntakeNavigationHandoff,
  captureWishlistIntakeNavigationHandoff,
  clearWishlistIntakeNavigationHandoff,
  consumeWishlistIntakeNavigationHandoff,
  hasPendingWishlistIntakeNavigationHandoff,
} from "../src/components/wishlist-view-2.0";

clearWishlistIntakeNavigationHandoff();

const firstToken = captureWishlistIntakeNavigationHandoff({
  sourcePage: "purchased",
  mainFilter: "worth_buying",
  scrollTop: 384,
});
assert.equal(hasPendingWishlistIntakeNavigationHandoff(), true, "capture owns exactly one pending handoff");
assert.equal(consumeWishlistIntakeNavigationHandoff(), null, "unarmed intake failure cannot leak its source");
armWishlistIntakeNavigationHandoff(firstToken + 1);
assert.equal(consumeWishlistIntakeNavigationHandoff(), null, "a stale owner token cannot arm another flow");
armWishlistIntakeNavigationHandoff(firstToken);
assert.deepEqual(consumeWishlistIntakeNavigationHandoff(), {
  sourcePage: "purchased",
  mainFilter: "worth_buying",
  scrollTop: 384,
});
assert.equal(hasPendingWishlistIntakeNavigationHandoff(), false, "consume clears the one-shot handoff immediately");
assert.equal(consumeWishlistIntakeNavigationHandoff(), null, "a repeated mount cannot consume old navigation state");

const abandonedToken = captureWishlistIntakeNavigationHandoff({
  sourcePage: "archived",
  mainFilter: "consider",
  scrollTop: Number.NaN,
});
clearWishlistIntakeNavigationHandoff(abandonedToken);
assert.equal(hasPendingWishlistIntakeNavigationHandoff(), false, "owner unmount clears an unarmed/failed flow");
assert.equal(consumeWishlistIntakeNavigationHandoff(), null, "abandoned flow leaves no account/source residue");

const staleToken = captureWishlistIntakeNavigationHandoff({
  sourcePage: "rejected",
  mainFilter: "pending",
  scrollTop: 90,
});
const currentToken = captureWishlistIntakeNavigationHandoff({
  sourcePage: "home",
  mainFilter: "all",
  scrollTop: -50,
});
clearWishlistIntakeNavigationHandoff(staleToken);
assert.equal(hasPendingWishlistIntakeNavigationHandoff(), true, "stale cleanup cannot clear the current owner");
armWishlistIntakeNavigationHandoff(staleToken);
assert.equal(consumeWishlistIntakeNavigationHandoff(), null, "stale arm cannot expose a newer flow");
armWishlistIntakeNavigationHandoff(currentToken);
assert.equal(consumeWishlistIntakeNavigationHandoff(staleToken), null, "stale committed mount cannot consume a newer flow");
assert.equal(hasPendingWishlistIntakeNavigationHandoff(), true, "token mismatch leaves the current handoff owned");
assert.deepEqual(consumeWishlistIntakeNavigationHandoff(currentToken), {
  sourcePage: "home",
  mainFilter: "all",
  scrollTop: 0,
}, "capture clamps invalid scroll and keeps only the newest source");
assert.equal(hasPendingWishlistIntakeNavigationHandoff(), false);

console.log("C3 wishlist one-shot navigation handoff passed");
