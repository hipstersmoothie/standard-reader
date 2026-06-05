import * as stylex from "@stylexjs/stylex";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import Footer from "../components/Footer";
import Header from "../components/Header";
import { HeaderLayout } from "../design-system/header-layout";
import { ui } from "../design-system/theme/semantic-color.stylex";
import appCss from "../styles.css?url";

if (import.meta.env.DEV) {
  void import("virtual:stylex:runtime");
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "TanStack Start + hip-ui" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      import.meta.env.DEV
        ? { rel: "stylesheet", href: "/virtual:stylex.css" }
        : null,
    ].filter((link) => link !== null),
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body {...stylex.props(ui.bg, ui.text)}>
        <HeaderLayout.Root>
          <HeaderLayout.Header>
            <Header />
          </HeaderLayout.Header>

          <HeaderLayout.Page>{children}</HeaderLayout.Page>

          <HeaderLayout.Footer>
            <Footer />
          </HeaderLayout.Footer>
        </HeaderLayout.Root>

        <TanStackDevtools
          config={{ position: "bottom-right" }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}
