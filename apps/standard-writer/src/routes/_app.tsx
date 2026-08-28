import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { fontFamily } from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { AppSidebar } from "../components/app-sidebar";
import { getAppAccess, publicationsQueryOptions } from "../server/analytics";

const styles = stylex.create({
  shell: {
    backgroundColor: uiColor.bgSubtle,
    color: uiColor.text2,
    display: "flex",
    fontFamily: fontFamily.sans,
    height: stylex.firstThatWorks("100dvh", "100vh"),
    overflow: "hidden",
  },
  content: {
    display: "flex",
    flexBasis: "0%",
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
    height: "100%",
    minWidth: 0,
  },
});

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
    <div {...stylex.props(styles.shell)}>
      <AppSidebar publications={publications} viewer={viewer} />
      <div {...stylex.props(styles.content)}>
        <Outlet />
      </div>
    </div>
  );
}
