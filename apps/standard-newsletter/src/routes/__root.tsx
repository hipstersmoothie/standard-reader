import { ui } from "@standard-reader/design-system/theme/semantic-color.stylex";
import * as stylex from "@stylexjs/stylex";
import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  useNavigate,
} from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import type { ReactNode } from "react";
import { RouterProvider as AriaRouterProvider } from "react-aria-components";

import {
  THEME_PREPAINT_SCRIPT,
  applyThemeMode,
  readStoredThemeMode,
} from "../lib/theme";
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
    // Replays the stored light/dark choice onto `color-scheme` before the body
    // paints. SSR can't know the preference, so the markup ships as "system"
    // and this corrects it synchronously — no white flash on the way into a
    // dark-mode session.
    scripts: [{ children: THEME_PREPAINT_SCRIPT }],
  }),
  shellComponent: RootDocument,
});

/**
 * Bridges react-aria's link handling to TanStack Router.
 *
 * Every design-system component that takes an `href` — `Link`, `Button`,
 * `MenuItem` — renders a react-aria link, and without this those all fall back
 * to a full document load: the router cache is thrown away and the app boots
 * again. With it they navigate through the router like a `<Link>` does.
 *
 * react-aria only routes through here for links it considers in-app
 * (same-origin, no `target`, no modifier key), so `target="_blank"` links to a
 * publication's site still leave normally. Server endpoints that are *not*
 * routes — `/api/auth/logout` — are same-origin and would be captured, so they
 * navigate explicitly instead of being written as a link.
 */
function AriaRouting({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const routerNavigate = useCallback(
    (to: string, options?: { replace?: boolean }) => {
      void navigate({ to, replace: options?.replace });
    },
    [navigate],
  );
  return (
    <AriaRouterProvider navigate={routerNavigate}>
      {children}
    </AriaRouterProvider>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  // The pre-paint script already set `color-scheme` on <html>, but that is an
  // attribute React did not render — hydrating the document element wipes it.
  // Re-applying here (and suppressing the mismatch below) makes the choice
  // survive hydration; the script is still what prevents the flash before it.
  useEffect(() => {
    applyThemeMode(readStoredThemeMode());
  }, []);

  return (
    <html lang="en" suppressHydrationWarning>
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
        <div id="app">
          <AriaRouting>{children}</AriaRouting>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
