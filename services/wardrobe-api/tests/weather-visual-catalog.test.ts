import { describe, expect, it } from "vitest";
import { QWEATHER_VISUAL_CODES, QWEATHER_VISUAL_DICTIONARY, QWEATHER_VISUAL_SOURCE_SHA256, resolveQWeatherVisual } from "@wardrobe/domain-catalog";

describe("QWeather visual catalog frozen from accepted v0.2.3 prototype", () => {
  it("contains exactly the 62 official codes once", () => {
    expect(QWEATHER_VISUAL_CODES).toHaveLength(62);
    expect(new Set(QWEATHER_VISUAL_CODES).size).toBe(62);
    expect(Object.keys(QWEATHER_VISUAL_DICTIONARY)).toEqual([...QWEATHER_VISUAL_CODES]);
    expect(QWEATHER_VISUAL_SOURCE_SHA256).toBe("30c97e315d2efd0d9bfcf10125177d58cf9edb479b8d9310476752277cbe37db");
  });

  it("preserves representative day/night and severe scene data", () => {
    expect(resolveQWeatherVisual("100")).toMatchObject({ name: "晴（日）", day: true, family: "clear", severity: 0, static: false });
    expect(resolveQWeatherVisual("150")).toMatchObject({ name: "晴（夜）", day: false, family: "clear", static: false });
    expect(resolveQWeatherVisual("304")).toMatchObject({ family: "hail", severity: 3, hail: true, visibility: 0.48 });
    expect(resolveQWeatherVisual("508")).toMatchObject({ family: "dust", severity: 4, windDrift: 1.55, visibility: 0.14 });
  });

  it("maps unknown 998 to a static neutral fallback without pretending it is official", () => {
    expect(QWEATHER_VISUAL_CODES).not.toContain("998");
    expect(resolveQWeatherVisual("998")).toEqual(expect.objectContaining({ code: "998", family: "unknown", static: true, unknownCode: "998" }));
  });
});
