import { Outlet, createFileRoute } from "@tanstack/react-router";

import { AppShell } from "../components/reader/app-shell";
import { feedApi } from "../integrations/tanstack-query/api-feed.functions";
import { listApi } from "../integrations/tanstack-query/api-lists.functions";
import { user } from "../integrations/tanstack-query/api-user.functions";

export const Route = createFileRoute("/_layout")({
  loader: async ({ context, location }) => {
    const session = context.queryClient.getQueryData(
      user.getSessionQueryOptions.queryKey,
    );
    const signedIn = Boolean(session?.user);
    const onHome = location.pathname === "/";

    if (signedIn) {
      await Promise.all([
        context.queryClient.ensureQueryData(feedApi.getSidebarQueryOptions()),
        context.queryClient.ensureQueryData(listApi.getListsQueryOptions()),
        context.queryClient.ensureQueryData(listApi.getSavedListsQueryOptions()),
        ...(onHome
          ? [
              context.queryClient.ensureQueryData(
                feedApi.getHomeFeedQueryOptions(),
              ),
            ]
          : []),
      ]);
      return;
    }

    if (onHome) {
      await context.queryClient.ensureQueryData(
        feedApi.getHomeFeedQueryOptions(),
      );
    }
    void context.queryClient.prefetchQuery(feedApi.getSidebarQueryOptions());
  },
  component: LayoutRoute,
});

function LayoutRoute() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
