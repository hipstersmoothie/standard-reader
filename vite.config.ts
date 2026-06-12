import stylexPlugin from "@stylexjs/unplugin/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
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
  optimizeDeps: {
    exclude: ["@resvg/resvg-js", "kokoro-js", "@huggingface/transformers"],
  },
  ssr: { external: ["@resvg/resvg-js"] },
  // StyleX emits one shared virtual stylesheet imported across the whole module
  // graph. With Vite 8 / Rolldown CSS code-splitting, that shared CSS gets
  // hoisted into a single route chunk (e.g. the article route) instead of being
  // linked globally, so most pages render unstyled on first paint. Emitting a
  // single stylesheet keeps the StyleX output linked on every route.
  build: { cssCodeSplit: false },
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
    devtools(),
    nitro(),
    tanstackStart(),
    viteReact(),
  ],
  server: {
    // Bluesky OAuth requires loopback IP — use 127.0.0.1, not localhost.
    host: "127.0.0.1",
    port: 3000,
    strictPort: true,
  },
});

export default config;
