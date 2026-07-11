import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tests/generic-app.test.ts",
      "tests/generic-mini.test.ts",
      "tests/mini-wishlist-regression.test.ts",
      "tests/wishlist-settings-mappings.test.ts",
    ],
  },
});
