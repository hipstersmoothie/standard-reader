import path from "node:path";

import stylexPlugin from "@stylexjs/unplugin/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import browserslist from "browserslist";
import { browserslistToTargets } from "lightningcss";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

// Resolve the shared design system (a source-shipping package) so StyleX
// compiles its theme vars against the same canonical files the app references.
const designSystemSrc = path.resolve(
  import.meta.dirname,
  "../../packages/design-system/src",
);

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // `pg` is a Node-only Postgres driver; keep it out of the client optimizer and
  // external for SSR so Vite doesn't try to pre-bundle a server-only module.
  optimizeDeps: { exclude: ["pg"] },
  ssr: { external: ["pg"] },
  build: {
    // StyleX emits one shared stylesheet imported across the module graph; keep
    // it linked on every entry rather than code-split into a lazy chunk.
    cssCodeSplit: false,
    cssMinify: "esbuild",
    // `pg` / `pgpass` leak into the client graph via drizzle's node-postgres
    // types; mark them external for the client build to silence the Node-builtin
    // externalization warnings without affecting SSR.
    rolldownOptions: { external: ["pg", "pgpass"] },
  },
  oxc: { exclude: ["**/packages/design-system/**"] },
  plugins: [
    stylexPlugin({
      treeshakeCompensation: true,
      dev: process.env.NODE_ENV !== "production",
      aliases: {
        "@/*": [path.join(import.meta.dirname, "./src/*")],
        "#/*": [path.join(import.meta.dirname, "./src/*")],
        "@standard-reader/design-system/*": [`${designSystemSrc}/*`],
      },
      lightningcssOptions: {
        targets: browserslistToTargets(browserslist("baseline 2024")),
      },
    }),
    nitro(),
    tanstackStart(),
    viteReact(),
  ],
  server: {
    // Bluesky OAuth requires a loopback IP — use 127.0.0.1, not localhost.
    host: "127.0.0.1",
    port: 3001,
    strictPort: true,
  },
});
