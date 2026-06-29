import { defineConfig, devices } from "@playwright/test";

const APP_URL = "http://127.0.0.1:3000";
const API_URL = "http://127.0.0.1:3100";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少 Playwright 环境变量：${name}`);
  return value;
}

export default defineConfig({
  testDir: "./e2e/specs",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,

  expect: {
    timeout: 15_000,
  },

  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,

  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],

  outputDir: "test-results",

  use: {
    baseURL: APP_URL,
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  webServer: [
    {
      name: "wardrobe-api",
      command: "npm --workspace @wardrobe/wardrobe-api run dev:e2e",
      url: `${API_URL}/api/ready`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        NODE_ENV: "test",
        HOST: "127.0.0.1",
        PORT: "3100",
        DATABASE_URL: requireEnv("E2E_DATABASE_URL"),
        WARDROBE_STORAGE_ROOT: requireEnv("E2E_STORAGE_ROOT"),
        JWT_PRIVATE_KEY_PATH: requireEnv("E2E_JWT_PRIVATE_KEY_PATH"),
        JWT_PUBLIC_KEY_PATH: requireEnv("E2E_JWT_PUBLIC_KEY_PATH"),
        ALLOWED_ORIGINS: APP_URL,
      },
    },
    {
      name: "wardrobe-web",
      command: "npm run dev -- -H 127.0.0.1 -p 3000",
      url: APP_URL,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        NEXT_PUBLIC_CLOUD_AUTH_ENABLED: "true",
        NEXT_PUBLIC_ACCOUNT_WORKSPACE_ENABLED: "true",
        NEXT_PUBLIC_CLOUD_SYNC_ENABLED: "true",
        NEXT_PUBLIC_WARDROBE_API_BASE_URL: API_URL,
        NEXT_PUBLIC_E2E_TESTING: "true",
      },
    },
  ],
});
