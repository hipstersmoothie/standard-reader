import { useLingui } from "@lingui/react/macro";
import { Flex } from "@standard-reader/design-system/flex";
import { Skeleton } from "@standard-reader/design-system/skeleton";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import * as stylex from "@stylexjs/stylex";
import {
  Outlet,
  createFileRoute,
  useRouterState,
} from "@tanstack/react-router";
import { Suspense } from "react";

import { AppShell } from "../components/reader/app-shell";
import { ArticleViewSkeleton } from "../components/reader/article-view-skeleton";
import { ReaderContent } from "../components/reader/primitives";
import { PullToRefreshProvider } from "../components/reader/pull-to-refresh";
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

function isArticlePath(pathname: string): boolean {
  return /^\/a\/[^/]+\/[^/]+\/?$/.test(pathname);
}

function RouteContentFallback() {
  const { t } = useLingui();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  if (isArticlePath(pathname)) {
    return <ArticleViewSkeleton />;
  }

  return (
    <ReaderContent>
      <div aria-busy="true" aria-label={t`Loading page`}>
        <Flex direction="column" gap="3xl" style={styles.fallbackMasthead}>
          <Flex direction="column" gap="4xl">
            <Skeleton variant="rectangle" height={spacing["3.5"]} width="18%" />
            <Skeleton variant="rectangle" height={spacing["10"]} width="48%" />
          </Flex>
          <Skeleton variant="rectangle" height={spacing["5"]} width="72%" />
        </Flex>
      </div>
    </ReaderContent>
  );
}

function LayoutRoute() {
  return (
    // Wraps the shell rather than sitting inside it: the indicator the shell
    // mounts and the route that registers a refresh both have to be under the
    // same provider, and this is the one place both are in scope.
    <PullToRefreshProvider>
      <AppShell>
        <Suspense fallback={<RouteContentFallback />}>
          <Outlet />
        </Suspense>
      </AppShell>
    </PullToRefreshProvider>
  );
}

const styles = stylex.create({
  fallbackMasthead: {
    borderBottomColor: uiColor.border3,
    borderBottomStyle: "solid",
    borderBottomWidth: 2,
    marginBottom: spacing["8"],
    paddingBottom: spacing["6"],
    paddingTop: {
      default: spacing["6"],
      "@media (min-width: 40rem)": spacing["10"],
    },
  },
});
