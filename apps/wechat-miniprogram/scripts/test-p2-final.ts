import assert from "node:assert/strict";
import fs from "node:fs";

import { recommendationRiskLabel } from "../pages/home/risk-label";
import {
  calculateCapsuleGeometry,
  calculateSubPageTopBarLayout,
} from "../utils/capsule-layout";

const currentRiskCodes = [
  "missing_required_slot",
  "severe_temperature_mismatch",
  "severe_formality_mismatch",
  "rain_incompatible",
  "shoe_activity_mismatch",
  "wind_rain_exposure",
  "outerwear_recommended",
  "evening_layer_recommended",
];
const compatibleRiskCodes = [
  "too_cold",
  "too_hot",
  "rain_exposure",
  "wind_exposure",
  "shoe_discomfort",
  "formality_mismatch",
  "activity_mismatch",
  "missing_required_layer",
  "style_conflict",
];

for (const code of [...currentRiskCodes, ...compatibleRiskCodes]) {
  const label = recommendationRiskLabel(code, "forecast");
  assert.match(label, /[\u3400-\u9fff]/, `${code} must have a Chinese user label`);
  assert.doesNotMatch(label, /[a-z]+_[a-z_]+/i, `${code} must not expose an internal enum`);
  assert.ok(!label.includes(code), `${code} must not be echoed`);
}
assert.equal(recommendationRiskLabel("evening_layer_recommended", "forecast"), "晚间可能偏凉，建议带一件薄外套。");
const unknownCode = "future_internal_risk_code";
const unknownLabel = recommendationRiskLabel(unknownCode, "forecast");
assert.ok(!unknownLabel.includes(unknownCode));
assert.doesNotMatch(unknownLabel, /[a-z]+_[a-z_]+/i);
assert.equal(recommendationRiskLabel(undefined, "forecast"), "未发现需要特别提醒的天气风险。");
assert.equal(recommendationRiskLabel(undefined, "generic"), "通用建议不作温度或降雨判断。");

for (const windowWidth of [360, 390, 430]) {
  const geometry = calculateCapsuleGeometry({
    windowWidth,
    statusBarHeight: 24,
    menu: { top: 28, height: 32, left: windowWidth - 95 },
  });
  const layout = calculateSubPageTopBarLayout(geometry, true, 96);
  const titleWidthRpx = 750 - layout.titleInsetRpx * 2;
  const actionLeftRpx = 750 - layout.rightSlotRpx - 96;
  const titleRightRpx = 750 - layout.titleInsetRpx;
  assert.ok(titleWidthRpx > 0, `${windowWidth}px must retain a title region`);
  assert.equal(titleRightRpx + 16, actionLeftRpx, `${windowWidth}px must keep a 16rpx action gap`);
  assert.equal(layout.titleInsetRpx, 750 - titleRightRpx, `${windowWidth}px title must remain visually centered`);
}

const topBarWxml = fs.readFileSync("components/domain/sub-page-top-bar/index.wxml", "utf8");
const topBarWxss = fs.readFileSync("components/domain/sub-page-top-bar/index.wxss", "utf8");
const detailShell = fs.readFileSync("components/domain/item-detail-shell/index.wxml", "utf8");
assert.match(topBarWxml, /left: \{\{titleInsetRpx\}\}rpx/);
assert.match(topBarWxml, /right: \{\{titleInsetRpx\}\}rpx/);
assert.doesNotMatch(topBarWxss, /right:\s*220rpx/);
assert.match(detailShell, /has-right-action/);

for (const detailStyle of [
  "pages/wardrobe/detail/index.wxss",
  "pages/outfits/detail/index.wxss",
  "pages/wishlist/detail/index.wxss",
]) {
  const styleSource = fs.readFileSync(detailStyle, "utf8");
  const moreButton = styleSource.match(/\.more-button\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(moreButton, /width:\s*96rpx/);
  assert.match(moreButton, /height:\s*96rpx/);
}

console.log("mini-program P2 final contracts passed");
