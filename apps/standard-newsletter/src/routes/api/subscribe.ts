import { createFileRoute } from "@tanstack/react-router";

/**
 * Subscribe an email to a publication's newsletter (double opt-in).
 * POST { publicationUri, email } → creates a `pending` row and sends the
 * confirmation email. Idempotent per (publicationUri, email).
 */
export const Route = createFileRoute("/api/subscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { publicationUri?: unknown; email?: unknown };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json(
            { ok: false, error: "invalid-json" },
            {
              status: 400,
            },
          );
        }
        const publicationUri =
          typeof body.publicationUri === "string" ? body.publicationUri : "";
        const email = typeof body.email === "string" ? body.email : "";
        if (!publicationUri || !email) {
          return Response.json(
            { ok: false, error: "missing-fields" },
            {
              status: 400,
            },
          );
        }

        const { subscribe } = await import("#/server/subscribers.server");
        const result = await subscribe({ publicationUri, email });
        if (!result.ok) {
          return Response.json(result, {
            status: result.error === "invalid-email" ? 400 : 500,
          });
        }

        if (result.status === "pending" && result.token) {
          const [{ getDb }, { publications }, { eq }] = await Promise.all([
            import("#/db/index.server"),
            import("@standard-reader/db/schema"),
            import("drizzle-orm"),
          ]);
          const db = getDb();
          const pub = db
            ? await db.query.publications.findFirst({
                where: eq(publications.uri, publicationUri),
              })
            : null;
          const { sendConfirmationEmail } =
            await import("#/server/email/send-confirmation");
          await sendConfirmationEmail({
            email,
            token: result.token,
            publicationName: pub?.name ?? "the publication",
          });
        }

        return Response.json({ ok: true, status: result.status });
      },
    },
  },
});
