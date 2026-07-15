import { randomUUID } from "node:crypto";

import argon2 from "argon2";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
const baseUrl = process.env.HTTP_E2E_BASE_URL ?? "http://127.0.0.1:3000";
const userId = randomUUID();
const deviceId = `controlled-2a5-${randomUUID()}`;
const email = `controlled-2a5-${randomUUID()}@example.invalid`;
const password = `C2a5-${randomUUID()}!`;
const today = shanghaiDate(new Date());
const tomorrow = addDays(today, 1);
let accessToken;
let exitCode = 0;

try {
  await seedAccount();
  let cache = await selectReusableWeatherCache();
  await seedWardrobe(cache?.locationId);

  const login = await http("POST", "/api/auth/login", {
    account: email,
    password,
    deviceId,
    client: "android-app",
  }, false);
  accessToken = requiredString(login.accessToken, "login_access_token_missing");

  if (!cache) {
    const locations = await http("GET", "/api/weather/locations/search?q=Shanghai");
    const locationId = locations.candidates?.[0]?.locationId;
    if (!locationId) throw controlled("weather_location_not_available");
    await http("PUT", "/api/settings/location-profile", {
      clientMutationId: randomUUID(), expectedRevision: 0, locationId,
    });
    cache = { locationId };
  }

  const cacheBefore = await cacheEvidence(cache.locationId);
  const first = await http("POST", "/api/recommendations/resolve", { dates: [today, tomorrow] });
  const cacheAfterFirst = await cacheEvidence(cache.locationId);
  const read = await http("GET", `/api/recommendations?startDate=${today}&endDate=${tomorrow}`);
  const second = await http("POST", "/api/recommendations/resolve", { dates: [today, tomorrow] });
  const cacheAfter = await cacheEvidence(cache.locationId);

  const recommendation = read.items?.find((item) => item.targetDate === today);
  const candidate = recommendation?.recommendations?.[0];
  if (!recommendation || !candidate) throw controlled("recommendation_not_ready");
  const mutationId = randomUUID();
  const command = {
    clientMutationId: mutationId,
    recommendationId: recommendation.recommendationId,
    expectedRecommendationRevision: recommendation.recommendationRevision,
    candidateId: candidate.candidateId,
    selectedGarmentIds: candidate.garmentIds,
  };
  const accepted = await http("POST", `/api/recommendations/daily/${today}/accept`, command);
  const replay = await http("POST", `/api/recommendations/daily/${today}/accept`, command);
  const plans = await http("GET", `/api/workspace/outfit-plans?startDate=${today}&endDate=${tomorrow}&limit=50`);
  const plan = plans.items?.find((item) => item.id === accepted.plan?.id);
  if (!plan) throw controlled("accepted_plan_not_readable");

  const wornAt = `${today}T12:00:00.000Z`;
  const marked = await http("POST", `/api/workspace/outfit-plans/${plan.id}/mark-worn`, {
    clientMutationId: randomUUID(), expectedRevision: plan.revision, wornAt,
  });
  const planAfterWear = await http("GET", `/api/workspace/outfit-plans/${plan.id}`);
  const wearSummary = await http("GET", "/api/workspace/wear-summary");

  const acceptedPayload = accepted.plan?.payload ?? {};
  const wornPayload = planAfterWear.data?.payload ?? {};
  const expectedGarments = acceptedPayload.garmentIds ?? [];
  const baselineCache = cacheBefore.length > 0 ? cacheBefore : cacheAfterFirst;
  const cacheReused = baselineCache.length > 0 && JSON.stringify(baselineCache) === JSON.stringify(cacheAfter);
  const wearCountsUpdated = expectedGarments.every((id) => Number(wearSummary.garmentWearCounts?.[id]) === 1);
  const passed = first.results?.length === 2
    && first.results.every((result) => ["generated", "reused", "served_stale"].includes(result.status))
    && second.results?.every((result) => ["reused", "served_stale"].includes(result.status))
    && read.pairConsistent === true
    && accepted.status === "committed" && accepted.idempotentReplay === false
    && replay.idempotentReplay === true && replay.plan?.id === accepted.plan?.id
    && !Object.hasOwn(acceptedPayload, "outfitId")
    && expectedGarments.length === acceptedPayload.garmentSnapshots?.length
    && marked.status === "committed"
    && arraysEqual(wornPayload.actualGarmentIds, expectedGarments)
    && wornPayload.actualGarmentSnapshots?.length === expectedGarments.length
    && wearCountsUpdated
    && cacheReused;

  process.stdout.write(`${JSON.stringify({
    passed,
    authenticatedHttp: true,
    featureRoutes: { resolve: true, read: true, accept: true, planningRead: true, markWorn: true, wearSummary: true },
    firstStatuses: first.results.map((result) => result.status),
    secondStatuses: second.results.map((result) => result.status),
    pairConsistent: read.pairConsistent,
    acceptCommitted: accepted.status === "committed",
    idempotentReplay: replay.idempotentReplay,
    planHasOutfitId: Object.hasOwn(acceptedPayload, "outfitId"),
    snapshotCount: acceptedPayload.garmentSnapshots?.length ?? 0,
    actualSnapshotCount: wornPayload.actualGarmentSnapshots?.length ?? 0,
    wearCountsUpdated,
    qweatherCacheAvailable: baselineCache.length > 0,
    qweatherCacheReusedWithoutFetchChange: cacheReused,
  })}\n`);
  if (!passed) exitCode = 2;
} catch (error) {
  process.stdout.write(`${JSON.stringify({ passed: false, errorCode: safeCode(error), errorStage: safeError(error) })}\n`);
  exitCode = 1;
} finally {
  await pool.query("delete from users where id=$1", [userId]).catch(() => { exitCode = 1; });
  const residual = await residualCount();
  process.stdout.write(`${JSON.stringify({ cleanupPassed: residual === 0, residual })}\n`);
  if (residual !== 0) exitCode = 1;
  await pool.end();
}

