import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Publishing moved to the reader guide (`/guide/publishing`). It is the one
 * developer-docs page aimed at someone who writes rather than someone building
 * on the network, so it lives with the reader-facing material now.
 *
 * The old path stays as a redirect: it was linked from the docs sidebar, the
 * introduction page, and anywhere readers shared it.
 */
export const Route = createFileRoute("/_docs-header-layout/docs/publishing")({
  beforeLoad: () => {
    throw redirect({ to: "/guide/publishing", replace: true });
  },
});
