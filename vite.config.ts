import babel from "@rolldown/plugin-babel";
import stylexPlugin from "@stylexjs/unplugin/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import browserslist from "browserslist";
import { browserslistToTargets } from "lightningcss";
import { nitro } from "nitro/vite";
import path from "node:path";
import { defineConfig } from "vite";

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // `@resvg/resvg-js` is a server-only native module (ships a `.node` binary
  // used for OG image rendering). Vite's dependency optimizer tries to parse it
  // as JS and crashes ("stream did not contain valid UTF-8"), so keep it out of
  // the optimizer and treat it as external for SSR.
  // `kokoro-js` / `@huggingface/transformers` pull in onnxruntime-web + WASM and
  // are loaded lazily client-side for the page reader; keep them out of the
  // dependency optimizer so Vite doesn't try to pre-bundle the heavy graph.
  // `pg` is a Node-only database driver (pulls `net`, `tls`, `crypto`, etc.).
  // Vite externalizes those Node builtins for the browser but still warns on
  // each one; keeping `pg` out of the optimizer and external for SSR silences
  // the noise and avoids a useless pre-bundle of a server-only module.
  optimizeDeps: {
    exclude: [
      "@resvg/resvg-js",
      "kokoro-js",
      "@huggingface/transformers",
      "pg",
    ],
  },
  ssr: { external: ["@resvg/resvg-js", "pg"] },
  // StyleX emits one shared virtual stylesheet imported across the whole module
  // graph. With Vite 8 / Rolldown CSS code-splitting, that shared CSS gets
  // hoisted into a single route chunk (e.g. the article route) instead of being
  // linked globally, so most pages render unstyled on first paint. Emitting a
  // single stylesheet keeps the StyleX output linked on every route.
  build: {
    cssCodeSplit: false,
    // Shiki language packs, kokoro-js (TTS), and @huggingface/transformers are
    // inherently large and already lazy-loaded via dynamic import(). Raise the
    // limit so their expected size doesn't surface as a build warning.
    chunkSizeWarningLimit: 2500,
    // Vite 8 defaults to lightningcss for CSS minification, but lightningcss
    // 1.32.0 doesn't recognize the `::highlight()` Custom Highlight API
    // pseudo-element used in `styles.css` (fix merged upstream but unreleased).
    // `errorRecovery: true` only downgrades the hard error to a warning — it
    // doesn't suppress the warning itself. Use esbuild for the minification
    // pass instead; it doesn't validate pseudo-element syntax. StyleX still
    // uses lightningcss for its own compilation via `lightningcssOptions`.
    cssMinify: "esbuild",
    // `pg` / `pgpass` are Node-only database drivers. They leak into the client
    // module graph via `drizzle-orm/node-postgres` (a type-only import in
    // `api-shapes.ts` that the bundler still traces). Marking them external for
    // the client build silences the per-Node-builtin externalization warnings
    // (net, tls, crypto, fs, …) without affecting SSR, where they're already
    // externalized via `ssr.external`.
    rolldownOptions: {
      external: ["pg", "pgpass"],
    },
  },
  oxc: {
    exclude: ["src/design-system/**"],
  },
  plugins: [
    stylexPlugin({
      treeshakeCompensation: true,
      dev: process.env.NODE_ENV !== "production",
      aliases: {
        "@/*": [path.join(__dirname, "./src/*")],
        "#/*": [path.join(__dirname, "./src/*")],
      },
      lightningcssOptions: {
        targets: browserslistToTargets(browserslist("baseline 2024")),
      },
    }),
    // `wasm: { silent: true }` suppresses Nitro's unwasm plugin warning for
    // Shiki's `onig.wasm`. The WASM binary imports from `"env"` (standard WASM
    // convention), which unwasm tries to auto-resolve as a JS module, fails,
    // and warns — then falls back to module mode (base64-embedded WASM) which
    // works fine. The warning is cosmetic only.
    // Ref: https://github.com/unjs/unwasm + nuxt/content#3694
    nitro({ wasm: { silent: true } }),
    tanstackStart(),
    viteReact(),
    // React Compiler (facebook/react#36173) via @rolldown/plugin-babel +
    // reactCompilerPreset from @vitejs/plugin-react.
    // Preserve the plugin's default `node_modules` exclusion (the compiler
    // can't optimize pre-built vendor code, and processing large vendor
    // files like react-dom/katex/transformers triggers noisy Babel
    // "deoptimised styling" notes) while also skipping the vendored
    // hip-ui design system, which is copy-and-own and already linted.
    babel({
      presets: [
        reactCompilerPreset({
          compilationMode: "infer",
          target: "19",
        }),
      ],
      exclude: [/[/\\]node_modules[/\\]/, /\/src\/design-system\//],
    }),
  ],
  server: {
    // Bluesky OAuth requires loopback IP — use 127.0.0.1, not localhost.
    host: "127.0.0.1",
    port: 3000,
    strictPort: true,
  },
});

export default config;
