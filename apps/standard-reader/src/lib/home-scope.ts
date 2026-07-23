/**
 * Home feed scope preference (`follows` vs `trending`).
 *
 * Persisted in the `standard-reader-home-scope` cookie for SSR and on
 * `user.home_scope` for signed-in readers (`null` = follows, the default).
 * Legacy `"network"` values (the old "Everything" tab) are read as `trending`.
 */
import type { HomeScope } from "#/integrations/tanstack-query/api-feed.functions";

export const DEFAULT_HOME_SCOPE: HomeScope = "follows";

/**
 * Home scope default for a signed-out visitor. `follows` is meaningless without
 * an account (it degrades to the latest network feed), so guests land on
 * Trending — the most-read writing across the network — unless a cookie says
 * otherwise.
 */
export const DEFAULT_GUEST_HOME_SCOPE: HomeScope = "trending";

export const HOME_SCOPE_COOKIE = "standard-reader-home-scope";

export const HOME_SCOPE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Parse a stored scope value (cookie). An explicit `follows`/`trending`
 * (or legacy `network`) is honored; anything else falls back to `fallback`
 * ({@link DEFAULT_HOME_SCOPE} by default — pass {@link DEFAULT_GUEST_HOME_SCOPE}
 * for signed-out reads).
 */
export function parseHomeScope(
  value: unknown,
  fallback: HomeScope = DEFAULT_HOME_SCOPE,
): HomeScope {
  if (value === "trending" || value === "network") return "trending";
  if (value === "follows") return "follows";
  return fallback;
}

export function homeScopeToCookieValue(scope: HomeScope): HomeScope {
  return scope;
}

export function homeScopeToDbValue(scope: HomeScope): HomeScope | null {
  return scope === "trending" ? "trending" : null;
}

export function dbValueToHomeScope(
  value: string | null | undefined,
): HomeScope {
  return value === "trending" || value === "network" ? "trending" : "follows";
}
