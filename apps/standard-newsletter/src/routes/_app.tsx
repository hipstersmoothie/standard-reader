import { useSuspenseQuery } from "@tanstack/react-query";
import { Outlet, createFileRoute } from "@tanstack/react-router";

import { AppSidebar } from "../components/app-sidebar";
import { publicationsQueryOptions } from "../server/analytics";
import { C } from "../theme";

export const Route = createFileRoute("/_app")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(publicationsQueryOptions()),
  component: AppLayout,
});

function AppLayout() {
  const { data: publications } = useSuspenseQuery(publicationsQueryOptions());
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
      <AppSidebar publications={publications} />
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
