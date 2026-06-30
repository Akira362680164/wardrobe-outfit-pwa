import assert from "node:assert/strict";

import {
  collectLegacyDatabaseNames,
  isLegacyBusinessCacheName,
  purgeLegacyLocalBusinessData,
} from "../src/lib/online/purge-local-business-data";

assert.deepEqual(
  collectLegacyDatabaseNames(
    [{ name: "wardrobe_account_b" }, { name: "other" }, { name: "wardrobe-imgcache-a" }],
    ["wardrobe_account_b", "wardrobe_account_c"],
  ),
  ["wardrobe-imgcache-a", "wardrobe_account_b", "wardrobe_account_c"],
);
assert.equal(isLegacyBusinessCacheName("wardrobe-assets-user"), true);
assert.equal(isLegacyBusinessCacheName("next-data"), false);

async function main() {
  const values = new Map<string, string>([["wardrobe-account-workspace-registry-v1", JSON.stringify({
    activeDbName: "wardrobe_account_registry",
    workspaces: {},
  })]]);
  const deletedDatabases: string[] = [];
  const deletedCaches: string[] = [];
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const result = await purgeLegacyLocalBusinessData({
    storage,
    listDatabases: async () => [{ name: "wardrobe-imgcache-user" }],
    deleteDatabase: async (name) => { deletedDatabases.push(name); },
    listCaches: async () => ["wardrobe-assets-user", "next-data"],
    deleteCache: async (name) => { deletedCaches.push(name); return true; },
  });

  assert.equal(result.registryRemoved, true);
  assert.deepEqual(deletedDatabases, ["wardrobe-imgcache-user", "wardrobe_account_registry"]);
  assert.deepEqual(deletedCaches, ["wardrobe-assets-user"]);
  assert.equal(values.get("wardrobe-online-only-purge-v1"), "done");
  assert.equal((await purgeLegacyLocalBusinessData({ storage })).alreadyPurged, true);
  console.log("online-only purge tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
