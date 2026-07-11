import assert from "node:assert/strict";
import { getMonthGrid } from "../utils/calendar";

const july = getMonthGrid("2026-07", "2026-07-08");
assert.equal(july.length, 35);
assert.equal(july[0]?.dateKey, "2026-06-29");
assert.equal(july.at(-1)?.dateKey, "2026-08-02");
assert.equal(july.filter((item) => item.isToday).map((item) => item.dateKey).join(","), "2026-07-08");

const august = getMonthGrid("2026-08", "2026-08-08");
assert.equal(august.length, 42);
assert.equal(august[0]?.dateKey, "2026-07-27");
assert.equal(august.at(-1)?.dateKey, "2026-09-06");

console.log("wechat calendar layout: 7 assertions passed");
