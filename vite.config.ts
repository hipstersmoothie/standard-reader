import { existsSync } from "node:fs";
import path from "node:path";

import { lingui } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import stylexPlugin from "@stylexjs/unplugin/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import browserslist from "browserslist";
import { browserslistToTargets } from "lightningcss";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

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
    exclude: ["packages/design-system/**"],
  },
  plugins: [
    stylexPlugin({
      treeshakeCompensation: true,
      dev: process.env.NODE_ENV !== "production",
      // The design system now lives in a workspace package that ships source;
      // StyleX must resolve its theme vars to the same canonical files whether
      // referenced from the app or from within the package.
      aliases: {
        "@/*": [path.join(__dirname, "./src/*")],
        "#/*": [path.join(__dirname, "./src/*")],
        "@standard-reader/design-system/*": [
          path.join(__dirname, "./packages/design-system/src/*"),
        ],
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
    nitro({
      wasm: { silent: true },
      // Nitro 3's `nf3` dependency tracer calls `realpath` on every file that
      // `nodeFileTrace` collects and hard-crashes (`ENOENT`) on broken symlinks.
      // pnpm creates one such symlink per *non-current* platform for native
      // packages that gate their platform binaries via `os`/`cpu` optional deps
      // (`@resvg/resvg-js`, `sharp`, `lightningcss`, `@rolldown/binding`, …), so
      // on any single machine ~hundreds of those symlinks dangle. They point at
      // binaries for other OS/arch that were never installed and must not ship
      // anyway. Prune them from the trace before the realpath pass runs — the
      // `traceResult` hook fires first (nf3 trace.mjs), and `reasons` is a Map.
      traceOpts: {
        hooks: {
          traceResult(traceResult: { reasons: Map<string, unknown> }) {
            let pruned = 0;
            for (const tracedPath of traceResult.reasons.keys()) {
              // nf3 traces relative to base "/"; `existsSync` follows symlinks
              // and returns false for a dangling one — exactly what to drop.
              if (!existsSync(path.resolve("/", tracedPath))) {
                traceResult.reasons.delete(tracedPath);
                pruned++;
              }
            }
            if (pruned > 0) {
              console.log(
                `[nitro:trace] pruned ${pruned} unresolvable cross-platform path(s)`,
              );
            }
          },
        },
      },
    }),
    tanstackStart(),
    viteReact(),
    // Progressive Web App: Workbox service worker for offline support, asset
    // precaching, and a controlled update flow. This is a TanStack Start + Nitro
    // SSR app, so there is no static `index.html` for the plugin to inject into:
    //   - `injectRegister: false` — we register the SW manually from client code
    //     (`src/pwa/register.ts`), mounted via `<ReloadPrompt />` in `__root.tsx`.
    //   - `manifest: false` — the static `public/manifest.json` stays the source
    //     of truth; it's already linked from the root route's `head()`.
    //   - `registerType: "prompt"` — updates surface a "Reload" toast instead of
    //     silently reloading mid-article.
    // The generated `sw.js` lands in the Vite client output that Nitro serves as
    // static (`.output/public`), so scope `/` works without extra routing.
    VitePWA({
      strategies: "generateSW",
      registerType: "prompt",
      injectRegister: false,
      manifest: false,
      // TanStack Start + Nitro 3 serves static assets from `.output/public`, not
      // the default `dist/`. Point the SW output and the precache glob there so
      // the generated `sw.js` is actually served at `/sw.js` and precaches the
      // real hashed client chunks (see TanStack/router#4988).
      outDir: ".output/public",
      // SW is disabled in `vite dev` on purpose — Nitro dev + an active SW is a
      // common source of stale-cache confusion. Verify against `build`+`preview`.
      devOptions: { enabled: false },
      workbox: {
        globDirectory: ".output/public",
        // Precache ONLY the small, always-needed shell: the offline fallback,
        // the manifest, and the app icons. Deliberately do NOT precache the
        // hashed JS/CSS chunks — this app ships heavy, lazily-loaded features
        // (kokoro TTS ~1.3 MB, transformers ~0.5 MB, per-route chunks) that most
        // readers never touch. Those are runtime-cached on demand below, so an
        // install stays lightweight (~tens of KB) instead of eagerly pulling
        // ~4.5 MB. Hashed assets are immutable, so CacheFirst is safe for them.
        globPatterns: [
          "offline.html",
          "manifest.json",
          "favicon.svg",
          "apple-touch-icon.png",
          "icon-*.png",
        ],
        // The app shell HTML is server-rendered, so there is nothing to fall
        // back to from the precache — navigations are handled by runtime caching
        // (NetworkFirst) below, with `public/offline.html` as the last resort.
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        // `registerType: "prompt"` controls activation — don't skip waiting.
        skipWaiting: false,
        runtimeCaching: [
          {
            // Page navigations: prefer the network (fresh SSR HTML), fall back
            // to cache, then to the offline page when both fail.
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "pages",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
              precacheFallback: { fallbackURL: "/offline.html" },
            },
          },
          {
            // Hashed build assets (immutable). Cache on first use so repeat
            // loads and visited routes work offline, without a heavy precache.
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && url.pathname.startsWith("/assets/"),
            handler: "CacheFirst",
            options: {
              cacheName: "assets",
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Google Fonts stylesheet + font files (render-blocking `<link>`s in
            // `__root.tsx`). Cache aggressively — they're immutable and versioned.
            urlPattern: ({ url }) =>
              url.origin === "https://fonts.googleapis.com" ||
              url.origin === "https://fonts.gstatic.com",
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Article / avatar / OG images (often cross-origin CDN blobs).
            urlPattern: ({ request }) => request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "images",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
    // Compiles `.po` catalogs imported from `src/locales/**` into runtime
    // message bundles.
    lingui(),
    // React Compiler (facebook/react#36173) via @rolldown/plugin-babel +
    // reactCompilerPreset from @vitejs/plugin-react.
    // Preserve the plugin's default `node_modules` exclusion (the compiler
    // can't optimize pre-built vendor code, and processing large vendor
    // files like react-dom/katex/transformers triggers noisy Babel
    // "deoptimised styling" notes) while also skipping the vendored
    // hip-ui design system, which is copy-and-own and already linted.
    babel({
      // Lingui macros (`Trans`, `t`, `Plural`, …) are compile-time only — this
      // plugin rewrites them into runtime `@lingui/react` calls. Babel runs
      // plugins before presets, so macros are gone before React Compiler sees
      // the tree.
      //
      // NOTE: this shares the `exclude` below, so macros do NOT work inside
      // `src/design-system/`. `lingui.config.ts` excludes that directory from
      // extraction to keep the two in agreement.
      plugins: ["@lingui/babel-plugin-lingui-macro"],
      presets: [
        reactCompilerPreset({
          compilationMode: "infer",
          target: "19",
        }),
      ],
      exclude: [/[/\\]node_modules[/\\]/, /[/\\]packages[/\\]design-system[/\\]/],
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
