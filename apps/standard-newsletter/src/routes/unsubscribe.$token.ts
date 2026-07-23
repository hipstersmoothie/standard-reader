import { createFileRoute } from "@tanstack/react-router";

/**
 * One-click unsubscribe. GET shows a confirmation page; POST is the RFC 8058
 * `List-Unsubscribe-Post` one-click invoked by Gmail/Apple Mail. Both flip the
 * subscriber to `unsubscribed` by its capability token.
 */
function tokenFromUrl(request: Request): string {
  const last = new URL(request.url).pathname
    .split("/")
    .findLast((s) => s.length > 0);
  return last ? decodeURIComponent(last) : "";
}

async function doUnsubscribe(request: Request): Promise<Response> {
  const [{ htmlPage }, { unsubscribeByToken }] = await Promise.all([
    import("#/lib/html-page"),
    import("#/server/subscribers.server"),
  ]);
  const ok = await unsubscribeByToken(tokenFromUrl(request));
  return ok
    ? htmlPage(
        "Unsubscribed",
        "You won’t receive any more emails from this publication.",
      )
    : htmlPage(
        "Link expired",
        "This unsubscribe link is invalid or has already been used.",
      );
}

export const Route = createFileRoute("/unsubscribe/$token")({
  server: {
    handlers: {
      GET: ({ request }) => doUnsubscribe(request),
      POST: ({ request }) => doUnsubscribe(request),
    },
  },
});
