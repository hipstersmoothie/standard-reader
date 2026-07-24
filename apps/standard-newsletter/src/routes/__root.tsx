import { ui } from "@standard-reader/design-system/theme/semantic-color.stylex";
import * as stylex from "@stylexjs/stylex";
import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import {
  editorialFonts,
  editorialPrimary,
  editorialShadow,
  editorialUi,
} from "../theme-editorial";

// Import the global stylesheet as a side-effect (not `?url`) so it enters the
// CSS graph. With `build.cssCodeSplit: false` Vite merges it with StyleX's
// output into a single bundled `style.css`, which TanStack Start's manifest
// then injects on every route. Pulling StyleX's runtime in the same way ensures
// its generated rules are part of that stylesheet.
import "../styles.css";

void import("virtual:stylex:runtime");

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Standard Newsletter" },
      {
        name: "description",
        content:
          "Turn any standard.site publication into a newsletter — we send the emails and show you the analytics.",
      },
    ],
    links: [
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        // The three editorial families the theme names: Newsreader (serif /
        // display), Atkinson Hyperlegible Next (sans / UI), Spline Sans Mono
        // (mono). Requested in one stylesheet so there is a single blocking
        // font request.
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=Atkinson+Hyperlegible+Next:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Spline+Sans+Mono:wght@400;500&display=swap",
      },
      import.meta.env.DEV
        ? { rel: "stylesheet", href: "/virtual:stylex.css" }
        : null,
    ].filter((link) => link !== null),
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      {/* The editorial theme is applied here rather than on a nested wrapper so
          that portalled design-system surfaces (menus, popovers, dialogs) —
          which mount as children of <body> — inherit it too. */}
      <body
        {...stylex.props(
          editorialUi,
          editorialPrimary,
          editorialFonts,
          editorialShadow,
          ui.bg,
          ui.text,
        )}
      >
        <div id="app">{children}</div>
        <Scripts />
      </body>
    </html>
  );
}
