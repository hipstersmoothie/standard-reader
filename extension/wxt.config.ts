import { createRequire } from "node:module";
import path from "node:path";

import stylexPlugin from "@stylexjs/unplugin/vite";
import babel from "@rolldown/plugin-babel";
import browserslist from "browserslist";
import { browserslistToTargets } from "lightningcss";
import { defineConfig } from "wxt";

import { hostPermissions } from "./src/lib/manifest-hosts.ts";
import {
  ensureStylexDevAssets,
  stylexCssOnlyDevFixPlugin,
  stylexDevServerOriginPlugins,
} from "./src/lib/stylex-dev-origin-plugin.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");

const require = createRequire(import.meta.url);
/**
 * onnxruntime-web runtime files. Newer @huggingface/transformers no longer
 * ships the `.wasm` binaries in its own dist (only the `.mjs` loader), so
 * resolve them from the onnxruntime-web package it depends on — that dir holds
 * both the loader and the version-matched wasm.
 */
const ortDistDir = path.dirname(
  createRequire(require.resolve("@huggingface/transformers")).resolve(
    "onnxruntime-web",
  ),
);
const ORT_RUNTIME_FILES = [
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
];
const wxtCommand =
  process.argv.find((arg) =>
    ["prepare", "build", "zip", "dev"].includes(arg),
  ) ?? "dev";
const isWxtDev = wxtCommand === "dev";
const isWxtPrepare = wxtCommand === "prepare";

const stylexPlugins = [
  stylexCssOnlyDevFixPlugin(),
  stylexPlugin({
    treeshakeCompensation: true,
    // css-only: no relative virtual HTML from StyleX — we inject localhost URLs.
    dev: isWxtDev,
    devMode: "css-only",
    aliases: {
      "@/*": [path.join(repoRoot, "src/*")],
      "#/*": [path.join(repoRoot, "src/*")],
    },
    lightningcssOptions: {
      targets: browserslistToTargets(browserslist("baseline 2024")),
    },
  }),
  ...stylexDevServerOriginPlugins(),
];

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  hooks: {
    // Bundle onnxruntime's WASM loader + binary. ort fetches them from a CDN
    // by default, which the extension CSP (script-src 'self') blocks; the
    // offscreen reader points `wasmPaths` at /ort/ instead.
    "build:publicAssets": (_wxt, files) => {
      for (const file of ORT_RUNTIME_FILES) {
        files.push({
          absoluteSrc: path.join(ortDistDir, file),
          relativeDest: path.join("ort", file),
        });
      }
    },
    "build:done": async (wxt) => {
      // Dev pre-render writes HTML after Vite closeBundle — patch StyleX URLs here.
      if (wxt.config.command === "serve" && wxt.server?.origin) {
        await ensureStylexDevAssets(wxt.config.outDir, wxt.server.origin);
      }
      if (wxtCommand === "build") {
        // @stylexjs/unplugin leaves async handles open after one-shot builds.
        // oxlint-disable-next-line eslint-plugin-unicorn(no-process-exit) -- force exit after WXT build
        setTimeout(() => process.exit(0), 500);
      }
    },
    "prepare:types": () => {
      if (isWxtPrepare) {
        // prepare:types runs just before type files are written; allow that to finish.
        // oxlint-disable-next-line eslint-plugin-unicorn(no-process-exit) -- force exit after WXT prepare
        setTimeout(() => process.exit(0), 1500);
      }
    },
  },
  vite: () => ({
    build: { cssCodeSplit: false },
    // kokoro-js / @huggingface/transformers pull in onnxruntime-web + WASM and
    // load lazily in the offscreen reader; keep them out of the optimizer so
    // Vite doesn't try to pre-bundle the heavy graph (mirrors the app config).
    optimizeDeps: {
      exclude: ["kokoro-js", "@huggingface/transformers"],
    },
    server: {
      host: "127.0.0.1",
      // Keep :3000 free for the TanStack app (extension API origin).
      port: 3001,
      strictPort: true,
    },
    resolve: {
      alias: {
        "#": path.join(repoRoot, "src"),
        "@": path.join(repoRoot, "src"),
      },
    },
    plugins: [
      // Compile Lingui macros (`Trans`, `t`, `Plural`, …) imported via the `#`/`@`
      // aliases into shared app source (e.g. seek-track.tsx → useLingui). Without
      // this pass the macros ship untransformed and throw "executed outside the
      // context of compilation" at runtime. Mirrors vite.config.ts in the app, which
      // uses the same plugin + excludes. `src/design-system` is intentionally
      // excluded — `lingui.config.ts` documents that macros don't work there and its
      // strings are passed in by callers instead.
      babel({
        plugins: ["@lingui/babel-plugin-lingui-macro"],
        exclude: [/[/\\]node_modules[/\\]/, /\/src\/design-system\//],
      }),
      ...stylexPlugins,
    ],
  }),
  manifest: ({ browser }) => ({
    name: "Standard Reader",
    description:
      "Save articles and follow publications on the standard.site network.",
    permissions: [
      "tabs",
      "activeTab",
      "storage",
      "cookies",
      "contextMenus",
      // Read-aloud runs in an offscreen document (Chromium only) so audio
      // survives the popup closing. Firefox has no offscreen API; the popup
      // hides the Listen button there.
      ...(browser === "firefox" ? [] : ["offscreen"]),
    ],
    host_permissions: hostPermissions(isWxtDev),
    // onnxruntime-web (Kokoro TTS) compiles fetched WASM in extension pages.
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: "standard-reader@standard-reader.app",
              // AMO requires data_collection_permissions on new submissions (Nov 2025+).
              // https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
              data_collection_permissions: {
                required: [
                  "browsingActivity", // tab URLs sent to /api/extension/resolve
                  "authenticationInfo", // HttpOnly session cookie on standard-reader.app
                  "websiteActivity", // save, follow, like actions the user initiates
                ],
              },
            },
          },
        }
      : {
          content_security_policy: {
            extension_pages:
              "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
          },
        }),
    options_ui: {
      page: "options.html",
      open_in_tab: false,
    },
    action: {
      default_title: "Standard Reader",
    },
    icons: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
      48: "icons/icon-48.png",
      128: "icons/icon-128.png",
    },
  }),
});
