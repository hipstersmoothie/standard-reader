/**
 * Stands in for the `en-XA` pseudo-locale catalog in production builds.
 *
 * Both language pickers already hide the pseudo-locale unless
 * `import.meta.env.DEV` (see `user-settings-view.tsx` and `language-dialog.tsx`),
 * so in production its catalog is ~260 KB of source that every visitor
 * downloads and no visitor can select. `vite.config.ts` aliases the `.po`
 * import here for production builds; dev still gets the real catalog.
 */
export const messages: Record<string, string> = {};
