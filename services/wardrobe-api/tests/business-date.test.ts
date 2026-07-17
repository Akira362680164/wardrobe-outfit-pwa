import { describe, expect, it } from "vitest";
import { WARDORA_BUSINESS_TIMEZONE, wardoraBusinessDate, wardoraBusinessDateChanged } from "@wardrobe/cloud-contracts";

describe("Wardora Asia/Shanghai business date", () => {
  it("is independent of the device timezone", () => {
    expect(WARDORA_BUSINESS_TIMEZONE).toBe("Asia/Shanghai");
    expect(wardoraBusinessDate(new Date("2026-07-16T15:59:59.999Z"))).toBe("2026-07-16");
    expect(wardoraBusinessDate(new Date("2026-07-16T16:00:00.000Z"))).toBe("2026-07-17");
  });

  it("detects a Shanghai midnight crossed while the app was backgrounded", () => {
    expect(wardoraBusinessDateChanged("2026-07-16T15:55:00.000Z", "2026-07-16T16:05:00.000Z")).toBe(true);
    expect(wardoraBusinessDateChanged("2026-07-16T01:00:00.000-07:00", "2026-07-16T02:00:00.000-07:00")).toBe(false);
  });
});
