import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.wardrobe.outfit",
  appName: "衣橱穿搭助手",
  webDir: "out",
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
  android: {
    path: "android",
  },
};

export default config;
