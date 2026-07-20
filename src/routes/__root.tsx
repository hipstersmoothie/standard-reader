import { I18nProvider as LinguiProvider } from "@lingui/react";
import * as stylex from "@stylexjs/stylex";
import type { QueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useLayoutEffect } from "react";
// React Aria ships its own `I18nProvider` (drives locale-aware date/number
// primitives); Lingui's drives message translation. Both are needed, so alias
// them apart.
import { I18nProvider as AriaI18nProvider } from "react-aria-components";

import { NavTelemetry } from "../components/nav-telemetry";
import {
  editorialFonts,
  editorialPrimary,
  editorialShadow,
  editorialUi,
} from "../components/reader/theme";
import { uiColor } from "../design-system/theme/color.stylex";
import { ui } from "../design-system/theme/semantic-color.stylex";
import { PlausibleAnalytics } from "../integrations/plausible/analytics";
import { user } from "../integrations/tanstack-query/api-user.functions";
import {
  listsQueryOptions,
  savedListsQueryOptions,
  sidebarQueryOptions,
} from "../integrations/tanstack-query/shell-queries";
import { i18nForLocale } from "../lib/i18n";
import { intlLocale } from "../lib/locale";
import { getPublicUrlClient } from "../lib/public-url";
import { siteOgImageUrl, siteSocialMeta } from "../lib/site-metadata";
import {
  DEFAULT_THEME_MODE,
  RESOLVED_SCHEME_SCRIPT,
  THEME_COLOR_BY_SCHEME,
} from "../lib/theme";
import { useLocale } from "../lib/use-locale";
import { ReloadPrompt } from "../pwa/reload-prompt";
import { saveHandle } from "../utils/saved-handles";

import appCss from "../styles.css?url";

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
  // When installed (standalone), the OS draws the title bar in `theme_color`
  // directly above the web content with no divider. Add a hairline along the
  // top edge of the app so the title bar reads as separated from the content.
  // No-op in a normal browser tab, where the browser chrome already divides it.
  standaloneTitlebarBorder: {
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: {
      default: 0,
      "@media (display-mode: standalone)": 1,
    },
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
  loader: async ({ context }) => {
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
      user.getLocalePreferenceQueryOptions.queryKey,
      bootstrap.locale,
    );
    context.queryClient.setQueryData(
      user.getLocaleHintQueryOptions.queryKey,
      bootstrap.localeHint,
    );
    context.queryClient.setQueryData(
      user.getTrackReadingHistoryPreferenceQueryOptions.queryKey,
      bootstrap.trackReading,
    );
    context.queryClient.setQueryData(
      user.getHomeScopePreferenceQueryOptions.queryKey,
      bootstrap.homeScope,
    );
    context.queryClient.setQueryData(
      user.getReaderVoicePreferenceQueryOptions.queryKey,
      bootstrap.readerVoice,
    );
    context.queryClient.setQueryData(
      user.getOpenLinksPreferenceQueryOptions.queryKey,
      bootstrap.openLinks,
    );
    context.queryClient.setQueryData(
      user.getOpenCollectionsInMagazinePreferenceQueryOptions.queryKey,
      bootstrap.openCollectionsInMagazine,
    );
    context.queryClient.setQueryData(
      user.getReadingTypographyPreferenceQueryOptions.queryKey,
      bootstrap.readingTypography,
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
        // NOTE: `theme-color` is intentionally NOT here — TanStack dedupes meta
        // by `name`, so the light/dark pair would collapse to one. They're
        // rendered as raw tags in RootDocument's <head> instead.
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-title", content: "Standard Reader" },
        ...siteSocialMeta({
          url: baseUrl,
          ogImage: siteOgImageUrl(baseUrl),
        }),
        {
          name: "google-site-verification",
          content: "p35WlJ32yt-tsksqm9KFeTHKgWNN99eeCXsVhcMb7-8",
        },
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
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossOrigin: "anonymous" as const,
        },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,300;1,6..72,400;1,6..72,500&family=Atkinson+Hyperlegible+Next:wght@400;500;600;700;800;900&family=Spline+Sans+Mono:wght@400;500;600&display=optional",
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
  // Resolved server-side (DB -> cookie -> Accept-Language) and hydrated with
  // the shell bootstrap, so `lang`/`dir` are correct on the first paint and
  // there is no flash of mis-directed layout.
  const { locale, direction } = useLocale();
  // SSR can't see the OS preference, so "system" defaults to light for the
  // initial paint; RESOLVED_SCHEME_SCRIPT corrects it synchronously before the
  // first paint, and the effect below keeps it in sync afterwards.
  const ssrScheme = themeMode === "dark" ? "dark" : "light";

  // Keep the title-bar color on the *resolved* scheme as the user toggles theme
  // (or, in "system" mode, as the OS preference flips) without a reload.
  useEffect(() => {
    if (globalThis.window === undefined) return;
    const query = globalThis.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved =
        themeMode === "dark"
          ? "dark"
          : themeMode === "light"
            ? "light"
            : query.matches
              ? "dark"
              : "light";
      const meta = document.querySelector('meta[name="theme-color"]');
      meta?.setAttribute("content", THEME_COLOR_BY_SCHEME[resolved]);
    };
    apply();
    if (themeMode !== "system") return;
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [themeMode]);

  return (
    <html
      lang={locale}
      dir={direction}
      data-theme={themeMode}
      data-embed={isSubscribeEmbed ? "subscribe" : undefined}
      suppressHydrationWarning
    >
      <head>
        {/* Browser/PWA title-bar color. A single meta (no media query) whose
            content tracks the *resolved* scheme — set pre-paint by
            RESOLVED_SCHEME_SCRIPT and kept in sync by useThemeColorMeta — so an
            explicit in-app light/dark override wins over the OS preference. */}
        <meta name="theme-color" content={THEME_COLOR_BY_SCHEME[ssrScheme]} />
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
                rootStyles.standaloneTitlebarBorder,
              ],
        )}
      >
        <PersistOAuthSavedHandle />
        <NavTelemetry />
        {isEmbedPath(pathname) ? null : <PlausibleAnalytics />}
        {isEmbedPath(pathname) ? null : <ReloadPrompt />}
        {/* Aria: locale-aware dates/numbers in the React Aria primitives
            (calendar, date picker, number field), which until now silently fell
            back to the browser default. Lingui: message translation. */}
        <AriaI18nProvider locale={intlLocale(locale)}>
          <LinguiProvider i18n={i18nForLocale(locale)}>
            {children}
          </LinguiProvider>
        </AriaI18nProvider>

        <Scripts />
      </body>
    </html>
  );
}
