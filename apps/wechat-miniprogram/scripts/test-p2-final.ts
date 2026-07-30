import assert from "node:assert/strict";
import fs from "node:fs";

import type { RecommendationDisplayItemV3 } from "../generated/wardora-home-contracts";
import {
  recommendationSourceSummary,
  shouldResolveRecommendationForWeather,
} from "../pages/home/recommendation-source";
import { recommendationReasonLabel, recommendationRiskLabel } from "../pages/home/risk-label";
import {
  calculateCapsuleGeometry,
  calculateSubPageTopBarLayout,
} from "../utils/capsule-layout";

type RecommendationContextSnapshot = Pick<
  RecommendationDisplayItemV3,
  "contextMode" | "resolvedLocation" | "locationSource"
>;

const shanghai = {
  locationId: "101020100",
  displayName: "上海",
  timezone: "Asia/Shanghai",
} as const;
const beijing = {
  locationId: "101010100",
  displayName: "北京",
  timezone: "Asia/Shanghai",
} as const;
const forecastShanghai: RecommendationContextSnapshot = {
  contextMode: "forecast",
  resolvedLocation: shanghai,
  locationSource: "home_city",
};
const forecastBeijing: RecommendationContextSnapshot = {
  contextMode: "forecast",
  resolvedLocation: beijing,
  locationSource: "home_city",
};
const forecastBeijingTemporary: RecommendationContextSnapshot = {
  contextMode: "forecast",
  resolvedLocation: beijing,
  locationSource: "temporary_override",
};
const locationless: RecommendationContextSnapshot = {
  contextMode: "locationless",
};
const fallbackShanghai: RecommendationContextSnapshot = {
  contextMode: "weather_fallback",
  resolvedLocation: shanghai,
  locationSource: "home_city",
};
const fallbackBeijing: RecommendationContextSnapshot = {
  contextMode: "weather_fallback",
  resolvedLocation: beijing,
  locationSource: "home_city",
};
const fallbackBeijingTemporary: RecommendationContextSnapshot = {
  contextMode: "weather_fallback",
  resolvedLocation: beijing,
  locationSource: "temporary_override",
};

assert.equal(shouldResolveRecommendationForWeather(forecastShanghai, forecastBeijing), true);
assert.equal(shouldResolveRecommendationForWeather(forecastBeijing, forecastBeijing), false);
assert.equal(shouldResolveRecommendationForWeather(forecastBeijing, forecastBeijingTemporary), true);
assert.equal(shouldResolveRecommendationForWeather(locationless, forecastBeijing), true);
assert.equal(shouldResolveRecommendationForWeather(forecastBeijing, locationless), true);
assert.equal(shouldResolveRecommendationForWeather(fallbackShanghai, forecastShanghai), true);
assert.equal(shouldResolveRecommendationForWeather(forecastShanghai, fallbackShanghai), true);
assert.equal(shouldResolveRecommendationForWeather(fallbackShanghai, fallbackBeijing), true);
assert.equal(shouldResolveRecommendationForWeather(fallbackBeijing, fallbackBeijingTemporary), true);
assert.equal(shouldResolveRecommendationForWeather(locationless, locationless), false);
assert.equal(shouldResolveRecommendationForWeather(forecastShanghai, undefined), false);
assert.equal(shouldResolveRecommendationForWeather(undefined, forecastShanghai), false);
assert.equal(
  shouldResolveRecommendationForWeather(
    { contextMode: "forecast" },
    { contextMode: "forecast" },
  ),
  false,
  "malformed same-mode snapshots must not cause a repeated resolve loop",
);

