import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["perf/**", "extension/**", "node_modules/**"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
