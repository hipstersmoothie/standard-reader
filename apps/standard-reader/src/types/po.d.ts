/**
 * `.po` catalogs are compiled to JS modules by `@lingui/vite-plugin`, so they
 * can be imported directly from source. TypeScript needs to be told what that
 * import yields.
 */
declare module "*.po" {
  export const messages: Record<string, string>;
}
