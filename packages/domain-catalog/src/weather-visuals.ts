export type QWeatherVisualDay = true | false | null;
export const QWEATHER_VISUAL_SOURCE_SHA256 = "30c97e315d2efd0d9bfcf10125177d58cf9edb479b8d9310476752277cbe37db" as const;
export type QWeatherVisualFamily = "clear" | "cloud" | "overcast" | "rain" | "thunder" | "hail" | "freezing_rain" | "snow" | "blizzard" | "sleet" | "fog" | "haze" | "dust" | "hot" | "cold" | "unknown";

export interface QWeatherVisualDefinition {
  readonly code: string;
  readonly name: string;
  readonly day: QWeatherVisualDay;
  readonly family: QWeatherVisualFamily;
  readonly severity: number;
  readonly shower: boolean;
  readonly mixed: boolean;
  readonly visibility: number;
  readonly windDrift: number;
  readonly static: boolean;
  readonly cloud?: number;
  readonly hail?: boolean;
  readonly extreme?: boolean;
  readonly drizzle?: boolean;
  readonly range?: readonly [number, number];
  readonly unknownCode?: string;
}

type Extra = Partial<Omit<QWeatherVisualDefinition, "code" | "name" | "day" | "family" | "severity">>;
const v = (code: string, name: string, day: QWeatherVisualDay, family: QWeatherVisualFamily, severity = 0, extra: Extra = {}): QWeatherVisualDefinition => Object.freeze({
  code, name, day, family, severity, shower: false, mixed: false, visibility: 1, windDrift: 0, static: false, ...extra,
});

