import type {
  RecommendationEngineInput,
  RecommendationFixtureExpectation,
  RecommendationGarment,
  RecommendationScenarioFixture,
} from "../../../src/recommendations/types.js";

const USER = "10000000-0000-4000-8000-000000000001";
const OTHER_USER = "10000000-0000-4000-8000-000000000002";
const AS_OF = "2026-07-13";
const DATE = "2026-07-14";

const IDS = {
  shirt: "20000000-0000-4000-8000-000000000001",
  tee: "20000000-0000-4000-8000-000000000002",
  sweater: "20000000-0000-4000-8000-000000000003",
  rainCoat: "20000000-0000-4000-8000-000000000004",
  downCoat: "20000000-0000-4000-8000-000000000005",
  blazer: "20000000-0000-4000-8000-000000000006",
  pants: "20000000-0000-4000-8000-000000000007",
  shorts: "20000000-0000-4000-8000-000000000008",
  skirt: "20000000-0000-4000-8000-000000000009",
  dress: "20000000-0000-4000-8000-000000000010",
  sneakers: "20000000-0000-4000-8000-000000000011",
  loafers: "20000000-0000-4000-8000-000000000012",
  heels: "20000000-0000-4000-8000-000000000013",
  sandals: "20000000-0000-4000-8000-000000000014",
  bag: "20000000-0000-4000-8000-000000000015",
  hat: "20000000-0000-4000-8000-000000000016",
  otherUser: "20000000-0000-4000-8000-000000000017",
  deleted: "20000000-0000-4000-8000-000000000018",
  archived: "20000000-0000-4000-8000-000000000019",
  laundry: "20000000-0000-4000-8000-000000000020",
  repair: "20000000-0000-4000-8000-000000000021",
  noImage: "20000000-0000-4000-8000-000000000022",
  missingFields: "20000000-0000-4000-8000-000000000023",
  thermalMismatch: "20000000-0000-4000-8000-000000000024",
  formalMismatch: "20000000-0000-4000-8000-000000000025",
  suede: "20000000-0000-4000-8000-000000000026",
  blocked: "20000000-0000-4000-8000-000000000027",
} as const;

function garment(
  id: string,
  category: RecommendationGarment["category"],
  overrides: Partial<RecommendationGarment> = {},
): RecommendationGarment {
  const defaults: RecommendationGarment = {
    id,
    userId: USER,
    deleted: false,
    status: "active",
    hasPrimaryImage: true,
    category,
    colors: ["黑"],
    seasons: ["all"],
    styles: ["casual"],
    formality: 2,
    warmth: 2,
    temperatureMinC: 10,
    temperatureMaxC: 32,
  };
  return { ...defaults, ...overrides };
}

