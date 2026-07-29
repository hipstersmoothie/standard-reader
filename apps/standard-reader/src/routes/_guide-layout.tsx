import * as stylex from "@stylexjs/stylex";
import { Outlet, createFileRoute } from "@tanstack/react-router";

import { docsStyles } from "../components/docs/docs-page.stylex";
import { GuideTopbar } from "../components/guide/guide-topbar";

export const Route = createFileRoute("/_guide-layout")({
  component: GuideLayoutRoute,
});

function GuideLayoutRoute() {
  return (
    <div {...stylex.props(docsStyles.page)}>
      <GuideTopbar />
      <Outlet />
    </div>
  );
}
