# Wardora Recommendation 1A Shadow Acceptance

> Synthetic, local-only fixtures. No production identity, image, wardrobe, database, QWeather, or PAW data is used.

Rule version: `wardora-rule-1a.1`
Fixture count: **24**
PAW mode: **disabled; neutral evaluator fallback**

## 雨天通勤 (`rainy_commute`)

- Context: commute:balanced:full_rain_protection; target 2026-07-14 in Asia/Shanghai.
- Readiness: **ready**; valid 60, displayable 3; missing slots: none.
- safe: 20000000-0000-4000-8000-000000000003 + 20000000-0000-4000-8000-000000000004 + 20000000-0000-4000-8000-000000000009 + 20000000-0000-4000-8000-000000000012 | 79.18 | reasons good_for_commute, weather_fit, rain_ready, activity_comfort, rotation_value, new_combination, shoe_rationality, outerwear_rationality, rule_fallback | risks none.
- fresh: 20000000-0000-4000-8000-000000000001 + 20000000-0000-4000-8000-000000000006 + 20000000-0000-4000-8000-000000000007 + 20000000-0000-4000-8000-000000000012 | 87.83 | reasons good_for_commute, weather_fit, activity_comfort, rotation_value, new_combination, shoe_rationality, outerwear_rationality, rule_fallback | risks none.
- comfort: 20000000-0000-4000-8000-000000000002 + 20000000-0000-4000-8000-000000000006 + 20000000-0000-4000-8000-000000000009 + 20000000-0000-4000-8000-000000000011 | 77.85 | reasons good_for_commute, weather_fit, activity_comfort, rotation_value, new_combination, shoe_rationality, outerwear_rationality, rule_fallback | risks none.
- Exclusions: 20000000-0000-4000-8000-000000000014:avoid_rule.

## 高温休闲 (`hot_casual`)

- Context: casual:cooling:none; target 2026-07-14 in Asia/Shanghai.
- Readiness: **ready**; valid 28, displayable 3; missing slots: none.
- safe: 20000000-0000-4000-8000-000000000002 + 20000000-0000-4000-8000-000000000008 + 20000000-0000-4000-8000-000000000011 | 79.18 | reasons weather_fit, activity_comfort, rotation_value, new_combination, shoe_rationality, rule_fallback | risks none.
- fresh: 20000000-0000-4000-8000-000000000002 + 20000000-0000-4000-8000-000000000008 + 20000000-0000-4000-8000-000000000014 | 86.48 | reasons weather_fit, activity_comfort, rotation_value, new_combination, shoe_rationality, rule_fallback | risks none.
- comfort: 20000000-0000-4000-8000-000000000002 + 20000000-0000-4000-8000-000000000009 + 20000000-0000-4000-8000-000000000014 | 77.85 | reasons weather_fit, activity_comfort, rotation_value, new_combination, shoe_rationality, rule_fallback | risks none.
- Exclusions: 20000000-0000-4000-8000-000000000003:temperature_mismatch; 20000000-0000-4000-8000-000000000005:avoid_rule; 20000000-0000-4000-8000-000000000006:formality_mismatch; 20000000-0000-4000-8000-000000000012:avoid_rule; 20000000-0000-4000-8000-000000000013:formality_mismatch.

## 冬季低温 (`winter_low_temperature`)

- Context: commute:warm:none; target 2026-07-14 in Asia/Shanghai.
- Readiness: **ready**; valid 3, displayable 3; missing slots: none.
- safe: 20000000-0000-4000-8000-000000000003 + 20000000-0000-4000-8000-000000000006 + 20000000-0000-4000-8000-000000000007 + 20000000-0000-4000-8000-000000000012 | 72.99 | reasons good_for_commute, activity_comfort, rotation_value, new_combination, shoe_rationality, outerwear_rationality, rule_fallback | risks none.
- fresh: 20000000-0000-4000-8000-000000000003 + 20000000-0000-4000-8000-000000000005 + 20000000-0000-4000-8000-000000000007 + 20000000-0000-4000-8000-000000000012 | 82.8 | reasons good_for_commute, activity_comfort, rotation_value, new_combination, shoe_rationality, outerwear_rationality, rule_fallback | risks none.
- comfort: 20000000-0000-4000-8000-000000000003 + 20000000-0000-4000-8000-000000000004 + 20000000-0000-4000-8000-000000000007 + 20000000-0000-4000-8000-000000000012 | 67.05 | reasons good_for_commute, activity_comfort, rotation_value, new_combination, shoe_rationality, outerwear_rationality, rule_fallback | risks none.
- Exclusions: 20000000-0000-4000-8000-000000000001:temperature_mismatch; 20000000-0000-4000-8000-000000000002:temperature_mismatch; 20000000-0000-4000-8000-000000000008:temperature_mismatch; 20000000-0000-4000-8000-000000000009:temperature_mismatch; 20000000-0000-4000-8000-000000000010:temperature_mismatch; 20000000-0000-4000-8000-000000000011:temperature_mismatch; 20000000-0000-4000-8000-000000000013:temperature_mismatch; 20000000-0000-4000-8000-000000000014:temperature_mismatch.

