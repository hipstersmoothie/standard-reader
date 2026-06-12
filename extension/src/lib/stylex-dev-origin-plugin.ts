import type { Plugin, ResolvedConfig } from "vite";

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const HTML_ENTRYPOINTS = ["popup.html", "options.html"] as const;
const DEV_CSS_PATH = "/virtual:stylex.css";

/**
 * StyleX's built-in css-only HMR helper rewrites link hrefs to pathname-only
 * (`l.href = u.pathname + u.search`), which breaks extension pages served from
 * chrome-extension:// — styles must stay on the Vite dev server origin.
 */
const STYLEX_CSS_ONLY_DEV_SCRIPT = `
const DEV_CSS_PATH='${DEV_CSS_PATH}';

function bust() {
  try {
    const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
    for (const l of links) {
      if (typeof l.href === 'string' && l.href.includes(DEV_CSS_PATH)) {
        const u = new URL(l.href);
        u.searchParams.set('t', String(Date.now()));
        l.href = u.href;
      }
    }
  } catch {}
}

if (document.readyState !== 'loading') {
  bust();
} else {
  document.addEventListener('DOMContentLoaded', bust);
}

if (import.meta.hot) {
  import.meta.hot.on('stylex:css-update', bust);
}

export {};
`;

function resolveDevOrigin(
  configuredOrigin: string | undefined,
  config: ResolvedConfig,
): string {
  if (configuredOrigin) return normalizeDevOrigin(configuredOrigin);

  const port = config.server.port ?? 3001;
  const host = config.server.host;
  if (host === true || host === "" || host === "0.0.0.0") {
    return `http://127.0.0.1:${port}`;
  }
  if (typeof host === "string") {
    const hostname = host === "0.0.0.0" ? "127.0.0.1" : host;
    return `http://${hostname}:${port}`;
  }
  return `http://127.0.0.1:${port}`;
}

function normalizeDevOrigin(origin: string): string {
  try {
    const parsed = new URL(origin);
    if (parsed.hostname === "localhost") {
      parsed.hostname = "127.0.0.1";
    }
    return parsed.origin;
  } catch {
    return origin;
  }
}

function inferDevOriginFromHtml(html: string, fallback: string): string {
  const match = html.match(/https?:\/\/[^/"'\s]+/);
  return match?.[0] ?? fallback;
}

/** Rewrite relative StyleX dev URLs to the Vite dev server origin. */
export function rewriteStylexDevUrls(html: string, origin: string): string {
  return html
    .replaceAll(
      /(<script[^>]*\ssrc=")(\/@id\/virtual:stylex:(?:runtime|css-only))(")/gi,
      `$1${origin}$2$3`,
    )
    .replaceAll(
      /(<link[^>]*\shref=")(\/virtual:stylex\.css)(")/gi,
      `$1${origin}$2$3`,
    );
}

const STYLEX_DEV_LINK = (origin: string) =>
  `<link rel="stylesheet" href="${origin}/virtual:stylex.css">`;
const STYLEX_DEV_SCRIPT = (origin: string) =>
  `<script type="module" src="${origin}/@id/virtual:stylex:css-only"></script>`;

/**
 * Patch popup/options HTML after WXT dev pre-render finishes.
 * Must run in WXT's build:done — devHtmlPrerender writes HTML after Vite closeBundle.
 */
export async function ensureStylexDevAssets(
  outDir: string,
  origin: string,
): Promise<void> {
  await Promise.all(
    HTML_ENTRYPOINTS.map(async (filename) => {
      const filePath = join(outDir, filename);
      try {
        let html = await readFile(filePath, "utf8");
        const resolvedOrigin = inferDevOriginFromHtml(html, origin);
        html = rewriteStylexDevUrls(html, resolvedOrigin);

        if (!html.includes("/virtual:stylex.css")) {
          html = html.replace(
            "</head>",
            `  ${STYLEX_DEV_LINK(resolvedOrigin)}\n  ${STYLEX_DEV_SCRIPT(resolvedOrigin)}\n</head>`,
          );
        }

        await writeFile(filePath, html, "utf8");
      } catch {
        // Entrypoint may not exist for every build target.
      }
    }),
  );
}

/** Override StyleX css-only virtual module so HMR keeps absolute dev URLs. */
export function stylexCssOnlyDevFixPlugin(): Plugin {
  return {
    name: "wxt-stylex-css-only-dev-fix",
    enforce: "pre",
    resolveId(id) {
      if (id.includes("virtual:stylex:css-only")) return id;
      return null;
    },
    load(id) {
      if (id.includes("virtual:stylex:css-only")) {
        return STYLEX_CSS_ONLY_DEV_SCRIPT;
      }
      return null;
    },
  };
}

/**
 * Vite-side helpers (backup path). Primary fix is ensureStylexDevAssets in
 * WXT build:done — see extension/wxt.config.ts.
 */
export function stylexDevServerOriginPlugins(): Array<Plugin> {
  let configuredOrigin: string | undefined;
  let resolvedConfig: ResolvedConfig | undefined;

  return [
    {
      name: "wxt-stylex-dev-bind-config",
      configureServer(server) {
        configuredOrigin =
          "origin" in server && typeof server.origin === "string"
            ? server.origin
            : undefined;
      },
      configResolved(config) {
        resolvedConfig = config;
      },
    },
    {
      name: "wxt-stylex-dev-rewrite",
      transformIndexHtml: {
        order: "post",
        handler(html) {
          if (!process.argv.includes("dev") || !resolvedConfig) return html;
          const origin = resolveDevOrigin(configuredOrigin, resolvedConfig);
          return rewriteStylexDevUrls(html, origin);
        },
      },
    },
  ];
}
