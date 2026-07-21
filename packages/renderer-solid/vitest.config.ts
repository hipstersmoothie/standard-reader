import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts"],
    server: { deps: { inline: ["solid-js"] } },
  },
  resolve: {
    conditions: ["development", "browser"],
  },
});