export const QWEATHER_VISUAL_DICTIONARY = Object.freeze({
  "100": v("100", "晴（日）", true, "clear", 0, { cloud: 0 }), "101": v("101", "多云（日）", true, "cloud", 2, { cloud: 0.7 }), "102": v("102", "少云（日）", true, "cloud", 1, { cloud: 0.35 }), "103": v("103", "晴间多云（日）", true, "cloud", 1, { cloud: 0.48 }), "104": v("104", "阴", null, "overcast", 2, { cloud: 1 }),
  "150": v("150", "晴（夜）", false, "clear", 0, { cloud: 0 }), "151": v("151", "多云（夜）", false, "cloud", 2, { cloud: 0.7 }), "152": v("152", "少云（夜）", false, "cloud", 1, { cloud: 0.35 }), "153": v("153", "晴间多云（夜）", false, "cloud", 1, { cloud: 0.48 }),
  "300": v("300", "阵雨（日）", true, "rain", 2, { shower: true }), "301": v("301", "强阵雨（日）", true, "rain", 3, { shower: true, visibility: 0.72 }), "302": v("302", "雷阵雨", null, "thunder", 2, { shower: true, visibility: 0.74 }), "303": v("303", "强雷阵雨", null, "thunder", 3, { shower: true, visibility: 0.52 }), "304": v("304", "雷阵雨伴有冰雹", null, "hail", 3, { shower: true, hail: true, visibility: 0.48 }),
  "305": v("305", "小雨", null, "rain", 1), "306": v("306", "中雨", null, "rain", 2, { visibility: 0.82 }), "307": v("307", "大雨", null, "rain", 3, { visibility: 0.62 }), "308": v("308", "极端降雨", null, "rain", 4, { visibility: 0.25, windDrift: 1, extreme: true }), "309": v("309", "毛毛雨/细雨", null, "rain", 0, { drizzle: true }),
  "310": v("310", "暴雨", null, "rain", 3, { visibility: 0.45, windDrift: 0.5 }), "311": v("311", "大暴雨", null, "rain", 4, { visibility: 0.3, windDrift: 0.8 }), "312": v("312", "特大暴雨", null, "rain", 4, { visibility: 0.16, windDrift: 1.2, extreme: true }), "313": v("313", "冻雨", null, "freezing_rain", 2, { visibility: 0.72 }),
  "314": v("314", "小到中雨", null, "rain", 1.5, { range: [1, 2] }), "315": v("315", "中到大雨", null, "rain", 2.5, { range: [2, 3], visibility: 0.72 }), "316": v("316", "大到暴雨", null, "rain", 3.25, { range: [3, 3.5], visibility: 0.5 }), "317": v("317", "暴雨到大暴雨", null, "rain", 3.75, { range: [3.5, 4], visibility: 0.34 }), "318": v("318", "大暴雨到特大暴雨", null, "rain", 4, { range: [4, 4.5], visibility: 0.2, windDrift: 1 }),
  "350": v("350", "阵雨（夜）", false, "rain", 2, { shower: true }), "351": v("351", "强阵雨（夜）", false, "rain", 3, { shower: true, visibility: 0.58 }), "399": v("399", "雨", null, "rain", 2),
  "400": v("400", "小雪", null, "snow", 1, { windDrift: 0.15 }), "401": v("401", "中雪", null, "snow", 2, { windDrift: 0.35, visibility: 0.8 }), "402": v("402", "大雪", null, "snow", 3, { windDrift: 0.65, visibility: 0.58 }), "403": v("403", "暴雪", null, "blizzard", 4, { windDrift: 1.2, visibility: 0.27 }),
  "404": v("404", "雨夹雪", null, "sleet", 2, { mixed: true, windDrift: 0.3 }), "405": v("405", "雨雪天气", null, "sleet", 2, { mixed: true, windDrift: 0.35 }), "406": v("406", "阵雨夹雪（日）", true, "sleet", 2, { mixed: true, shower: true, windDrift: 0.35 }), "407": v("407", "阵雪（日）", true, "snow", 2, { shower: true, windDrift: 0.45 }),
  "408": v("408", "小到中雪", null, "snow", 1.5, { range: [1, 2], windDrift: 0.25 }), "409": v("409", "中到大雪", null, "snow", 2.5, { range: [2, 3], windDrift: 0.5, visibility: 0.68 }), "410": v("410", "大到暴雪", null, "blizzard", 3.5, { range: [3, 4], windDrift: 1, visibility: 0.38 }),
  "456": v("456", "阵雨夹雪（夜）", false, "sleet", 2, { mixed: true, shower: true, windDrift: 0.35 }), "457": v("457", "阵雪（夜）", false, "snow", 2, { shower: true, windDrift: 0.45 }), "499": v("499", "雪", null, "snow", 2, { windDrift: 0.35 }),
  "500": v("500", "薄雾", null, "fog", 1, { visibility: 0.8 }), "501": v("501", "雾", null, "fog", 2, { visibility: 0.62 }), "502": v("502", "霾", null, "haze", 2, { visibility: 0.62 }), "503": v("503", "扬沙", null, "dust", 2, { visibility: 0.58, windDrift: 0.7 }), "504": v("504", "浮尘", null, "dust", 1, { visibility: 0.72, windDrift: 0.25 }),
  "507": v("507", "沙尘暴", null, "dust", 3, { visibility: 0.3, windDrift: 1 }), "508": v("508", "强沙尘暴", null, "dust", 4, { visibility: 0.14, windDrift: 1.55 }), "509": v("509", "浓雾", null, "fog", 3, { visibility: 0.42 }), "510": v("510", "强浓雾", null, "fog", 4, { visibility: 0.24 }),
  "511": v("511", "中度霾", null, "haze", 2, { visibility: 0.56 }), "512": v("512", "重度霾", null, "haze", 3, { visibility: 0.34 }), "513": v("513", "严重霾", null, "haze", 4, { visibility: 0.2 }), "514": v("514", "大雾", null, "fog", 3.5, { visibility: 0.3 }), "515": v("515", "特强浓雾", null, "fog", 4, { visibility: 0.12 }),
  "900": v("900", "热", null, "hot", 2), "901": v("901", "冷", null, "cold", 2), "999": v("999", "未知", null, "unknown", 0),
} satisfies Readonly<Record<string, QWeatherVisualDefinition>>);

export const QWEATHER_VISUAL_CODES = Object.freeze(Object.keys(QWEATHER_VISUAL_DICTIONARY)) as readonly (keyof typeof QWEATHER_VISUAL_DICTIONARY)[];

export function resolveQWeatherVisual(code: string | number | null | undefined): QWeatherVisualDefinition {
  const key = String(code ?? "");
  return QWEATHER_VISUAL_DICTIONARY[key as keyof typeof QWEATHER_VISUAL_DICTIONARY]
    ?? v(key, "未知天气代码", null, "unknown", 0, { static: true, unknownCode: key });
}
