import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureDir, writeJson } from "./lib/fs";
import { deterministicPhone, deterministicUuid, freshLegacyNumber, ParityApiClient, type ParitySession, type WorkspaceEntity } from "./lib/api";

const TEST_PASSWORD = "ParityTest123!";

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function garmentPayload(runId: string, alias: string, patch: Record<string, unknown> = {}): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    legacyItemId: freshLegacyNumber(`${runId}:${alias}`),
    name: `${runId}-${alias}`,
    locationId: "home",
    status: "active",
    category: "tops",
    subcategory: "t-shirt",
    colors: { mode: "single", primary: "红" },
    seasons: ["all"],
    styles: ["casual"],
    material: "棉",
    fitGender: "unisex",
    notes: `parity fixture ${alias}`,
    wornDates: [],
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

function wishlistPayload(runId: string, alias: string, patch: Record<string, unknown> = {}): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    legacyWishlistId: `wishlist-${deterministicUuid(runId, alias)}`,
    name: `${runId}-${alias}`,
    status: "interested",
    category: "tops",
    colors: { mode: "single", primary: "蓝" },
    seasons: ["all"],
    styles: ["casual"],
    wornDates: [],
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

export async function seedParityFixtures(options: {
  cwd: string;
  runRoot: string;
  runId: string;
  platform: "app" | "mini";
  apiBaseUrl: string;
  existingAccount?: string;
  existingPassword?: string;
  allowNonLocal?: boolean;
}): Promise<{ manifestFile: string; runtimeSessionFile: string }> {
  const namespace = `${options.runId}-samples-${options.platform}`;
  const phone = options.existingAccount ?? deterministicPhone(namespace);
  const password = options.existingPassword ?? TEST_PASSWORD;
  const deviceId = `parity-${options.platform}-${deterministicUuid(namespace, "device")}`;
  const api = new ParityApiClient(options.apiBaseUrl, {
    runId: options.runId,
    caseId: "seed.samples",
    actionId: "fixtures.seed",
    platform: options.platform,
  }, { allowNonLocal: options.allowNonLocal });
  let session: ParitySession;
  try {
    if (options.existingAccount) throw new Error("existing account login required");
    session = await api.register(phone, password, deviceId);
  } catch (error) {
    if (!options.existingAccount && !String(error).includes("409") && !String(error).includes("already")) throw error;
    session = await api.login(phone, password, deviceId);
  }

  const imagePath = path.join(options.cwd, "e2e", "assets", "red-shirt.jpg");
  const completeMutationId = deterministicUuid(namespace, "garment.complete");
  const completeAssets = await api.uploadImageSession(session, "garment", imagePath, completeMutationId);
  const entities: Record<string, WorkspaceEntity> = {};
  entities["garment.complete"] = await api.createEntity(session, "garments", completeMutationId, garmentPayload(options.runId, "garment-complete", {
    purchaseDate: "2025-10-01",
    temperatureRange: [10, 28],
    formality: 2,
    warmth: 2,
    fitNotes: "标准版型，适合通勤与休闲",
  }), completeAssets);
  entities["garment.no_image"] = await api.createEntity(session, "garments", deterministicUuid(namespace, "garment.no_image"), garmentPayload(options.runId, "garment-no-image"));
  entities["garment.long_name"] = await api.createEntity(session, "garments", deterministicUuid(namespace, "garment.long_name"), garmentPayload(options.runId, "garment-long-name", {
    name: `${options.runId}-这是一件用于验证手机窄屏换行与按钮不重叠的超长名称红色纯棉通勤休闲上衣`,
  }));
  entities["garment.long_text"] = await api.createEntity(session, "garments", deterministicUuid(namespace, "garment.long_text"), garmentPayload(options.runId, "garment-long-text", {
    notes: "第一段用于验证详情页长文本。第二段验证滚动锚点与底部操作栏。第三段验证中英文、数字 2026 和标点混排。第四段确保内容足以产生稳定的页面底部截图。",
    fitNotes: "肩线适中，衣长覆盖腰线，叠穿时仍需保留活动空间。",
  }));
  entities["garment.ai_unavailable"] = await api.createEntity(session, "garments", deterministicUuid(namespace, "garment.ai_unavailable"), garmentPayload(options.runId, "garment-ai-unavailable"));
  entities["garment.delete_target"] = await api.createEntity(session, "garments", deterministicUuid(namespace, "garment.delete_target"), garmentPayload(options.runId, "garment-delete-target"));

  const completeLegacyId = Number(entities["garment.complete"].payload.legacyItemId);
  const noImageLegacyId = Number(entities["garment.no_image"].payload.legacyItemId);
  const now = new Date().toISOString();
  entities["outfit.complete"] = await api.createEntity(session, "outfits", deterministicUuid(namespace, "outfit.complete"), {
    name: `${options.runId}-outfit-complete`,
    legacyItemIds: [completeLegacyId, noImageLegacyId],
    itemIds: [completeLegacyId, noImageLegacyId],
    favorite: false,
    source: "manual",
    seasons: ["all"],
    sceneTags: ["通勤"],
    styleTags: ["casual"],
    pairingTags: [],
    wornDates: [],
    createdAt: now,
    updatedAt: now,
  });
  const outfitId = entities["outfit.complete"].id;
  entities["wishlist.normal"] = await api.createEntity(session, "wishlist", deterministicUuid(namespace, "wishlist.normal"), wishlistPayload(options.runId, "wishlist-normal"));
  entities["wishlist.rejected"] = await api.createEntity(session, "wishlist", deterministicUuid(namespace, "wishlist.rejected"), wishlistPayload(options.runId, "wishlist-rejected", { status: "rejected" }));
  entities["wishlist.archived"] = await api.createEntity(session, "wishlist", deterministicUuid(namespace, "wishlist.archived"), wishlistPayload(options.runId, "wishlist-archived", { status: "archived" }));
  entities["wishlist.delete_target"] = await api.createEntity(session, "wishlist", deterministicUuid(namespace, "wishlist.delete_target"), wishlistPayload(options.runId, "wishlist-delete-target"));

  entities["calendar.plan.travel"] = await api.createEntity(session, "trip-plans", deterministicUuid(namespace, "calendar.plan.travel"), {
    id: `calendar-${deterministicUuid(namespace, "travel")}`,
    type: "travel",
    title: `${options.runId}-travel-plan`,
    startDate: "2026-07-14",
    endDate: "2026-07-18",
    tone: "clay",
    destination: "测试目的地",
    activities: ["通勤", "晚餐"],
    packingEnabled: true,
    createdAt: now,
    updatedAt: now,
  });
  entities["calendar.plan.business"] = await api.createEntity(session, "trip-plans", deterministicUuid(namespace, "calendar.plan.business"), {
    id: `calendar-${deterministicUuid(namespace, "business")}`,
    type: "business",
    title: `${options.runId}-business-plan`,
    startDate: "2026-07-15",
    endDate: "2026-07-16",
    tone: "moss",
    destination: "测试会议中心",
    activities: ["会议"],
    packingEnabled: true,
    createdAt: now,
    updatedAt: now,
  });
  entities["calendar.entry.primary"] = await api.createEntity(session, "outfit-plans", deterministicUuid(namespace, "calendar.entry.primary"), {
    date: "2026-07-15",
    outfitId,
    status: "planned",
    isPrimary: true,
    createdAt: now,
    updatedAt: now,
  });

  const overview = await api.overview(session);
  const expectedMinimums = { garments: 6, outfits: 1, wishlistItems: 4, tripPlans: 2, outfitPlans: 1, locations: 1 };
  for (const [key, minimum] of Object.entries(expectedMinimums)) {
    const value = overview[key as keyof typeof overview];
    if (!Array.isArray(value) || value.length < minimum) throw new Error(`fixture readback ${key} expected >=${minimum}, got ${Array.isArray(value) ? value.length : "missing"}`);
  }

  const runtimeRoot = path.join(options.cwd, ".parity-runtime", options.runId, options.platform);
  await ensureDir(runtimeRoot);
  const runtimeSessionFile = path.join(runtimeRoot, "session.json");
  await fs.writeFile(runtimeSessionFile, `${JSON.stringify({ phone, password, session }, null, 2)}\n`, { mode: 0o600 });
  await fs.chmod(runtimeSessionFile, 0o600);
  const manifestFile = path.join(options.runRoot, "server", `fixture-seed-${options.platform}.json`);
  await writeJson(manifestFile, {
    schemaVersion: 1,
    runId: options.runId,
    platform: options.platform,
    namespace,
    account: { maskedPhone: session.user?.maskedPhone ?? `${phone.slice(0, 3)}****${phone.slice(-4)}`, deviceId },
    entities: Object.fromEntries(Object.entries(entities).map(([alias, entity]) => [alias, { id: entity.id, revision: entity.revision }])),
    readbackCounts: {
      garments: overview.garments.length,
      outfits: overview.outfits.length,
      wishlistItems: overview.wishlistItems.length,
      tripPlans: overview.tripPlans?.length ?? 0,
      outfitPlans: overview.outfitPlans.length,
      locations: overview.locations.length,
    },
    secretMaterialPersistedInArtifact: false,
  });
  return { manifestFile, runtimeSessionFile };
}
