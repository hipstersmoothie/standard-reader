import type { QueryClient } from "@tanstack/react-query";

import * as stylex from "@stylexjs/stylex";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { useQuery } from "@tanstack/react-query";
import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { useLayoutEffect } from "react";

import { NavTelemetry } from "../components/nav-telemetry";
import {
  editorialFonts,
  editorialPrimary,
  editorialShadow,
  editorialUi,
} from "../components/reader/theme";
import { ui } from "../design-system/theme/semantic-color.stylex";
import { PlausibleAnalytics } from "../integrations/plausible/analytics";
import { user } from "../integrations/tanstack-query/api-user.functions";
import {
  listsQueryOptions,
  savedListsQueryOptions,
  sidebarQueryOptions,
} from "../integrations/tanstack-query/shell-queries";
import { getPublicUrlClient } from "../lib/public-url";
import { siteOgImageUrl, siteSocialMeta } from "../lib/site-metadata";
import { DEFAULT_THEME_MODE, RESOLVED_SCHEME_SCRIPT } from "../lib/theme";
import appCss from "../styles.css?url";
import { saveHandle } from "../utils/saved-handles";

if (import.meta.env.DEV) {
  void import("virtual:stylex:runtime");
}

interface RouterContext {
  queryClient: QueryClient;
}

const COLOR_SCHEME_CSS = `
html[data-theme="light"] { color-scheme: light; }
html[data-theme="dark"] { color-scheme: dark; }
html[data-theme="system"] { color-scheme: light; }
@media (prefers-color-scheme: dark) {
  html[data-theme="system"] { color-scheme: dark; }
}
`.trim();

/** Tag embed routes before paint (themed background comes from the embed route head). */
const EMBED_SUBSCRIBE_PATH_SCRIPT = `
(function () {
  if (location.pathname.startsWith("/embed/subscribe/")) {
    document.documentElement.dataset.embed = "subscribe";
  }
})();
`.trim();

const rootStyles = stylex.create({
  embedShellBody: {
    margin: 0,
  },
});

/**
 * The OAuth callback redirects back with `loginSuccess`, `handle`, and `avatar`
 * appended to the real browser URL. TanStack Router's `location` is built only
 * from validated route search, so we read `window.location` directly, persist
 * the handle for the next sign-in, and strip the params from the URL.
 */
function PersistOAuthSavedHandle() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useLayoutEffect(() => {
    if (globalThis.window === undefined) return;

    let url: URL;
    try {
      url = new URL(globalThis.location.href);
    } catch {
      return;
    }
    const loginSuccess = url.searchParams.get("loginSuccess");
    const handleParam = url.searchParams.get("handle");
    const avatarParam = url.searchParams.get("avatar");
    if (loginSuccess === "true" && handleParam && handleParam.trim() !== "") {
      const avatar =
        avatarParam && avatarParam.trim() !== "" ? avatarParam : null;
      saveHandle(handleParam.trim(), avatar);

      url.searchParams.delete("loginSuccess");
      url.searchParams.delete("handle");
      url.searchParams.delete("avatar");
      const qs = url.searchParams.toString();
      const next = `${url.pathname}${qs ? `?${qs}` : ""}${url.hash}`;
      globalThis.history.replaceState({}, "", next);
    }
  }, [pathname]);

  return null;
}

/** Session + shell bootstrap — skip re-fetch when hopping between child routes. */
const ROOT_BOOTSTRAP_STALE_TIME_MS = 5 * 60_000;

export const Route = createRootRouteWithContext<RouterContext>()({
  staleTime: ROOT_BOOTSTRAP_STALE_TIME_MS,
  beforeLoad: async ({ context }) => {
    const bootstrap = await user.getShellBootstrap();
    context.queryClient.setQueryData(
      user.getSessionQueryOptions.queryKey,
      bootstrap.session,
    );
    context.queryClient.setQueryData(
      user.getThemePreferenceQueryOptions.queryKey,
      bootstrap.theme,
    );
    context.queryClient.setQueryData(
      user.getTrackReadingHistoryPreferenceQueryOptions.queryKey,
      bootstrap.trackReading,
    );
    context.queryClient.setQueryData(
      user.getHomeScopePreferenceQueryOptions.queryKey,
      bootstrap.homeScope,
    );
    if (bootstrap.shell) {
      context.queryClient.setQueryData(
        sidebarQueryOptions().queryKey,
        bootstrap.shell.sidebar,
      );
      context.queryClient.setQueryData(
        listsQueryOptions().queryKey,
        bootstrap.shell.lists,
      );
      context.queryClient.setQueryData(
        savedListsQueryOptions().queryKey,
        bootstrap.shell.savedLists,
      );
    }
  },
  head: () => {
    const baseUrl = getPublicUrlClient();
    return {
      meta: [
        { charSet: "utf8" },
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1, viewport-fit=cover",
        },
        { name: "theme-color", content: "#c2502b" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-title", content: "Standard Reader" },
        ...siteSocialMeta({
          url: baseUrl,
          ogImage: siteOgImageUrl(baseUrl),
        }),
      ],
      links: [
        { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
        {
          rel: "apple-touch-icon",
          href: "/apple-touch-icon.png",
          sizes: "180x180",
        },
        { rel: "manifest", href: "/manifest.json" },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,300;1,6..72,400;1,6..72,500&family=Archivo:wght@400;500;600;700;800;900&family=Spline+Sans+Mono:wght@400;500;600&display=swap",
        },
        { rel: "stylesheet", href: appCss },
        import.meta.env.DEV
          ? { rel: "stylesheet", href: "/virtual:stylex.css" }
          : null,
      ].filter((link) => link !== null),
    };
  },
  shellComponent: RootDocument,
});

function isEmbedPath(pathname: string): boolean {
  return pathname.startsWith("/embed/");
}

function isSubscribeEmbedPath(pathname: string): boolean {
  return pathname.startsWith("/embed/subscribe/");
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const isSubscribeEmbed = isSubscribeEmbedPath(pathname);
  const { data: themePreference } = useQuery({
    ...user.getThemePreferenceQueryOptions,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const themeMode = themePreference?.mode ?? DEFAULT_THEME_MODE;

  return (
    <html
      lang="en"
      data-theme={themeMode}
      data-embed={isSubscribeEmbed ? "subscribe" : undefined}
      suppressHydrationWarning
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: COLOR_SCHEME_CSS }} />
        <script
          dangerouslySetInnerHTML={{ __html: EMBED_SUBSCRIBE_PATH_SCRIPT }}
        />
        <script dangerouslySetInnerHTML={{ __html: RESOLVED_SCHEME_SCRIPT }} />
        <HeadContent />
      </head>
      <body
        {...stylex.props(
          isSubscribeEmbed
            ? rootStyles.embedShellBody
            : [
                editorialUi,
                editorialPrimary,
                editorialFonts,
                editorialShadow,
                ui.bg,
                ui.text,
              ],
        )}
      >
        <PersistOAuthSavedHandle />
        <NavTelemetry />
        {isEmbedPath(pathname) ? null : <PlausibleAnalytics />}
        {children}

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
