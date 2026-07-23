import { createFileRoute } from "@tanstack/react-router";

import { renderSiteOgImage } from "#/server/og/site-card";

const CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";

export const Route = createFileRoute("/api/og/site")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const png = await renderSiteOgImage();

          return new Response(Buffer.from(png), {
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": CACHE_CONTROL,
            },
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to render image";
          return new Response(message, { status: 500 });
        }
      },
    },
  },
});
