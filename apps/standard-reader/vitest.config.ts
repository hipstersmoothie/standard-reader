import path from "node:path";

import babel from "@rolldown/plugin-babel";
import stylexPlugin from "@stylexjs/unplugin/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // The design system styles with StyleX, which must be compiled — importing a
  // `.stylex` module (or a component that uses `stylex.create`) without the
  // transform throws "call at runtime". Mirror `vite.config.ts` so app tests
  // that import design-system code compile StyleX. (The package has its own
  // vitest config for its own tests.)
  plugins: [
    // Component tests render real components, which use the Lingui macros
    // (`Trans`, `t`, …). Those are compile-time only, so without this the
    // macro import resolves to its runtime stub and throws. Mirrors
    // `vite.config.ts`, minus the React Compiler preset — tests don't need
    // the optimizer and it isn't free.
    babel({
      plugins: ["@lingui/babel-plugin-lingui-macro"],
      exclude: [
        /[/\\]node_modules[/\\]/,
        /[/\\]packages[/\\]design-system[/\\]/,
      ],
    }),
    stylexPlugin({
      dev: true,
      aliases: {
        "@/*": [path.join(__dirname, "./src/*")],
        "#/*": [path.join(__dirname, "./src/*")],
        "@standard-reader/design-system/*": [
          path.join(__dirname, "../../packages/design-system/src/*"),
        ],
      },
    }),
  ],
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["perf/**", "node_modules/**"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
