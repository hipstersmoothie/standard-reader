import path from "node:path";

import stylexPlugin from "@stylexjs/unplugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Resolve the shared design system (a source-shipping package) so StyleX
// compiles its theme vars against the same canonical files the app references.
const designSystemSrc = path.resolve(
  import.meta.dirname,
  "../../packages/design-system/src",
);

export default defineConfig({
  resolve: {
    alias: {
      "@standard-reader/design-system": designSystemSrc,
    },
  },
  build: {
    // StyleX emits one shared stylesheet imported across the module graph; keep
    // it linked on every entry rather than code-split into a lazy chunk.
    cssCodeSplit: false,
  },
  plugins: [
    stylexPlugin({
      treeshakeCompensation: true,
      dev: process.env.NODE_ENV !== "production",
      aliases: {
        "@standard-reader/design-system/*": [`${designSystemSrc}/*`],
      },
    }),
    viteReact(),
  ],
});
