import { createFileRoute } from "@tanstack/react-router";
import { and, eq, sql } from "drizzle-orm";

/**
 * Endpoint rotation, posted by the service worker's `pushsubscriptionchange`
 * handler (`public/push-sw.js`).
 *
 * This is a plain server route rather than a server function because the caller
 * is the service worker, which needs a stable, hand-written URL.
 *
 * The session cookie is the authorization: the old endpoint alone is not proof
 * of anything, and accepting it would let anyone who learned an endpoint
 * redirect that reader's notifications to a browser of their own. So the swap
 * only happens between rows the signed-in reader already owns.
 *
 * Safari never fires `pushsubscriptionchange`, so this is a fast path, not the
 * only one — `syncPushDevice()` re-registers on app load for everyone else.
 */

interface ResubscribeBody {
  oldEndpoint?: unknown;
  subscription?: {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 2048
    ? value
    : null;
}

export const Route = createFileRoute("/api/push/resubscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: ResubscribeBody;
        try {
          body = (await request.json()) as ResubscribeBody;
        } catch {
          return new Response(null, { status: 400 });
        }

        const oldEndpoint = asString(body.oldEndpoint);
        const endpoint = asString(body.subscription?.endpoint);
        const p256dh = asString(body.subscription?.keys?.p256dh);
        const auth = asString(body.subscription?.keys?.auth);
        if (!endpoint || !p256dh || !auth) {
          return new Response(null, { status: 400 });
        }

        const { getReaderDidForRequest } =
          await import("#/middleware/auth-session.server");
        const did = await getReaderDidForRequest(request);
        if (!did) {
          return new Response(null, { status: 401 });
        }

        const [{ db }, schema] = await Promise.all([
          import("#/db/index.server"),
          import("#/db/schema"),
        ]);

        const values = {
          endpoint,
          ownerDid: did,
          p256dh,
          auth,
          userAgent: request.headers.get("user-agent")?.slice(0, 512) ?? null,
          failureCount: 0,
          lastSeenAt: sql`now()`,
        };

        await db.insert(schema.pushDevices).values(values).onConflictDoUpdate({
          target: schema.pushDevices.endpoint,
          set: values,
        });

        // Drop the superseded row, but only if it was this reader's.
        if (oldEndpoint && oldEndpoint !== endpoint) {
          await db
            .delete(schema.pushDevices)
            .where(
              and(
                eq(schema.pushDevices.endpoint, oldEndpoint),
                eq(schema.pushDevices.ownerDid, did),
              ),
            );
        }

        return new Response(null, { status: 204 });
      },
    },
  },
});
