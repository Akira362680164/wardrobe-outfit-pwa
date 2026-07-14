import { describe, expect, it } from "vitest";
import { resolveRecommendationContextSnapshot } from "../src/recommendations/context-resolver.js";

const USER = "10000000-0000-4000-8000-000000000001";
const OTHER = "10000000-0000-4000-8000-000000000002";
const AT = "2026-07-14T12:00:00.000Z";
const home = { locationId: "101020100", displayName: "上海", timezone: "Asia/Shanghai" };
const override = { locationId: "101190101", displayName: "南京", timezone: "Asia/Shanghai" };
const travel = { locationId: "101010100", displayName: "北京", timezone: "Asia/Shanghai" };
const base = {
  userId: USER, targetDate: "2026-07-15", contextResolvedAt: AT,
  travelPlans: [] as any[], overrides: [] as any[], profiles: [] as any[],
};

describe("pure user-date recommendation context resolver", () => {
  it("uses travel > temporary override > home city > locationless", () => {
    const profiles = [{ userId: USER, isCurrent: true, supersededAt: null, location: home }];
    const overrides = [{ userId: USER, effectiveFrom: "2026-07-14", effectiveThrough: "2026-07-15", isCurrent: true, supersededAt: null, location: override }];
    const travelPlans = [{ userId: USER, startDate: "2026-07-15", endDate: "2026-07-16", deletedAt: null, updatedAt: new Date(AT), payload: { destination: "自由文本", weatherLocation: travel } }];
    expect(resolveRecommendationContextSnapshot({ ...base, profiles, overrides, travelPlans }).locationSource).toBe("travel");
    expect(resolveRecommendationContextSnapshot({ ...base, profiles, overrides }).locationSource).toBe("temporary_override");
    expect(resolveRecommendationContextSnapshot({ ...base, profiles }).locationSource).toBe("home_city");
    expect(resolveRecommendationContextSnapshot(base)).toMatchObject({ contextMode: "locationless", targetTimezone: "Asia/Shanghai" });
  });

  it("rejects free-text and invalid travel locations without rejecting the old trip", () => {
    const oldTrip = { userId: USER, startDate: "2026-07-15", endDate: "2026-07-16", deletedAt: null, updatedAt: new Date(AT), payload: { destination: "东京" } };
    const invalid = { ...oldTrip, payload: { destination: "东京", weatherLocation: { locationId: "guess", displayName: "东京", timezone: "not/a-zone" } } };
    const profiles = [{ userId: USER, isCurrent: true, supersededAt: null, location: home }];
    expect(resolveRecommendationContextSnapshot({ ...base, profiles, travelPlans: [oldTrip] }).locationSource).toBe("home_city");
    expect(resolveRecommendationContextSnapshot({ ...base, profiles, travelPlans: [invalid] }).locationSource).toBe("home_city");
  });

  it("selects one authoritative overlapping trip before resolving weather", () => {
    const newerWithoutLocation = { id: "b", userId: USER, startDate: "2026-07-15", endDate: "2026-07-16", deletedAt: null, updatedAt: new Date("2026-07-14T13:00:00.000Z"), payload: { destination: "杭州", activities: ["展览"] } };
    const olderWithLocation = { id: "a", userId: USER, startDate: "2026-07-15", endDate: "2026-07-16", deletedAt: null, updatedAt: new Date("2026-07-14T12:00:00.000Z"), payload: { destination: "北京", activities: ["会议"], weatherLocation: travel } };
    const profiles = [{ userId: USER, isCurrent: true, supersededAt: null, location: home }];
    const resolved = resolveRecommendationContextSnapshot({ ...base, profiles, travelPlans: [olderWithLocation, newerWithoutLocation] });
    expect(resolved.locationSource).toBe("home_city");
    expect(resolved.resolvedLocation?.locationId).toBe(home.locationId);
  });

  it("excludes boundary misses, tombstones, non-current and other-user rows", () => {
    const overrides = [
      { userId: USER, effectiveFrom: "2026-07-13", effectiveThrough: "2026-07-14", isCurrent: true, supersededAt: null, location: override },
      { userId: USER, effectiveFrom: "2026-07-15", effectiveThrough: "2026-07-15", isCurrent: false, supersededAt: new Date(AT), location: override },
      { userId: OTHER, effectiveFrom: "2026-07-15", effectiveThrough: "2026-07-15", isCurrent: true, supersededAt: null, location: override },
    ];
    expect(resolveRecommendationContextSnapshot({ ...base, overrides })).toMatchObject({ contextMode: "locationless" });
    expect(resolveRecommendationContextSnapshot({ ...base, targetDate: "2026-07-14", overrides }).locationSource).toBe("temporary_override");
  });
});
