import { createFileRoute } from "@tanstack/react-router";
import { PAGE_OG_CARDS, isPageOgSlug } from "#/lib/site-metadata";
import { renderPageOgImage } from "#/server/og/page-card";

const CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";

export const Route = createFileRoute("/api/og/page/$slug")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const slug = params.slug;
        if (!isPageOgSlug(slug)) {
          return new Response("Not Found", { status: 404 });
        }

        try {
          const card = PAGE_OG_CARDS[slug];
          const png = await renderPageOgImage({
            title: card.title,
            tagline: card.tagline,
          });

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
