#!/usr/bin/env tsx
/**
 * v2.0.8-test sync fix verification script.
 * Tests all P0/P1 findings from sync-report.md against the live server.
 * Uses direct API calls with a registered test account.
 */

const BASE_URL = process.env.WARDROBE_API_URL ?? "http://111.231.98.86";
const DEVICE_ID = `test-fix-verify-${Date.now()}`;

interface TestResult {
  name: string;
  finding: string;
  status: "PASS" | "FAIL";
  detail: string;
}

const results: TestResult[] = [];

function record(name: string, finding: string, ok: boolean, detail: string) {
  results.push({ name, finding, status: ok ? "PASS" : "FAIL", detail });
  console.log(`${ok ? "✅" : "❌"} ${name}: ${detail}`);
}

async function api(path: string, body: unknown, accessToken?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
    headers["X-Wardrobe-Device-Id"] = DEVICE_ID;
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`${res.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  console.log("=== v2.0.8-test Sync Fix Verification ===\n");

  // 1. Register test user
  console.log("--- Step 1: Register test user ---");
  const phone = `+86138${String(Date.now()).slice(-8)}`;
  const password = "testpassword123";
  let accessToken: string;

  try {
    const reg = await api("/api/auth/register", {
      phone,
      password,
      deviceId: DEVICE_ID,
      deviceLabel: "fix-verification-test",
    });
    accessToken = reg.accessToken;
    record("Register", "", true, `Registered ${phone}`);
  } catch (err) {
    record("Register", "", false, `Failed: ${err}`);
    return;
  }

  const garmentId = crypto.randomUUID();
  const locationId = crypto.randomUUID();
  const outfitId = crypto.randomUUID();
  const wishlistId = crypto.randomUUID();
  const planId = crypto.randomUUID();
  const profileId = crypto.randomUUID();

  // 2. Push all 6 entity types with full payloads
  console.log("\n--- Step 2: Push all entity types ---");
  const mutations = [
    {
      mutationId: crypto.randomUUID(),
      entityType: "garment" as const,
      entityId: garmentId,
      operation: "create" as const,
      payload: { name: "测试羽绒服", colors: ["#FF0000", "#000000"], category: "outerwear", note: "轻薄款", season: "winter" },
      createdAt: new Date().toISOString(),
      attemptCount: 0,
    },
    {
      mutationId: crypto.randomUUID(),
      entityType: "closetLocation" as const,
      entityId: locationId,
      operation: "create" as const,
      payload: { dexieId: "custom-test-location", name: "次卧衣柜", note: "次卧右侧推拉门", sortOrder: 2 },
      createdAt: new Date().toISOString(),
      attemptCount: 0,
    },
    {
      mutationId: crypto.randomUUID(),
      entityType: "outfit" as const,
      entityId: outfitId,
      operation: "create" as const,
      payload: { name: "冬日暖阳套装", itemIds: [garmentId], coverImageRef: "img/cover-ref" },
      createdAt: new Date().toISOString(),
      attemptCount: 0,
    },
    {
      mutationId: crypto.randomUUID(),
      entityType: "wishlistItem" as const,
      entityId: wishlistId,
      operation: "create" as const,
      payload: { name: "想要的马丁靴", note: "黑色 38码", buyBeforeDate: "2026-08-01" },
      createdAt: new Date().toISOString(),
      attemptCount: 0,
    },
    {
      mutationId: crypto.randomUUID(),
      entityType: "tripPlan" as const,
      entityId: planId,
      operation: "create" as const,
      payload: { name: "东京旅行", startDate: "2026-08-10", endDate: "2026-08-15", notes: "5天行程" },
      createdAt: new Date().toISOString(),
      attemptCount: 0,
    },
    {
      mutationId: crypto.randomUUID(),
      entityType: "profile" as const,
      entityId: profileId,
      operation: "create" as const,
      payload: { profileType: "tryOn", enabled: true, fitGender: "male", referenceImageCloudRef: "img/ref-001" },
      createdAt: new Date().toISOString(),
      attemptCount: 0,
    },
  ];

  try {
    const pushResp = await api("/api/sync/push", {
      deviceId: DEVICE_ID,
      mutations,
    }, accessToken);
    const allAccepted = pushResp.results.every((r: {status: string}) => r.status === "accepted");
    record(
      "Push all entities",
      "P0-8, P0-9, P1-3",
      allAccepted,
      `${pushResp.results.length}/6 accepted`,
    );
  } catch (err) {
    record("Push all entities", "P0-8, P0-9, P1-3", false, `Push failed: ${err}`);
    return;
  }

  // 3. Bootstrap and verify payloads
  console.log("\n--- Step 3: Bootstrap (verify payload preservation) ---");
  try {
    const bootstrap = await api("/api/sync/bootstrap", {
      deviceId: DEVICE_ID,
      workspaceSchemaVersion: 1,
    }, accessToken);

    const ents = bootstrap.entities;
    const garment = ents.garments?.find((g: {id: string}) => g.id === garmentId);
    const location = ents.closetLocations?.find((l: {id: string}) => l.id === locationId);
    const outfit = ents.outfits?.find((o: {id: string}) => o.id === outfitId);
    const wishlist = ents.wishlistItems?.find((w: {id: string}) => w.id === wishlistId);
    const plan = (ents.tripPlans ?? []).concat(ents.outfitPlans ?? []).find((p: {id: string}) => p.id === planId);
    const profile = ents.profiles?.find((p: {id: string}) => p.id === profileId);

    // P0-9: Garment payload preserved
    record("Garment payload", "P0-9",
      garment?.payload?.name === "测试羽绒服" && garment?.payload?.category === "outerwear",
      garment ? `name=${garment.payload.name} category=${garment.payload.category}` : "not found");

    // P0-8: Location payload preserved
    record("Location payload", "P0-8",
      location?.payload?.name === "次卧衣柜" && location?.payload?.note === "次卧右侧推拉门" && location?.payload?.sortOrder === 2,
      location ? `name=${location.payload.name}` : "not found");

    // Outfit
    record("Outfit payload", "",
      outfit?.payload?.name === "冬日暖阳套装",
      outfit ? `name=${outfit.payload.name}` : "not found");

    // Wishlist
    record("Wishlist payload", "",
      wishlist?.payload?.name === "想要的马丁靴",
      wishlist ? `name=${wishlist.payload.name}` : "not found");

    // Plan
    record("Plan payload", "P1-2",
      plan?.payload?.name === "东京旅行",
      plan ? `name=${plan.payload.name}` : "not found");

    // P1-3: Profile in bootstrap
    record("Profile in bootstrap", "P1-3",
      profile?.payload?.fitGender === "male" && profile?.payload?.enabled === true,
      profile ? `fitGender=${profile.payload.fitGender} enabled=${profile.payload.enabled}` : "not found");
  } catch (err) {
    record("Bootstrap", "P0-8, P0-9, P1-3", false, `Bootstrap failed: ${err}`);
  }

  // 4. Pull with null cursor (P1-4 fix)
  console.log("\n--- Step 4: Pull (cursor validation) ---");
  try {
    const pullNull = await api("/api/sync/pull", {
      cursor: null,
      limit: 500,
    }, accessToken);
    record("Pull null cursor", "P1-4",
      Array.isArray(pullNull.changes) && pullNull.changes.length > 0,
      `${pullNull.changes?.length ?? 0} changes`);

    // Pull with bootstrap cursor
    const bootstrap = await api("/api/sync/bootstrap", {
      deviceId: DEVICE_ID,
      workspaceSchemaVersion: 1,
    }, accessToken);
    const cursor = bootstrap.serverCursor;

    const pullWithCursor = await api("/api/sync/pull", {
      cursor,
      limit: 500,
    }, accessToken);
    record("Pull bootstrap cursor", "P1-4",
      Array.isArray(pullWithCursor.changes),
      `${pullWithCursor.changes?.length ?? 0} changes (hasMore=${pullWithCursor.hasMore})`);
  } catch (err) {
    record("Pull cursor", "P1-4", false, `Pull failed: ${err}`);
  }

  // Summary
  console.log("\n=== Summary ===");
  const pass = results.filter(r => r.status === "PASS").length;
  const fail = results.filter(r => r.status === "FAIL").length;
  console.log(`PASS: ${pass} / FAIL: ${fail} / TOTAL: ${results.length}`);

  const failed = results.filter(r => r.status === "FAIL");
  if (failed.length > 0) {
    console.log("\nFailed tests:");
    for (const f of failed) {
      console.log(`  ❌ ${f.name} (${f.finding}): ${f.detail}`);
    }
  } else {
    console.log("\nAll tests passed!");
  }

  // Output JSON for CI
  console.log("\n--- JSON ---");
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => {
  console.error("Test script error:", err);
  process.exit(1);
});
