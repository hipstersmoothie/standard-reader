import stylexPlugin from "@stylexjs/unplugin/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import browserslist from "browserslist";
import { browserslistToTargets } from "lightningcss";
import path from "node:path";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const config = defineConfig({
  resolve: { tsconfigPaths: true },
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
    tanstackStart(),
    nitro(),
    viteReact(),
  ],
});

export default config;