const BASE_GARMENTS: RecommendationGarment[] = [
  garment(IDS.shirt, "tops", { subcategory: "shirt", colors: ["白"], styles: ["commute"], formality: 4, temperatureMinC: 12, temperatureMaxC: 28 }),
  garment(IDS.tee, "tops", { subcategory: "t_shirt", colors: ["白"], styles: ["casual", "outdoor"], formality: 1, warmth: 1, temperatureMinC: 22, temperatureMaxC: 42 }),
  garment(IDS.sweater, "tops", { subcategory: "sweater_knit", colors: ["藏青"], styles: ["commute"], formality: 3, warmth: 4, temperatureMinC: -2, temperatureMaxC: 16 }),
  garment(IDS.rainCoat, "tops", { subcategory: "trench_coat", colors: ["藏青"], styles: ["commute"], formality: 3, material: "polyester", warmth: 3, temperatureMinC: 8, temperatureMaxC: 24 }),
  garment(IDS.downCoat, "tops", { subcategory: "down_jacket", colors: ["黑"], styles: ["casual"], formality: 2, warmth: 5, temperatureMinC: -30, temperatureMaxC: 8 }),
  garment(IDS.blazer, "tops", { subcategory: "suit_jacket", colors: ["黑"], styles: ["commute", "elegant"], formality: 5, warmth: 3, temperatureMinC: 8, temperatureMaxC: 24 }),
  garment(IDS.pants, "pants", { subcategory: "suit_pants", styles: ["commute"], formality: 4, temperatureMinC: 8, temperatureMaxC: 30 }),
  garment(IDS.shorts, "pants", { subcategory: "casual_shorts", colors: ["蓝"], styles: ["casual", "outdoor"], formality: 1, warmth: 1, temperatureMinC: 24, temperatureMaxC: 45 }),
  garment(IDS.skirt, "skirts", { subcategory: "a_line_skirt", colors: ["藏青"], styles: ["elegant", "commute"], formality: 3, temperatureMinC: 15, temperatureMaxC: 32 }),
  garment(IDS.dress, "one_piece", { subcategory: "dress", colors: ["藏青"], styles: ["elegant"], formality: 4, temperatureMinC: 16, temperatureMaxC: 30 }),
  garment(IDS.sneakers, "shoes", { subcategory: "sneakers", colors: ["白"], styles: ["casual", "outdoor"], formality: 1, material: "mesh", warmth: 1, temperatureMinC: 12, temperatureMaxC: 42 }),
  garment(IDS.loafers, "shoes", { subcategory: "loafers", styles: ["commute"], formality: 4, material: "leather", temperatureMinC: 8, temperatureMaxC: 30 }),
  garment(IDS.heels, "shoes", { subcategory: "high_heels", styles: ["elegant"], formality: 5, temperatureMinC: 12, temperatureMaxC: 32 }),
  garment(IDS.sandals, "shoes", { subcategory: "sandals", colors: ["米"], formality: 1, warmth: 1, temperatureMinC: 24, temperatureMaxC: 45 }),
  garment(IDS.bag, "bags", { subcategory: "fashion_bag", styles: ["commute"], formality: 4 }),
  garment(IDS.hat, "hats", { subcategory: "sun_hat", colors: ["米"], styles: ["outdoor"], formality: 1 }),
];

function input(overrides: Partial<RecommendationEngineInput> = {}): RecommendationEngineInput {
  return {
    requestId: "30000000-0000-4000-8000-000000000001",
    userId: USER,
    ruleVersion: "wardora-rule-1a.1",
    asOfDate: AS_OF,
    dateContextInput: {
      date: DATE,
      weekday: 2,
      dayType: "workday",
      timezone: "Asia/Shanghai",
      weatherEvidence: {
        weatherSource: "forecast",
        weatherConfidence: 0.9,
        weatherUpdatedAt: "2026-07-13T08:00:00.000Z",
        temperatureMinC: 18,
        temperatureMaxC: 27,
        rainProbability: 10,
        windLevel: 2,
        summary: "mild",
      },
      userProfile: { workdayScene: "commute", restDayScene: "casual", thermalBias: "normal", stylePreferences: ["commute"] },
    },
    garments: BASE_GARMENTS,
    savedOutfits: [],
    wearHistory: [],
    feedback: [],
    anchorGarmentIds: [],
    pawCandidateEvaluatorEnabled: false,
    ...overrides,
  };
}

function fixture(
  id: string,
  title: string,
  engineInput: RecommendationEngineInput,
  expected: RecommendationFixtureExpectation,
): RecommendationScenarioFixture {
  return { id, title, input: engineInput, expected };
}

const defaultReady: RecommendationFixtureExpectation = {
  status: "ready",
  recommendationCount: 3,
  mustInclude: [],
  mustExclude: [],
  reasonCodes: [],
};

