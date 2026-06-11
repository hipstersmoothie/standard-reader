import { Outlet, createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";

import { AppShell } from "../components/reader/app-shell";
import { ReaderContent } from "../components/reader/primitives";
import { Flex } from "../design-system/flex";
import { Skeleton } from "../design-system/skeleton";
import { spacing } from "../design-system/theme/spacing.stylex";
import { user } from "../integrations/tanstack-query/api-user.functions";
import {
  LAYOUT_ROUTE_STALE_TIME_MS,
  loadShellQueries,
} from "../integrations/tanstack-query/shell-queries";

export const Route = createFileRoute("/_layout")({
  staleTime: LAYOUT_ROUTE_STALE_TIME_MS,
  loader: async ({ context }) => {
    const session = context.queryClient.getQueryData(
      user.getSessionQueryOptions.queryKey,
    );
    const signedIn = Boolean(session?.user);
    await loadShellQueries(context.queryClient, signedIn);
  },
  component: LayoutRoute,
});

function RouteContentFallback() {
  return (
    <ReaderContent>
      <div aria-busy="true" aria-label="Loading page">
        <Flex direction="column" gap="3xl">
          <Skeleton variant="rectangle" height={spacing["4"]} width="32%" />
          <Skeleton variant="rectangle" height={spacing["10"]} width="48%" />
          <Skeleton variant="rectangle" height={spacing["5"]} width="72%" />
        </Flex>
      </div>
    </ReaderContent>
  );
}

function LayoutRoute() {
  return (
    <AppShell>
      <Suspense fallback={<RouteContentFallback />}>
        <Outlet />
      </Suspense>
    </AppShell>
  );
}
