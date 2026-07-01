import type { Page } from "@playwright/test";

const KNOWN_HARMLESS = [
  "Capacitor",
  "cordova",
  "Native:",
  "webpack",
  "Download the React DevTools",
  "_next/webpack-hmr",
  "ERR_INVALID_HTTP_RESPONSE",
];

export function collectUnexpectedErrors(page: Page): string[] {
  const errors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (!KNOWN_HARMLESS.some((p) => text.includes(p))) {
        errors.push(`console.error: ${text}`);
      }
    }
  });

  page.on("pageerror", (err) => {
    if (!KNOWN_HARMLESS.some((p) => err.message.includes(p))) {
      errors.push(`pageerror: ${err.message}`);
    }
  });

  return errors;
}
