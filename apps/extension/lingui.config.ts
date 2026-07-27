/**
 * The extension compiles Lingui macros out of shared app source (imported via
 * the `#`/`@` aliases), so `@lingui/babel-plugin-lingui-macro` needs a Lingui
 * config it can discover from this package. Before the monorepo split the app's
 * config sat at the repo root and the lookup walked up into it; now it lives in
 * `apps/standard-reader/`, so re-export it here.
 *
 * The extension never runs `lingui extract` — catalogs are owned by the app —
 * so this only has to describe the same locales and macro behavior.
 */
export { default } from "../standard-reader/lingui.config";
