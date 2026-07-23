import { createFileRoute } from "@tanstack/react-router";

/** Double-opt-in confirmation landing: flips a `pending` subscriber to `confirmed`. */
export const Route = createFileRoute("/subscribe/confirm")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token");
        const { htmlPage } = await import("#/lib/html-page");
        if (!token) {
          return htmlPage(
            "Invalid link",
            "This confirmation link is missing its token.",
            400,
          );
        }
        const { confirmSubscription } =
          await import("#/server/subscribers.server");
        const ok = await confirmSubscription(token);
        return ok
          ? htmlPage(
              "Subscription confirmed",
              "You’re all set — new posts will arrive in your inbox.",
            )
          : htmlPage(
              "Link expired",
              "This confirmation link is invalid or has already been used.",
            );
      },
    },
  },
});
