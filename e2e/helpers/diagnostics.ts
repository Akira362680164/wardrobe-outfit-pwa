import type { Page } from "@playwright/test";

/**
 * Check that the page has no unexpected console errors.
 * Skip known harmless messages (e.g. Capacitor warnings in browser).
 */
export function collectUnexpectedErrors(page: Page): string[] {
  const errors: string[] = [];
  const knownHarmless = [
    "Capacitor",
    "cordova",
    "Native:",
    "webpack",
    "Download the React DevTools",
  ];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (!knownHarmless.some((p) => text.includes(p))) {
        errors.push(`console.error: ${text}`);
      }
    }
  });

  page.on("pageerror", (err) => {
    if (!knownHarmless.some((p) => err.message.includes(p))) {
      errors.push(`pageerror: ${err.message}`);
    }
  });

  return errors;
}
