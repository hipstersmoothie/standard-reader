import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { RouteError } from "./components/route-error";
import { getContext } from "./integrations/tanstack-query/root-provider";
import { routerOwnsScroll } from "./lib/router-scroll";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const context = getContext();

  const router = createTanStackRouter({
    routeTree,
    context,
    // The document is the scroll container, so the router's window scroll
    // restoration + scroll-to-top applies (no custom selector needed) —
    // everywhere except the article reader, which restores the reader's own
    // saved position and would otherwise spend its life racing this. See
    // `routerOwnsScroll`.
    scrollRestoration: ({ location }) =>
      routerOwnsScroll({ hash: location.hash, pathname: location.pathname }),
    defaultPreload: "intent",
    // Preloaded data stays fresh for 30s — long enough to hover→click without a
    // refetch, short enough to not serve stale data on a real navigation later.
    defaultPreloadStaleTime: 30_000,
    // Keep the `:` in `did:plc:…` literal in `/p/$did/$rkey` (don't %-encode it).
    pathParamsAllowedCharacters: [":"],
    // A loader that throws is usually a loader that couldn't reach the network.
    // Since queries run in `offlineFirst` mode (see `query-client.ts`), an
    // offline navigation to something the service worker never cached rejects
    // here — this is what tells the reader that, instead of showing raw error
    // text. Routes with their own `errorComponent` still win.
    defaultErrorComponent: RouteError,
  });

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
