import { createFileRoute } from "@tanstack/react-router";

/**
 * Authenticated self-preview: renders the signed-in reader's own weekly digest
 * HTML, for the "Preview" button in settings. Unlike the dev-only
 * `/api/dev/digest-preview`, this is production-safe because it only ever
 * renders the requester's own digest (resolved from their session).
 */

export const Route = createFileRoute("/api/digest/preview")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const [
          { getReaderContextForRequest },
          { db },
          schema,
          { buildDigestForUser },
          { renderDigestEmail },
          { getPublicUrl },
        ] = await Promise.all([
          import("#/middleware/auth-session.server"),
          import("#/db/index.server"),
          import("#/db/schema"),
          import("#/server/digest/builder"),
          import("#/server/digest/render"),
          import("#/lib/public-url"),
        ]);

        const reader = await getReaderContextForRequest(request);
        if (!reader?.did) {
          return new Response("Unauthorized", { status: 401 });
        }

        const digest = await buildDigestForUser(db, schema, {
          did: reader.did,
        });
        const rendered = await renderDigestEmail(digest, {
          baseUrl: getPublicUrl(),
          userId: reader.userId,
        });

        return new Response(rendered.html, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
