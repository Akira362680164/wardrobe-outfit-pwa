import { test as base, type Page } from "@playwright/test";

export interface E2EFixtures {
  consoleErrors: string[];
  requestErrors: string[];
}

export const test = base.extend<E2EFixtures>({
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));
    await use(errors);
  },
  requestErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("response", (resp) => {
      if (resp.status() >= 500) {
        errors.push(`5xx: ${resp.request().method()} ${resp.url()} → ${resp.status()}`);
      }
    });
    page.on("requestfailed", (req) => {
      errors.push(`requestfailed: ${req.method()} ${req.url()} — ${req.failure()?.errorText ?? "unknown"}`);
    });
    await use(errors);
  },
});

export { expect } from "@playwright/test";
