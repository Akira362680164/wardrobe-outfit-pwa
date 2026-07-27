export type RecommendationContextMode = "forecast" | "generic" | string;

const RISK_LABELS: Readonly<Record<string, string>> = {
  missing_required_slot: "衣物组合不完整，建议补齐关键单品。",
  severe_temperature_mismatch: "温度适配风险较高，建议调整搭配。",
  severe_formality_mismatch: "正式程度可能不匹配当前场景。",
  rain_incompatible: "这套搭配不太适合当前降雨情况。",
  shoe_activity_mismatch: "鞋履可能不适合当前活动。",
  wind_rain_exposure: "风雨较强，建议加强防护。",
  outerwear_recommended: "建议增加一件外套。",
  evening_layer_recommended: "晚间可能偏凉，建议带一件薄外套。",
  too_cold: "保暖可能不足，建议增加保暖单品。",
  too_hot: "穿着可能偏热，建议选择更轻薄的单品。",
  rain_exposure: "可能遇到降雨，建议增加防雨准备。",
  wind_exposure: "可能遇到较强风力，建议增加防风准备。",
  shoe_discomfort: "鞋履舒适度可能不足，建议更换。",
  formality_mismatch: "正式程度可能不匹配当前场景。",
  activity_mismatch: "这套搭配可能不适合当前活动。",
  missing_required_layer: "保暖层次可能不足，建议增加外搭。",
  style_conflict: "单品风格协调度有限，建议调整组合。",
};

export function recommendationRiskLabel(value: string | undefined, mode: RecommendationContextMode): string {
  if (!value) {
    return mode === "forecast"
      ? "未发现需要特别提醒的天气风险。"
      : "通用建议不作温度或降雨判断。";
  }
  return RISK_LABELS[value] ?? "这套搭配有需要留意的情况，建议查看单品后再决定。";
}
