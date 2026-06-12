import stylexPlugin from "@stylexjs/unplugin/vite";
import browserslist from "browserslist";
import { browserslistToTargets } from "lightningcss";
import path from "node:path";
import { defineConfig } from "wxt";

import {
  ensureStylexDevAssets,
  stylexCssOnlyDevFixPlugin,
  stylexDevServerOriginPlugins,
} from "./src/lib/stylex-dev-origin-plugin.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const wxtCommand =
  process.argv.find((arg) =>
    ["prepare", "build", "zip", "dev"].includes(arg),
  ) ?? "dev";
const isWxtDev = wxtCommand === "dev";
const isWxtPrepare = wxtCommand === "prepare";
const isOneShotBuild = wxtCommand === "build" || wxtCommand === "zip";

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
    "build:done": async (wxt) => {
      // Dev pre-render writes HTML after Vite closeBundle — patch StyleX URLs here.
      if (wxt.config.command === "serve" && wxt.server?.origin) {
        await ensureStylexDevAssets(wxt.config.outDir, wxt.server.origin);
      }
      if (isOneShotBuild) {
        // @stylexjs/unplugin leaves async handles open after one-shot builds.
        setTimeout(() => process.exit(0), 500);
      }
    },
    "prepare:types": () => {
      if (isWxtPrepare) {
        // prepare:types runs just before type files are written; allow that to finish.
        setTimeout(() => process.exit(0), 1500);
      }
    },
  },
  vite: () => ({
    build: { cssCodeSplit: false },
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
    plugins: stylexPlugins,
  }),
  manifest: {
    name: "Standard Reader",
    description:
      "Save articles and follow publications on the standard.site network.",
    permissions: ["tabs", "activeTab", "storage", "cookies", "contextMenus"],
    host_permissions: [
      "https://standard-reader.app/*",
      "https://staging.standard-reader.app/*",
      "http://127.0.0.1:3000/*",
      "http://127.0.0.1:3001/*",
      "https://bsky.app/*",
      "https://staging.bsky.app/*",
      "<all_urls>",
    ],
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
  },
});