## 正式会议 (`formal_meeting`)

- Context: business:balanced:none; target 2026-07-14 in Asia/Shanghai.
- Readiness: **ready**; valid 44, displayable 3; missing slots: none.
- safe: 20000000-0000-4000-8000-000000000001 + 20000000-0000-4000-8000-000000000007 + 20000000-0000-4000-8000-000000000012 + 20000000-0000-4000-8000-000000000015 | 79.18 | reasons good_for_business, weather_fit, activity_comfort, rotation_value, new_combination, shoe_rationality, rule_fallback | risks none.
- fresh: 20000000-0000-4000-8000-000000000006 + 20000000-0000-4000-8000-000000000010 + 20000000-0000-4000-8000-000000000013 | 87.83 | reasons good_for_business, weather_fit, activity_comfort, rotation_value, new_combination, shoe_rationality, outerwear_rationality, rule_fallback | risks none.
- comfort: 20000000-0000-4000-8000-000000000003 + 20000000-0000-4000-8000-000000000007 + 20000000-0000-4000-8000-000000000013 + 20000000-0000-4000-8000-000000000015 | 76.65 | reasons good_for_business, weather_fit, activity_comfort, rotation_value, new_combination, shoe_rationality, rule_fallback | risks none.
- Exclusions: 20000000-0000-4000-8000-000000000002:formality_mismatch; 20000000-0000-4000-8000-000000000008:formality_mismatch; 20000000-0000-4000-8000-000000000011:formality_mismatch; 20000000-0000-4000-8000-000000000014:formality_mismatch; 20000000-0000-4000-8000-000000000016:formality_mismatch.

## 旅行户外 (`travel_outdoor`)

- Context: travel:balanced:none; target 2026-07-14 in Asia/Shanghai.
- Readiness: **ready**; valid 60, displayable 3; missing slots: none.
- safe: 20000000-0000-4000-8000-000000000002 + 20000000-0000-4000-8000-000000000008 + 20000000-0000-4000-8000-000000000011 | 79.45 | reasons good_for_travel, weather_fit, activity_comfort, rotation_value, new_combination, shoe_rationality, rule_fallback | risks none.
- fresh: 20000000-0000-4000-8000-000000000002 + 20000000-0000-4000-8000-000000000008 + 20000000-0000-4000-8000-000000000014 | 86.48 | reasons good_for_travel, weather_fit, activity_comfort, rotation_value, new_combination, shoe_rationality, rule_fallback | risks none.
- comfort: 20000000-0000-4000-8000-000000000010 + 20000000-0000-4000-8000-000000000011 | 81.3 | reasons good_for_travel, weather_fit, activity_comfort, rotation_value, new_combination, shoe_rationality, rule_fallback | risks none.
- Exclusions: 20000000-0000-4000-8000-000000000006:formality_mismatch; 20000000-0000-4000-8000-000000000013:formality_mismatch+avoid_rule.

## 连衣裙模板 (`dress_template`)

- Context: commute:balanced:none; target 2026-07-14 in Asia/Shanghai.
- Readiness: **ready**; valid 16, displayable 3; missing slots: none.
- safe: 20000000-0000-4000-8000-000000000006 + 20000000-0000-4000-8000-000000000010 + 20000000-0000-4000-8000-000000000013 | 79.18 | reasons good_for_commute, weather_fit, activity_comfort, rotation_value, new_combination, shoe_rationality, outerwear_rationality, rule_fallback | risks none.
- fresh: 20000000-0000-4000-8000-000000000004 + 20000000-0000-4000-8000-000000000010 + 20000000-0000-4000-8000-000000000012 | 86.83 | reasons good_for_commute, weather_fit, activity_comfort, rotation_value, new_combination, shoe_rationality, outerwear_rationality, rule_fallback | risks none.
- comfort: 20000000-0000-4000-8000-000000000004 + 20000000-0000-4000-8000-000000000010 + 20000000-0000-4000-8000-000000000014 | 77.85 | reasons good_for_commute, weather_fit, activity_comfort, rotation_value, new_combination, shoe_rationality, outerwear_rationality, rule_fallback | risks none.
- Exclusions: none.

