import * as stylex from "@stylexjs/stylex";
import { Outlet, createFileRoute } from "@tanstack/react-router";

import { DocsApiMobileJumpNav } from "../components/docs/docs-api-mobile-jump-nav";
import { DocsApiNav } from "../components/docs/docs-api-nav";
import { DocsApiScrollSpyProvider } from "../components/docs/docs-api-scroll-spy-context";
import { docsStyles } from "../components/docs/docs-page.stylex";

export const Route = createFileRoute("/_docs-header-layout/_docs-api-layout")({
  component: DocsApiLayoutRoute,
});

function DocsApiLayoutRoute() {
  return (
    <DocsApiScrollSpyProvider>
      <DocsApiMobileJumpNav />
      <div {...stylex.props(docsStyles.refLayout)}>
        <DocsApiNav />
        <main {...stylex.props(docsStyles.refMain)}>
          <Outlet />
        </main>
      </div>
    </DocsApiScrollSpyProvider>
  );
}
