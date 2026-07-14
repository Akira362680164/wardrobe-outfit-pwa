export const SHANGHAI_LOCATION = {
  locationId: "101020100",
  displayName: "上海",
  timezone: "Asia/Shanghai",
  centroidLatitude: 31.23037,
  centroidLongitude: 121.4737,
};

export const GEO_SUCCESS = {
  code: "200",
  location: [{
    name: "上海",
    id: "101020100",
    lat: "31.23037",
    lon: "121.47370",
    adm2: "上海",
    adm1: "上海市",
    country: "中国",
    tz: "Asia/Shanghai",
    utcOffset: "+08:00",
    isDst: "0",
    type: "city",
    rank: "11",
    fxLink: "https://www.qweather.com/weather/shanghai-101020100.html",
  }],
  refer: { sources: ["QWeather"], license: ["QWeather Developers License"] },
};

export const NOW_SUCCESS = {
  code: "200",
  updateTime: "2026-07-14T20:00+08:00",
  fxLink: "https://www.qweather.com/weather/shanghai-101020100.html",
  now: {
    obsTime: "2026-07-14T19:54+08:00",
    temp: "31",
    feelsLike: "35",
    icon: "101",
    text: "多云",
    wind360: "135",
    windDir: "东南风",
    windScale: "2",
    windSpeed: "9",
    humidity: "68",
    precip: "0.0",
    pressure: "1004",
    vis: "18",
    cloud: "74",
    dew: "24",
  },
  refer: { sources: ["QWeather", "NMC"], license: ["QWeather Developers License"] },
};

export const HOURLY_SUCCESS = {
  code: "200",
  updateTime: "2026-07-14T20:00+08:00",
  fxLink: "https://www.qweather.com/weather/shanghai-101020100.html",
  hourly: [
    { fxTime: "2026-07-14T21:00+08:00", temp: "30", icon: "101", text: "多云", wind360: "140", windDir: "东南风", windScale: "1-3", windSpeed: "8", humidity: "70", pop: "20", precip: "0.0", pressure: "1004", cloud: "76", dew: "24", uvIndex: "0" },
    { fxTime: "2026-07-14T22:00+08:00", temp: "29", icon: "305", text: "小雨", wind360: "150", windDir: "东南风", windScale: "1-3", windSpeed: "10", humidity: "75", pop: "55", precip: "0.4", pressure: "1005", cloud: "82", dew: "24", uvIndex: "0" },
  ],
  refer: { sources: ["QWeather"], license: ["QWeather Developers License"] },
};

export const DAILY_SUCCESS = {
  code: "200",
  updateTime: "2026-07-14T20:00+08:00",
  fxLink: "https://www.qweather.com/weather/shanghai-101020100.html",
  daily: [
    { fxDate: "2026-07-14", sunrise: "05:00", sunset: "18:59", moonrise: "04:00", moonset: "18:00", moonPhase: "New Moon", moonPhaseIcon: "800", tempMax: "34", tempMin: "27", iconDay: "101", textDay: "多云", iconNight: "305", textNight: "小雨", wind360Day: "135", windDirDay: "东南风", windScaleDay: "1-3", windSpeedDay: "9", wind360Night: "135", windDirNight: "东南风", windScaleNight: "1-3", windSpeedNight: "8", humidity: "72", precip: "1.2", pressure: "1003", vis: "18", cloud: "78", uvIndex: "8" },
    { fxDate: "2026-07-15", sunrise: null, sunset: null, moonrise: null, moonset: null, moonPhase: "Waxing crescent", moonPhaseIcon: "801", tempMax: "33", tempMin: "26", iconDay: "100", textDay: "晴", iconNight: "150", textNight: "晴", wind360Day: "90", windDirDay: "东风", windScaleDay: "1-3", windSpeedDay: "7", wind360Night: "90", windDirNight: "东风", windScaleNight: "1-3", windSpeedNight: "6", humidity: "65", precip: "0.0", pressure: "1005", vis: "22", cloud: "20", uvIndex: "9" },
  ],
  refer: { sources: ["QWeather"], license: ["QWeather Developers License"] },
};

export const WEATHER_CACHE_KEY = {
  provider: "qweather" as const,
  locationId: "101020100",
  endpoint: "now" as const,
  lang: "zh" as const,
  unit: "m" as const,
};
