import { Outlet, createFileRoute } from "@tanstack/react-router";

import { AppSidebar } from "../components/app-sidebar";
import { C } from "../theme";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
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
      <AppSidebar />
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
