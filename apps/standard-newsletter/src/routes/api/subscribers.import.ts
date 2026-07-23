import type { Did } from "@atcute/lexicons";
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

        const { atprotoOAuth } =
          await import("#/integrations/auth/atproto.server");
        let session: {
          did: string;
          handle: (pathname: string, init?: RequestInit) => Promise<Response>;
        } | null = null;
        try {
          session = await atprotoOAuth.restore(authorDid as Did);
        } catch {
          session = null;
        }
        if (!session) {
          return Response.json(
            { ok: false, error: "no-session" },
            { status: 401 },
          );
        }

        const { importEmails } =
          await import("#/server/happyview/author-list.server");
        const result = await importEmails({
          session,
          publicationUri,
          emails,
        });
        return Response.json(result, { status: result.ok ? 200 : 400 });
      },
    },
  },
});
