import * as stylex from "@stylexjs/stylex";
import { Outlet, createFileRoute } from "@tanstack/react-router";

import { docsStyles } from "../components/docs/docs-page.stylex";
import { DocsTopbar } from "../components/docs/docs-topbar";

export const Route = createFileRoute("/_docs-header-layout")({
  component: DocsHeaderLayoutRoute,
});

function DocsHeaderLayoutRoute() {
  return (
    <div {...stylex.props(docsStyles.page)}>
      <DocsTopbar />
      <Outlet />
    </div>
  );
}
