import path from "node:path";

import stylexPlugin from "@stylexjs/unplugin/vite";
import { defineConfig } from "vitest/config";

// StyleX must be compiled for the design system's own tests; without the
// transform, `stylex.create`/`defineVars` throw "call at runtime". The package
// ships no tests of its own yet, so the suite passes when empty.
export default defineConfig({
  plugins: [
    stylexPlugin({
      dev: true,
      aliases: {
        "@standard-reader/design-system/*": [path.join(__dirname, "./src/*")],
      },
    }),
  ],
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules/**"],
    passWithNoTests: true,
  },
});
