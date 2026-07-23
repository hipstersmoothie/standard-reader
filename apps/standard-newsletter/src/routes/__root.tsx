import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

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
      { charSet: "utf-8" },
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
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&display=swap",
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
      <body>
        <div id="app">{children}</div>
        <Scripts />
      </body>
    </html>
  );
}
