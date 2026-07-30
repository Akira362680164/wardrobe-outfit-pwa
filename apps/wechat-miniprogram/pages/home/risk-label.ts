export type RecommendationContextMode = "forecast" | "locationless" | "weather_fallback" | string;

const RISK_LABELS: Readonly<Record<string, string>> = {
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
};

const REASON_LABELS: Readonly<Record<string, string>> = {
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
};

export function recommendationReasonLabel(value: string | undefined, mode: RecommendationContextMode): string {
  return REASON_LABELS[value ?? ""]
    ?? (mode === "forecast"
      ? "结合天气、场景与衣橱状态整理。"
      : "按场景与衣橱状态给出通用组合。");
}

export function recommendationRiskLabel(value: string | undefined, mode: RecommendationContextMode): string {
  if (!value) {
    return mode === "forecast"
      ? "未发现需要特别提醒的天气风险。"
      : "通用建议不作温度或降雨判断，出门前请自行确认天气。";
  }
  return RISK_LABELS[value]
    ?? (mode === "forecast"
      ? "未发现需要特别提醒的天气风险。"
      : "通用建议不作温度或降雨判断，出门前请自行确认天气。");
}
