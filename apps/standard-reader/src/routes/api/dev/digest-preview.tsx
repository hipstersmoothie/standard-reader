import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";

/**
 * Dev-only weekly-digest preview: renders the digest HTML for a given account
 * (by `?did=` or `?handle=`) so it can be viewed in the `/dev/digest` tool.
 * 404s in production. Metadata (article count, subject) is returned in response
 * headers so the tool can show it without a second request.
 */

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

export const Route = createFileRoute("/api/dev/digest-preview")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isDev()) {
          return new Response("Not found", { status: 404 });
        }

        const url = new URL(request.url);
        let did = url.searchParams.get("did");
        const handle = url.searchParams.get("handle");

        const [
          { db },
          schema,
          { buildDigestForUser },
          { renderDigestEmail },
          { getPublicUrl },
        ] = await Promise.all([
          import("#/db/index.server"),
          import("#/db/schema"),
          import("#/server/digest/builder"),
          import("#/server/digest/render"),
          import("#/lib/public-url"),
        ]);

        if (!did && handle) {
          const profile = await db.query.profiles.findFirst({
            where: eq(schema.profiles.handle, handle.replace(/^@/, "").trim()),
            columns: { did: true },
          });
          did = profile?.did ?? null;
        }

        if (!did) {
          return new Response("Provide ?did= or an indexed ?handle=", {
            status: 400,
          });
        }

        const userRow = await db.query.user.findFirst({
          where: eq(schema.user.did, did),
          columns: { id: true },
        });

        const digest = await buildDigestForUser(db, schema, { did });
        const rendered = await renderDigestEmail(digest, {
          baseUrl: getPublicUrl(),
          userId: userRow?.id ?? "preview",
        });

        return new Response(rendered.html, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "x-digest-article-count": String(digest.articles.length),
            "x-digest-saved-count": String(digest.saved.length),
            "x-digest-recommendation-count": String(
              digest.recommendations.length,
            ),
            // Subject may contain non-ASCII; encode for a header-safe value.
            "x-digest-subject": encodeURIComponent(rendered.subject),
          },
        });
      },
    },
  },
});
