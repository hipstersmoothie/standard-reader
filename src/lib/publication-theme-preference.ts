/**
 * "Use publication themes" preference — controls whether publication pages and
 * their documents are painted in the publication's own colors.
 *
 * Every publication carries a `site.standard.theme.basic` record with up to four
 * colors (background, foreground, accent, accent foreground). Those flat colors
 * are expanded into full light + dark UI/accent scales by
 * `publicationThemeScaleVars`, which the `publicationUi` / `publicationPrimary`
 * StyleX themes read to override the design-system color tokens.
 *
 * When this preference is off (the default) the app's editorial theme is used
 * everywhere and a publication's colors only ever appear in the places that are
 * intrinsically the publication's own surface (OG cards, subscribe embeds, the
 * themed subscribe login, magazine editions). When it is on, `/p/$did/$rkey` and
 * `/a/$did/$rkey` adopt the publication's palette. Publications with no theme
 * colors of their own always keep the editorial theme — see
 * `hasPublicationThemeColors`.
 *
 * Signed-in only (the setting lives on the settings page, which guests can't
 * reach), so this is stored on `user.use_publication_theme` with no cookie
 * mirror. `null` = off, the default.
 */

export const DEFAULT_USE_PUBLICATION_THEME = false;

export function usePublicationThemeToDbValue(enabled: boolean): true | null {
  return enabled ? true : null;
}

export function dbValueToUsePublicationTheme(
  value: boolean | null | undefined,
): boolean {
  return value === true;
}