export const recommendationScenarioFixtures: RecommendationScenarioFixture[] = [
  fixture("rainy_commute", "雨天通勤", input({ dateContextInput: { ...input().dateContextInput, weatherEvidence: { ...input().dateContextInput.weatherEvidence, rainProbability: 90, summary: "heavy rain" } } }), { ...defaultReady, mustInclude: [IDS.rainCoat], reasonCodes: ["rain_ready"] }),
  fixture("hot_casual", "高温休闲", input({ dateContextInput: { ...input().dateContextInput, dayType: "rest_day", weekday: 7, weatherEvidence: { ...input().dateContextInput.weatherEvidence, temperatureMinC: 31, temperatureMaxC: 38, summary: "hot" } } }), { ...defaultReady, mustInclude: [IDS.tee, IDS.shorts], mustExclude: [IDS.downCoat] }),
  fixture("winter_low_temperature", "冬季低温", input({ dateContextInput: { ...input().dateContextInput, weatherEvidence: { ...input().dateContextInput.weatherEvidence, temperatureMinC: -10, temperatureMaxC: 2, summary: "freezing" } } }), { ...defaultReady, mustInclude: [IDS.downCoat], mustExclude: [IDS.tee, IDS.shorts, IDS.sandals] }),
  fixture("formal_meeting", "正式会议", input({ dateContextInput: { ...input().dateContextInput, travelPlan: { name: "Board meeting", destination: "Shanghai", activities: ["business meeting"] } } }), { ...defaultReady, mustInclude: [IDS.shirt, IDS.pants, IDS.loafers], mustExclude: [IDS.tee, IDS.shorts] }),
  fixture("travel_outdoor", "旅行户外", input({ dateContextInput: { ...input().dateContextInput, dayType: "rest_day", travelPlan: { name: "Hike", destination: "Hangzhou", activities: ["hiking", "outdoor"] } } }), { ...defaultReady, mustInclude: [IDS.sneakers], reasonCodes: ["good_for_travel"] }),
  fixture("dress_template", "连衣裙模板", input({ anchorGarmentIds: [IDS.dress] }), { ...defaultReady, mustInclude: [IDS.dress] }),
  fixture("saved_successful_outfit", "保存成功套装", input({ savedOutfits: [{ id: "40000000-0000-4000-8000-000000000001", userId: USER, garmentIds: [IDS.shirt, IDS.pants, IDS.loafers], successfulWearCount: 4 }] }), { ...defaultReady, mustInclude: [IDS.shirt, IDS.pants, IDS.loafers], reasonCodes: ["historical_success"] }),
  fixture("recent_repeat", "最近重复", input({ wearHistory: [{ garmentIds: [IDS.shirt, IDS.pants, IDS.loafers], wornDate: "2026-07-12", sceneType: "commute" }] }), { ...defaultReady, mustExcludeCandidate: [IDS.shirt, IDS.pants, IDS.loafers] }),
  fixture("never_worn", "从未穿", input({ wearHistory: [{ garmentIds: BASE_GARMENTS.filter((item) => item.id !== IDS.skirt).map((item) => item.id), wornDate: "2026-07-10", sceneType: "commute" }] }), { ...defaultReady, mustInclude: [IDS.skirt], scoreBounds: { objective: "fresh", min: 45, max: 100 } }),
  fixture("positive_feedback", "正反馈", input({ feedback: [{ garmentIds: [IDS.shirt, IDS.pants, IDS.loafers], sceneType: "commute", sentiment: "positive" }] }), { ...defaultReady, mustInclude: [IDS.shirt, IDS.pants, IDS.loafers] }),
  fixture("negative_feedback", "负反馈", input({ feedback: [{ garmentIds: [IDS.shirt, IDS.pants, IDS.loafers], sceneType: "commute", sentiment: "severe_negative" }] }), { ...defaultReady, mustExcludeCandidate: [IDS.shirt, IDS.pants, IDS.loafers] }),
  fixture("other_user_filtered", "非本用户", input({ garments: [...BASE_GARMENTS, garment(IDS.otherUser, "tops", { userId: OTHER_USER })] }), { ...defaultReady, mustExclude: [IDS.otherUser], expectedExclusions: { [IDS.otherUser]: ["not_current_user"] } }),
  fixture("deleted_filtered", "deleted", input({ garments: [...BASE_GARMENTS, garment(IDS.deleted, "tops", { deleted: true })] }), { ...defaultReady, mustExclude: [IDS.deleted], expectedExclusions: { [IDS.deleted]: ["deleted"] } }),
  fixture("archived_filtered", "archived", input({ garments: [...BASE_GARMENTS, garment(IDS.archived, "tops", { status: "archived" })] }), { ...defaultReady, mustExclude: [IDS.archived], expectedExclusions: { [IDS.archived]: ["unavailable_status"] } }),
  fixture("laundry_filtered", "laundry", input({ garments: [...BASE_GARMENTS, garment(IDS.laundry, "tops", { status: "laundry" })] }), { ...defaultReady, mustExclude: [IDS.laundry], expectedExclusions: { [IDS.laundry]: ["unavailable_status"] } }),
  fixture("repair_filtered", "repair", input({ garments: [...BASE_GARMENTS, garment(IDS.repair, "tops", { status: "repair" })] }), { ...defaultReady, mustExclude: [IDS.repair], expectedExclusions: { [IDS.repair]: ["unavailable_status"] } }),
  fixture("missing_image_filtered", "缺主图", input({ garments: [...BASE_GARMENTS, garment(IDS.noImage, "tops", { hasPrimaryImage: false })] }), { ...defaultReady, mustExclude: [IDS.noImage], expectedExclusions: { [IDS.noImage]: ["missing_primary_image"] } }),
  fixture("missing_required_fields", "缺必要字段", input({ garments: [...BASE_GARMENTS, garment(IDS.missingFields, undefined, { colors: [], seasons: [], warmth: undefined, temperatureMinC: undefined, temperatureMaxC: undefined, formality: undefined })] }), { ...defaultReady, mustExclude: [IDS.missingFields], expectedExclusions: { [IDS.missingFields]: ["missing_required_field"] } }),
  fixture("thermal_severe_mismatch", "温度严重不符", input({ garments: [...BASE_GARMENTS, garment(IDS.thermalMismatch, "tops", { temperatureMinC: -30, temperatureMaxC: 5 })] }), { ...defaultReady, mustExclude: [IDS.thermalMismatch], expectedExclusions: { [IDS.thermalMismatch]: ["temperature_mismatch"] } }),
  fixture("formality_severe_mismatch", "正式度严重不符", input({ garments: [...BASE_GARMENTS, garment(IDS.formalMismatch, "tops", { formality: 1 })], dateContextInput: { ...input().dateContextInput, travelPlan: { name: "Formal", destination: "Shanghai", activities: ["formal gala"] } } }), { ...defaultReady, mustExclude: [IDS.formalMismatch], expectedExclusions: { [IDS.formalMismatch]: ["formality_mismatch"] } }),
  fixture("avoid_rule", "avoid rule", input({ garments: [...BASE_GARMENTS, garment(IDS.suede, "shoes", { material: "suede" })], dateContextInput: { ...input().dateContextInput, weatherEvidence: { ...input().dateContextInput.weatherEvidence, rainProbability: 90, summary: "rain" } } }), { ...defaultReady, mustExclude: [IDS.suede], expectedExclusions: { [IDS.suede]: ["avoid_rule"] } }),
  fixture("explicit_block", "明确禁止推荐", input({ garments: [...BASE_GARMENTS, garment(IDS.blocked, "tops", { recommendationBlocked: true })] }), { ...defaultReady, mustExclude: [IDS.blocked], expectedExclusions: { [IDS.blocked]: ["recommendation_blocked"] } }),
  fixture("limited_two_candidates", "limited", input({ garments: [BASE_GARMENTS.find((item) => item.id === IDS.shirt)!, BASE_GARMENTS.find((item) => item.id === IDS.pants)!, BASE_GARMENTS.find((item) => item.id === IDS.loafers)!, BASE_GARMENTS.find((item) => item.id === IDS.sneakers)!] }), { status: "limited", recommendationCount: 2, mustInclude: [], mustExclude: [], reasonCodes: [] }),
  fixture("not_ready_missing_slot", "not ready", input({ garments: BASE_GARMENTS.filter((item) => item.category !== "shoes") }), { status: "not_ready", recommendationCount: 0, mustInclude: [], mustExclude: [], reasonCodes: [], missingSlotCodes: ["shoes"] }),
];

export { AS_OF, DATE, IDS, USER, input as buildFixtureInput, garment as buildFixtureGarment };
