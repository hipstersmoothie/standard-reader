import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { getContext } from "./integrations/tanstack-query/root-provider";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const context = getContext();

  const router = createTanStackRouter({
    routeTree,
    context,
    // The document is the scroll container, so the router's default window
    // scroll restoration + scroll-to-top applies (no custom selector needed).
    scrollRestoration: true,
    defaultPreload: "intent",
    // Preloaded data stays fresh for 30s — long enough to hover→click without a
    // refetch, short enough to not serve stale data on a real navigation later.
    defaultPreloadStaleTime: 30_000,
    // Keep the `:` in `did:plc:…` literal in `/p/$did/$rkey` (don't %-encode it).
    pathParamsAllowedCharacters: [":"],
  });

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
