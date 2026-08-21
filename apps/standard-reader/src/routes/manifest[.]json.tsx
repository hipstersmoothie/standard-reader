import { createFileRoute } from "@tanstack/react-router";
import { getCookie } from "@tanstack/react-start/server";

import { buildWebAppManifest } from "#/lib/pwa-manifest";
import { PWA_THEME_COOKIE, parsePwaThemeCookie } from "#/lib/theme";

/**
 * `/manifest.json`, themed per reader.
 *
 * Replaces the old static `public/manifest.json` — same URL on purpose, so
 * already-installed apps pick the themed colors up on their next manifest
 * refresh instead of being stranded on the light ones. The response varies by
 * cookie and is per-reader, so it must never be cached by a shared proxy.
 *
 * `<link rel="manifest">` carries `crossorigin="use-credentials"` (see
 * `__root.tsx`); without it the manifest is fetched with credentials omitted
 * and this handler would only ever see the default light pair.
 */
export const Route = createFileRoute("/manifest.json")({
  server: {
    handlers: {
      GET: () => {
        const manifest = buildWebAppManifest(
          parsePwaThemeCookie(getCookie(PWA_THEME_COOKIE)),
        );
        return new Response(JSON.stringify(manifest), {
          headers: {
            "Content-Type": "application/manifest+json",
            "Cache-Control": "private, no-store",
            Vary: "Cookie",
          },
        });
      },
    },
  },
});