assert.equal(forecastBeijing.resolvedLocation?.displayName, "北京");
assert.equal(
  recommendationSourceSummary(forecastShanghai),
  "上海 · 常驻",
  "a Beijing weather response cannot relabel the displayed Shanghai recommendation",
);
assert.equal(recommendationSourceSummary(forecastBeijing), "北京 · 常驻");
assert.equal(recommendationSourceSummary(forecastBeijingTemporary), "北京 · 临时");
assert.equal(recommendationSourceSummary(locationless), "通用建议");
assert.equal(recommendationSourceSummary(fallbackShanghai), "通用建议");

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
const reasonLabels = {
  good_for_commute: "适合日常通勤，整体组合清晰可靠。",
  good_for_business: "正式度与商务场景相符。",
  good_for_travel: "适合行程活动与移动需要。",
  weather_fit: "当前衣物与天气证据匹配。",
  rain_ready: "组合已考虑降雨与路面情况。",
  activity_comfort: "活动空间与舒适度更充足。",
  historical_success: "这类组合过去有良好穿着记录。",
  rotation_value: "优先带回近期较少穿着的衣物。",
  new_combination: "在可靠结构中加入新的组合变化。",
  shoe_rationality: "鞋履与今天的活动强度匹配。",
  outerwear_rationality: "外层便于应对室内外变化。",
  adaptable_conditions: "采用容易增减的通用分层。",
  needs_evening_layer: "晚间可按体感补充轻薄外层。",
} as const;
const riskLabels = {
  missing_required_slot: "组合存在缺失角色，采用前需要补齐。",
  severe_temperature_mismatch: "温度适配存在明显风险。",
  severe_formality_mismatch: "正式度与当前场景差异较大。",
  rain_incompatible: "降雨条件下部分衣物不够稳妥。",
  shoe_activity_mismatch: "鞋履可能不适合今天的活动强度。",
  wind_rain_exposure: "风雨暴露较高，建议增加保护层。",
  outerwear_recommended: "建议随身准备一件轻薄外层。",
  evening_layer_recommended: "晚间体感变化时建议补充外层。",
  too_cold: "部分衣物可能不够保暖。",
  too_hot: "部分衣物可能偏热。",
  rain_exposure: "有淋雨风险，请留意防水。",
  wind_exposure: "风力较强时需要额外防护。",
  shoe_discomfort: "长时间活动时鞋履舒适度需留意。",
  formality_mismatch: "正式度可能与场景不完全一致。",
  activity_mismatch: "活动强度与衣物组合可能不完全匹配。",
  missing_required_layer: "建议补充必要的外层。",
  style_conflict: "组合风格存在轻微冲突。",
} as const;

for (const code of [...currentRiskCodes, ...compatibleRiskCodes]) {
  const label = recommendationRiskLabel(code, "forecast");
  assert.equal(label, riskLabels[code as keyof typeof riskLabels], `${code} must match the App canonical label`);
  assert.match(label, /[\u3400-\u9fff]/, `${code} must have a Chinese user label`);
  assert.doesNotMatch(label, /[a-z]+_[a-z_]+/i, `${code} must not expose an internal enum`);
  assert.ok(!label.includes(code), `${code} must not be echoed`);
}
for (const [code, expected] of Object.entries(reasonLabels)) {
  assert.equal(recommendationReasonLabel(code, "forecast"), expected, `${code} must match the App canonical label`);
}
assert.equal(recommendationReasonLabel("rule_fallback", "forecast"), "结合天气、场景与衣橱状态整理。");
assert.equal(recommendationReasonLabel("future_internal_reason_code", "forecast"), "结合天气、场景与衣橱状态整理。");
assert.equal(recommendationReasonLabel(undefined, "locationless"), "按场景与衣橱状态给出通用组合。");
const unknownCode = "future_internal_risk_code";
const unknownLabel = recommendationRiskLabel(unknownCode, "forecast");
assert.ok(!unknownLabel.includes(unknownCode));
assert.doesNotMatch(unknownLabel, /[a-z]+_[a-z_]+/i);
assert.equal(recommendationRiskLabel(undefined, "forecast"), "未发现需要特别提醒的天气风险。");
assert.equal(recommendationRiskLabel(undefined, "locationless"), "通用建议不作温度或降雨判断，出门前请自行确认天气。");
assert.equal(recommendationRiskLabel(undefined, "weather_fallback"), "通用建议不作温度或降雨判断，出门前请自行确认天气。");

