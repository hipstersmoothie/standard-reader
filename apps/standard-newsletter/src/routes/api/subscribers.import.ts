import { createFileRoute } from "@tanstack/react-router";

/**
 * Author bulk email import into a publication's subscriber list. The caller
 * must be signed in and own the publication (its AT-URI DID == the caller's).
 * POST { publicationUri, emails } where `emails` is free text or an array.
 */
export const Route = createFileRoute("/api/subscribers/import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getCurrentUserDid } =
          await import("#/integrations/auth/session.server");
        const authorDid = await getCurrentUserDid(request);
        if (!authorDid) {
          return Response.json(
            { ok: false, error: "unauthenticated" },
            { status: 401 },
          );
        }

        let body: { publicationUri?: unknown; emails?: unknown };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json(
            { ok: false, error: "invalid-json" },
            { status: 400 },
          );
        }
        const publicationUri =
          typeof body.publicationUri === "string" ? body.publicationUri : "";
        if (!publicationUri.startsWith(`at://${authorDid}/`)) {
          // Only the publication's owner may import into its list.
          return Response.json(
            { ok: false, error: "not-owner" },
            { status: 403 },
          );
        }

        const { parseEmails } =
          await import("#/server/happyview/author-list.server");
        const emails = Array.isArray(body.emails)
          ? parseEmails(body.emails.join("\n"))
          : parseEmails(typeof body.emails === "string" ? body.emails : "");
        if (emails.length === 0) {
          return Response.json(
            { ok: false, error: "no-valid-emails" },
            { status: 400 },
          );
        }

        // Restore the author's session for the space write from whichever
        // client signed them in — with HappyView that's the brokered client,
        // whose DPoP key HappyView provisioned (the atproto client's key isn't,
        // and the write would 401).
        const { restoreAuthorSession } =
          await import("#/integrations/auth/happyview-oauth.server");
        const session = await restoreAuthorSession(authorDid);
        if (!session) {
          return Response.json(
            { ok: false, error: "no-session" },
            { status: 401 },
          );
        }

        // The HappyView space write can throw (instance unreachable, DPoP/auth,
        // an unexpected non-404 on read). Catch it so the client gets a JSON
        // reason instead of a 500 that reads as a generic failure — and so the
        // underlying message is logged for the operator.
        try {
          const { importEmails } =
            await import("#/server/happyview/author-list.server");
          const result = await importEmails({
            session,
            publicationUri,
            emails,
          });
          return Response.json(result, { status: result.ok ? 200 : 400 });
        } catch (error) {
          console.error("[subscribers/import] import failed:", error);
          return Response.json(
            {
              ok: false,
              error: "import-error",
              message: error instanceof Error ? error.message : String(error),
            },
            { status: 502 },
          );
        }
      },
    },
  },
});
