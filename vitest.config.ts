import path from "node:path";

import stylexPlugin from "@stylexjs/unplugin/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // The design system styles with StyleX, which must be compiled — importing a
  // `.stylex` module (or a component that uses `stylex.create`) without the
  // transform throws "call at runtime". Mirror `vite.config.ts` so design-system
  // code (e.g. the rich-text editor) is testable.
  plugins: [
    stylexPlugin({
      dev: true,
      aliases: {
        "@/*": [path.join(__dirname, "./src/*")],
        "#/*": [path.join(__dirname, "./src/*")],
        "@standard-reader/design-system/*": [
          path.join(__dirname, "./packages/design-system/src/*"),
        ],
      },
    }),
  ],
  test: {
    include: [
      "src/**/*.test.ts",
      "packages/design-system/**/*.test.ts",
    ],
    exclude: ["perf/**", "extension/**", "node_modules/**"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
