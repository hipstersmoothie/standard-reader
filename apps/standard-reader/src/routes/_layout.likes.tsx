import { createFileRoute, redirect } from "@tanstack/react-router";

// `/likes` was renamed to `/recommended`. Keep this permanent redirect so old
// bookmarks and shared links (the route shipped to production) still resolve.
export const Route = createFileRoute("/_layout/likes")({
  beforeLoad: () => {
    throw redirect({ to: "/recommended", replace: true });
  },
});
