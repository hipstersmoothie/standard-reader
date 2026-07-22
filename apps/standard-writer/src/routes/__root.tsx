import { ui } from "@standard-reader/design-system/theme/semantic-color.stylex";
import * as stylex from "@stylexjs/stylex";
import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";

import {
  editorialFonts,
  editorialPrimary,
  editorialShadow,
  editorialUi,
} from "../theme";

import appCss from "../styles.css?url";

if (import.meta.env.DEV) {
  void import("virtual:stylex:runtime");
}

interface RouterContext {
  queryClient: QueryClient;
}

const styles = stylex.create({
  body: { margin: 0 },
});

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Standard Writer" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
});

function RootDocument() {
  return (
    <html lang="en" data-theme="system">
      <head>
        <HeadContent />
      </head>
      <body
        {...stylex.props(
          editorialUi,
          editorialPrimary,
          editorialFonts,
          editorialShadow,
          ui.bg,
          ui.text,
          styles.body,
        )}
      >
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