## 保存成功套装 (`saved_successful_outfit`)

- Context: commute:balanced:none; target 2026-07-14 in Asia/Shanghai.
- Readiness: **ready**; valid 60, displayable 3; missing slots: none.
- safe: 20000000-0000-4000-8000-000000000001 + 20000000-0000-4000-8000-000000000007 + 20000000-0000-4000-8000-000000000012 | 87.5 | reasons good_for_commute, weather_fit, activity_comfort, historical_success, rotation_value, shoe_rationality, rule_fallback | risks none.
- fresh: 20000000-0000-4000-8000-000000000003 + 20000000-0000-4000-8000-000000000006 + 20000000-0000-4000-8000-000000000009 + 20000000-0000-4000-8000-000000000012 | 87.26 | reasons good_for_commute, weather_fit, activity_comfort, rotation_value, new_combination, shoe_rationality, outerwear_rationality, rule_fallback | risks none.
- comfort: 20000000-0000-4000-8000-000000000001 + 20000000-0000-4000-8000-000000000008 + 20000000-0000-4000-8000-000000000012 | 77.85 | reasons good_for_commute, weather_fit, activity_comfort, rotation_value, new_combination, shoe_rationality, rule_fallback | risks none.
- Exclusions: none.

## 最近重复 (`recent_repeat`)

- Context: commute:balanced:none; target 2026-07-14 in Asia/Shanghai.
- Readiness: **ready**; valid 60, displayable 3; missing slots: none.
- safe: 20000000-0000-4000-8000-000000000003 + 20000000-0000-4000-8000-000000000006 + 20000000-0000-4000-8000-000000000009 + 20000000-0000-4000-8000-000000000012 | 77.8 | reasons good_for_commute, weather_fit, activity_comfort, rotation_value, new_combination, shoe_rationality, outerwear_rationality, rule_fallback | risks none.
- fresh: 20000000-0000-4000-8000-000000000003 + 20000000-0000-4000-8000-000000000004 + 20000000-0000-4000-8000-000000000009 + 20000000-0000-4000-8000-000000000013 | 86.51 | reasons good_for_commute, weather_fit, activity_comfort, rotation_value, new_combination, shoe_rationality, outerwear_rationality, rule_fallback | risks none.
- comfort: 20000000-0000-4000-8000-000000000002 + 20000000-0000-4000-8000-000000000009 + 20000000-0000-4000-8000-000000000013 | 77.85 | reasons good_for_commute, weather_fit, activity_comfort, rotation_value, new_combination, shoe_rationality, rule_fallback | risks none.
- Exclusions: none.

## limited (`limited_two_candidates`)

- Context: commute:balanced:none; target 2026-07-14 in Asia/Shanghai.
- Readiness: **limited**; valid 2, displayable 2; missing slots: none.
- safe: 20000000-0000-4000-8000-000000000001 + 20000000-0000-4000-8000-000000000007 + 20000000-0000-4000-8000-000000000012 | 79.18 | reasons good_for_commute, weather_fit, activity_comfort, rotation_value, new_combination, shoe_rationality, rule_fallback | risks none.
- fresh: 20000000-0000-4000-8000-000000000001 + 20000000-0000-4000-8000-000000000007 + 20000000-0000-4000-8000-000000000011 | 85.63 | reasons good_for_commute, weather_fit, activity_comfort, rotation_value, new_combination, shoe_rationality, rule_fallback | risks none.
- comfort: not returned (insufficient qualified diversity).
- Exclusions: none.

## not ready (`not_ready_missing_slot`)

- Context: commute:balanced:none; target 2026-07-14 in Asia/Shanghai.
- Readiness: **not_ready**; valid 0, displayable 0; missing slots: shoes.
- safe: not returned (insufficient qualified diversity).
- fresh: not returned (insufficient qualified diversity).
- comfort: not returned (insufficient qualified diversity).
- Exclusions: none.

## Review notes

- The report is derived from committed synthetic fixtures; expected fixture declarations are never generated or overwritten by this script.
- UUIDs are synthetic audit identifiers. Product UI copy is intentionally out of scope.
- Detailed score components and all 24 scenario results are in `shadow-audit.json`.
