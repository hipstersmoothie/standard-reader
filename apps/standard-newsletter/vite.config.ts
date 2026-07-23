import path from "node:path";

import babel from "@rolldown/plugin-babel";
import stylexPlugin from "@stylexjs/unplugin/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import browserslist from "browserslist";
import { browserslistToTargets } from "lightningcss";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

// Standard Newsletter mirrors Standard Reader's core tooling — TanStack Start +
// StyleX + React Compiler + the shared design system — without the reader-only
// weight (PWA offline caching, OG image rendering, on-device TTS/transformers).
const config = defineConfig({
  resolve: { tsconfigPaths: true },
  ssr: { external: ["pg"] },
  build: {
    // StyleX emits one shared virtual stylesheet across the module graph; with
    // Vite 8 / Rolldown CSS code-splitting it gets hoisted into a single route
    // chunk and other routes render unstyled on first paint. One stylesheet
    // keeps StyleX linked on every route.
    cssCodeSplit: false,
    cssMinify: "esbuild",
  },
  oxc: {
    exclude: ["**/packages/design-system/**"],
  },
  plugins: [
    stylexPlugin({
      treeshakeCompensation: true,
      dev: process.env.NODE_ENV !== "production",
      // The design system ships source from a workspace package; StyleX must
      // resolve its theme vars to the same canonical files whether referenced
      // from the app or from within the package.
      aliases: {
        "@/*": [path.join(__dirname, "./src/*")],
        "#/*": [path.join(__dirname, "./src/*")],
        "@standard-reader/design-system/*": [
          path.join(__dirname, "../../packages/design-system/src/*"),
        ],
      },
      lightningcssOptions: {
        targets: browserslistToTargets(browserslist("baseline 2024")),
      },
    }),
    nitro({ wasm: { silent: true } }),
    tanstackStart(),
    viteReact(),
    // React Compiler via @rolldown/plugin-babel + reactCompilerPreset. Skip the
    // vendored design-system package (copy-and-own, already linted) and
    // node_modules, matching the reader.
    babel({
      presets: [
        reactCompilerPreset({
          compilationMode: "infer",
          target: "19",
        }),
      ],
      exclude: [
        /[/\\]node_modules[/\\]/,
        /[/\\]packages[/\\]design-system[/\\]/,
      ],
    }),
  ],
  server: {
    host: "127.0.0.1",
    port: 3100,
    strictPort: true,
  },
});

export default config;
