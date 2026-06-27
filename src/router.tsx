import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { getContext } from "./integrations/tanstack-query/root-provider";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const context = getContext();

  const router = createTanStackRouter({
    routeTree,
    context,
    scrollRestoration: true,
    // Main content scrolls in AppShell's `[data-app-scroller]`, not `window`.
    scrollToTopSelectors: ["[data-app-scroller]"],
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
