import { useSuspenseQuery } from "@tanstack/react-query";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { AppSidebar } from "../components/app-sidebar";
import { getAppAccess, publicationsQueryOptions } from "../server/analytics";
import { C } from "../theme";

export const Route = createFileRoute("/_app")({
  loader: async ({ context, location }) => {
    const access = await getAppAccess();
    if (access.mode === "login") {
      throw redirect({
        to: "/login",
        search: { redirect: location.pathname, error: undefined },
      });
    }
    // Seed the viewer cache from the access check, then ensure publications.
    context.queryClient.setQueryData(["viewer"], access.viewer);
    await context.queryClient.ensureQueryData(publicationsQueryOptions());
    // Past the redirect above the viewer is guaranteed; hand it to the shell
    // from the loader so the sidebar doesn't have to narrow a nullable query.
    return { viewer: access.viewer };
  },
  component: AppLayout,
});

function AppLayout() {
  const { data: publications } = useSuspenseQuery(publicationsQueryOptions());
  const { viewer } = Route.useLoaderData();
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        fontFamily: C.sans,
        background: C.pageBg,
        color: C.t12,
        overflow: "hidden",
      }}
    >
      <AppSidebar publications={publications} viewer={viewer} />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        <Outlet />
      </div>
    </div>
  );
}