process.exitCode = exitCode;

async function seedAccount() {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await pool.query("insert into users(id) values($1)", [userId]);
  await pool.query("insert into email_identities(user_id,email_normalized,email_masked,verified_at) values($1,$2,$3,now())", [userId, email, "controlled@example.invalid"]);
  await pool.query("insert into password_credentials(user_id,password_hash) values($1,$2)", [userId, passwordHash]);
}

async function seedWardrobe(locationId) {
  await pool.query("insert into profiles(user_id,origin_device_id,payload) values($1,$2,$3::jsonb)", [
    userId, deviceId, JSON.stringify({ timezone: "Asia/Shanghai", workdayScene: "commute", restDayScene: "casual", thermalBias: "normal" }),
  ]);
  if (locationId) {
    await pool.query(`insert into user_location_profiles
      (user_id,location_id,display_name,timezone,revision,client_mutation_id,mutation_fingerprint)
      values($1,$2,'controlled-cache-location','Asia/Shanghai',1,$3,$4)`, [userId, locationId, randomUUID(), "controlled-http-e2e"]);
  }
  const garments = [
    ["tops", "shirt", "白", "commute", 4, 2], ["tops", "sweater", "黑", "casual", 3, 4],
    ["pants", "suit_pants", "黑", "commute", 4, 2], ["pants", "casual_pants", "蓝", "casual", 2, 3],
    ["shoes", "loafers", "黑", "commute", 4, 2], ["shoes", "sneakers", "白", "casual", 2, 2],
    ["outerwear", "jacket", "蓝", "commute", 3, 5],
  ];
  for (const [index, [category, subcategory, color, style, formality, warmth]] of garments.entries()) {
    const garmentId = randomUUID();
    const assetId = randomUUID();
    await pool.query("insert into garments(id,user_id,origin_device_id,payload) values($1,$2,$3,$4::jsonb)", [
      garmentId, userId, deviceId,
      JSON.stringify({ name: `controlled-garment-${index + 1}`, legacyItemId: index + 1, status: "active", category, subcategory, colors: [color], seasons: ["all"], styles: [style], material: "cotton", formality, warmth, temperatureMinC: -20, temperatureMaxC: 45 }),
    ]);
    await pool.query("insert into assets(id,owner_entity_type,owner_entity_id,user_id,origin_device_id,payload) values($1,'garment',$2,$3,$4,'{}'::jsonb)", [assetId, garmentId, userId, deviceId]);
    await pool.query("insert into asset_bindings(user_id,asset_id,owner_entity_type,owner_entity_id,field_name) values($1,$2,'garment',$3,'primaryImage')", [userId, assetId, garmentId]);
  }
}

async function selectReusableWeatherCache() {
  const result = await pool.query(`select location_id
    from weather_cache
    where provider='qweather' and lang='zh' and unit='m' and payload is not null
      and expires_at > now() and stale_until > now()
    group by location_id having count(distinct endpoint) >= 2
    order by max(fetched_at) desc limit 1`);
  return result.rows[0] ? { locationId: result.rows[0].location_id } : null;
}

async function cacheEvidence(locationId) {
  const result = await pool.query(`select endpoint, fetched_at::text fetched_at
    from weather_cache where provider='qweather' and location_id=$1 and lang='zh' and unit='m'
    order by endpoint`, [locationId]);
  return result.rows;
}

async function residualCount() {
  const tables = ["users", "garments", "outfit_plans", "recommendation_actions", "daily_recommendations", "device_sessions", "email_identities", "password_credentials"];
  let total = 0;
  for (const table of tables) {
    const column = table === "users" ? "id" : "user_id";
    const result = await pool.query(`select count(*)::int count from ${table} where ${column}=$1`, [userId]);
    total += Number(result.rows[0].count);
  }
  return total;
}

async function http(method, path, body, authenticated = true) {
  const headers = { "content-type": "application/json", "x-wardrobe-device-id": deviceId };
  if (authenticated) headers.authorization = `Bearer ${requiredString(accessToken, "authentication_missing")}`;
  const response = await fetch(`${baseUrl}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw controlled(typeof value?.code === "string" ? `http_${response.status}_${value.code}` : `http_${response.status}`);
  return value;
}

function arraysEqual(left, right) { return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => value === right[index]); }
function requiredString(value, code) { if (typeof value !== "string" || !value) throw controlled(code); return value; }
function controlled(code) { const error = new Error(code); error.code = code; return error; }
function safeCode(error) { return error && typeof error === "object" && typeof error.code === "string" ? error.code : "controlled_http_e2e_failed"; }
function safeError(error) { return String(error instanceof Error ? error.message : "controlled_http_e2e_failed").replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "<synthetic-id>").slice(0, 180); }
function shanghaiDate(value) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(value); }
function addDays(date, count) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + count); return value.toISOString().slice(0, 10); }
