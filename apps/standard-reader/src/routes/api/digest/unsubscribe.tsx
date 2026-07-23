import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";

import { verifyUnsubscribeToken } from "#/server/digest/unsubscribe-token";

/**
 * One-click weekly-digest unsubscribe. The link in every digest carries a
 * signed `<userId>.<hmac>` token (see `src/server/digest/unsubscribe-token.ts`)
 * so the recipient can unsubscribe without being logged in.
 *
 * - GET  → the footer "Unsubscribe" link; flips the flag and shows a small
 *          confirmation page.
 * - POST → RFC 8058 `List-Unsubscribe-Post` one-click, invoked by Gmail/Apple
 *          Mail's native unsubscribe button; flips the flag and returns 200.
 *
 * Requires `DIGEST_UNSUBSCRIBE_SECRET` on the web service (same value the send
 * runner signs with).
 */

async function unsubscribe(token: string | null): Promise<boolean> {
  if (!token) return false;
  const userId = verifyUnsubscribeToken(token);
  if (!userId) return false;

  const [{ db }, schema] = await Promise.all([
    import("#/db/index.server"),
    import("#/db/schema"),
  ]);
  await db
    .update(schema.user)
    .set({ weeklyDigestEnabled: false })
    .where(eq(schema.user.id, userId));
  return true;
}

function confirmationPage(ok: boolean): Response {
  const title = ok ? "Unsubscribed" : "Link expired";
  const message = ok
    ? "You’ve been unsubscribed from the weekly Standard digest. You can re-enable it any time from your settings."
    : "This unsubscribe link is invalid or has expired. You can manage the weekly digest from your settings.";
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} · Standard</title>
<style>
  body { margin:0; background:#f2ede4; color:#33302b; font-family:'Atkinson Hyperlegible Next',system-ui,-apple-system,Arial,sans-serif; }
  .wrap { max-width:520px; margin:14vh auto 0; padding:0 24px; text-align:center; }
  h1 { font-family:Georgia,'Times New Roman',serif; font-style:italic; font-weight:500; font-size:30px; margin:0 0 12px; }
  p { color:#5f5b52; font-size:16px; line-height:1.5; margin:0 0 24px; }
  a { display:inline-block; color:#a5492b; font-weight:700; text-decoration:none; }
  @media (prefers-color-scheme: dark) { body { background:#17150f; color:#efe9dc; } p { color:#c3bcac; } }
</style></head>
<body><div class="wrap">
  <h1>${title}</h1>
  <p>${message}</p>
  <a href="/settings">Manage your digest →</a>
</div></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export const Route = createFileRoute("/api/digest/unsubscribe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token");
        const ok = await unsubscribe(token);
        return confirmationPage(ok);
      },
      POST: async ({ request }) => {
        // One-click (List-Unsubscribe-Post): token may be in the query string.
        const token = new URL(request.url).searchParams.get("token");
        const ok = await unsubscribe(token);
        return new Response(null, { status: ok ? 200 : 400 });
      },
    },
  },
});
