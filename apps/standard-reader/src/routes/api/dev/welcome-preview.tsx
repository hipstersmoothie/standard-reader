import { createFileRoute } from "@tanstack/react-router";

/**
 * Dev-only digest-welcome preview: renders the welcome email HTML so it can be
 * viewed in the `/dev/welcome-email` tool. 404s in production. An optional
 * `?name=` sets the greeting; omit it to preview the generic ("Welcome.")
 * variant.
 */

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

export const Route = createFileRoute("/api/dev/welcome-preview")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isDev()) {
          return new Response("Not found", { status: 404 });
        }

        const url = new URL(request.url);
        const name = url.searchParams.get("name");

        const [{ renderWelcomeEmail }, { getPublicUrl }] = await Promise.all([
          import("#/server/digest/render-welcome"),
          import("#/lib/public-url"),
        ]);

        const rendered = await renderWelcomeEmail({
          baseUrl: getPublicUrl(),
          userId: "preview",
          displayName: name && name.trim() ? name.trim() : null,
        });

        return new Response(rendered.html, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            // Subject may contain non-ASCII; encode for a header-safe value.
            "x-welcome-subject": encodeURIComponent(rendered.subject),
          },
        });
      },
    },
  },
});