const homeMarkup = fs.readFileSync("pages/home/index.wxml", "utf8");
const homeStyles = fs.readFileSync("pages/home/index.wxss", "utf8");
const generatedIcons = fs.readFileSync("components/ui/icon/generated-icons.ts", "utf8");
for (const selector of [
  "\\.action-picker",
  "\\.sheet-primary-action",
  "\\.sheet-quiet-action",
  "\\.sheet-secondary-actions button",
  "\\.backup-choice",
]) {
  assert.match(homeStyles, new RegExp(`${selector}[^}]*min-height:\\s*48px`), `${selector} must retain a 48px runtime minimum`);
}
const fullWidthSheetActions = homeStyles.match(/\.sheet-primary-action,\.sheet-quiet-action\s*\{([^}]*)\}/)?.[1] ?? "";
assert.match(fullWidthSheetActions, /min-width:\s*100%/);
assert.match(fullWidthSheetActions, /max-width:\s*100%/);
assert.match(homeStyles, /\.action-sheet-body[^}]*width:\s*calc\(100vw - 64rpx\)/);
assert.match(homeStyles, /\.sheet-secondary-actions[^}]*grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\)/);
assert.match(homeStyles, /\.sheet-secondary-actions button[^}]*min-width:\s*0/);
assert.match(homeStyles, /\.backup-choice[^}]*min-width:\s*100%[^}]*max-width:\s*100%/);
assert.match(homeMarkup, /title="\{\{selectedRecommendation \? selectedRecommendation\.title : '穿搭详情'\}\}"/);
assert.doesNotMatch(homeMarkup, /保存为我的套装|保存到我的套装/);
assert.match(homeMarkup, /保存为套装/);
assert.match(homeMarkup, /ui-icon name="map-pin"/);
assert.match(generatedIcons, /"map-pin":\s*\{/);

for (const windowWidth of [360, 390, 430]) {
  const geometry = calculateCapsuleGeometry({
    windowWidth,
    statusBarHeight: 24,
    menu: { top: 28, height: 32, left: windowWidth - 95 },
  });
  const layout = calculateSubPageTopBarLayout(geometry, true, 96);
  const actionLeftRpx = 750 - layout.rightSlotRpx - 96;
  const titleRightRpx = 750 - layout.titleRightRpx;
  const titleWidthRpx = titleRightRpx - layout.titleLeftRpx;
  assert.ok(titleWidthRpx > 0, `${windowWidth}px must retain a title region`);
  assert.equal(titleRightRpx + 16, actionLeftRpx, `${windowWidth}px must keep a 16rpx action gap`);
  assert.equal(layout.titleLeftRpx, 96, `${windowWidth}px must preserve the back-button safe inset`);
  assert.ok(titleWidthRpx >= 320, `${windowWidth}px must keep the four-character detail title readable`);
}

const topBarWxml = fs.readFileSync("components/domain/sub-page-top-bar/index.wxml", "utf8");
const topBarWxss = fs.readFileSync("components/domain/sub-page-top-bar/index.wxss", "utf8");
const detailShell = fs.readFileSync("components/domain/item-detail-shell/index.wxml", "utf8");
const detailShellStyles = fs.readFileSync("components/domain/item-detail-shell/index.wxss", "utf8");
assert.match(topBarWxml, /left: \{\{titleLeftRpx\}\}rpx/);
assert.match(topBarWxml, /right: \{\{titleRightRpx\}\}rpx/);
assert.doesNotMatch(topBarWxss, /right:\s*220rpx/);
assert.match(
  topBarWxss.match(/\.sub-page-top-bar__back\s*\{([\s\S]*?)\}/)?.[1] ?? "",
  /min-width:\s*var\(--hit-target-min\)[\s\S]*min-height:\s*var\(--hit-target-min\)/,
  "the shared back action must never scale below the 44px touch target",
);
assert.match(detailShell, /has-right-action/);
assert.match(detailShell, /item-detail-shell__top-action/);
assert.match(
  detailShellStyles.match(/\.item-detail-shell__top-action\s*\{([\s\S]*?)\}/)?.[1] ?? "",
  /width:\s*96rpx/,
);

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
