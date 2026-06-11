/**
 * Home feed scope preference (`follows` vs `network`).
 *
 * Persisted in the `standard-reader-home-scope` cookie for SSR and on
 * `user.home_scope` for signed-in readers (`null` = follows, the default).
 */
import type { HomeScope } from "#/integrations/tanstack-query/api-feed.functions";

export const DEFAULT_HOME_SCOPE: HomeScope = "follows";

export const HOME_SCOPE_COOKIE = "standard-reader-home-scope";

export const HOME_SCOPE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function parseHomeScope(value: unknown): HomeScope {
  return value === "network" ? "network" : "follows";
}

export function homeScopeToCookieValue(scope: HomeScope): HomeScope {
  return scope;
}

export function homeScopeToDbValue(scope: HomeScope): HomeScope | null {
  return scope === "network" ? "network" : null;
}

export function dbValueToHomeScope(
  value: string | null | undefined,
): HomeScope {
  return value === "network" ? "network" : "follows";
}
