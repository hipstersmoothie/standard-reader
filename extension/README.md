# Standard Reader extension

WXT + React MV3 browser extension. Shares hip-ui + StyleX from `../src/design-system/` via `#/*` alias.

## Scripts

```bash
pnpm extension:dev      # from repo root — hot reload
pnpm extension:build    # production build → extension/.output/chrome-mv3/
pnpm extension:zip      # zip for store upload
```

From this directory: `pnpm dev`, `pnpm build`, `pnpm compile`.

## Auth

Sign in opens the web app OAuth flow. After login, `/extension/connected` closes automatically.
The background worker reads the HttpOnly `standard-reader-auth.session_token` cookie and calls
`/api/extension/*` on the web app.

## API origin

Until `/api/extension/*` is deployed on production, the extension defaults to
`http://127.0.0.1:3000` (see `extension/.env` and `DEFAULT_API_ORIGIN` in
`src/lib/config.ts`). **Use 127.0.0.1, not `localhost`** — Bluesky OAuth redirect
URIs must match `PUBLIC_URL`.

Run the web app locally (`pnpm dev` from repo root) at **http://127.0.0.1:3000**
alongside `pnpm extension:dev` (extension dev server at **http://127.0.0.1:3001**).

When production ships the extension API, set `VITE_API_ORIGIN=https://standard-reader.app`
in `extension/.env` (or the options page) and rebuild.

## StyleX / CSS

**Dev (`pnpm extension:dev`):** StyleX uses virtual dev modules like the web app. WXT
loads popup/options from `chrome-extension://`, so relative paths like
`/virtual:stylex.css` would 404 — `stylex-dev-origin-plugin.ts` rewrites them to
`http://127.0.0.1:<port>/virtual:stylex.css` (same pattern as `virtual:wxt-html-plugins`).

**Production build:** Styles compile to real assets (`assets/style-*.css` for HTML
entrypoints, `content-scripts/content.css` for shadow-root UI).

Content scripts always import `load-stylex-styles.ts` so shadow DOM gets extension-hosted CSS.

## Store publish

- **Runbook:** [`store/DEPLOY.md`](store/DEPLOY.md) — prod build, QA, dashboard, review, updates
- **Listing copy:** [`store/README.md`](store/README.md)

## Design reference mock

The Postcard extension prototype at `http://127.0.0.1:8000/Chrome%20Extension.html`
(four browser tabs, **P** toolbar button opens the popup) maps to Standard Reader
resolve states as follows:

| Tab | Page                                 | Resolve kind  | Signed-out popup                        | Signed-in popup             |
| --- | ------------------------------------ | ------------- | --------------------------------------- | --------------------------- |
| 1   | Article (`stdout.dev`)               | `article`     | Sign-in + “We found an article…”        | Title, Save, Follow, Open   |
| 2   | Publication home (`marginalia.blog`) | `publication` | Sign-in + “This site is a publication…” | Name, Follow, Open profile  |
| 3   | Bluesky (no bound doc/pub)           | `unknown`     | Sign-in (no page hint)                  | Nothing here yet → Discover |
| 4   | Unindexed external article           | `unknown`     | Sign-in (no page hint)                  | Nothing here yet → Discover |

Tab 4 is a page with no `site.standard.document` link and no index match — same
`unknown` UI as tab 3. Test against real URLs with the unpacked extension and
local API (`pnpm dev` + `pnpm extension:dev`).

## Manual QA checklist

Load unpacked from `extension/.output/chrome-mv3/` after `pnpm extension:build`.

| Case                    | Steps                                                  | Expected                                            |
| ----------------------- | ------------------------------------------------------ | --------------------------------------------------- |
| Popup — article         | Open indexed article URL → click extension icon        | Title, Save, Follow, Open                           |
| Popup — signed out save | Sign out → open popup on article → Save                | Login tab opens; save completes after sign-in       |
| Overlay                 | Visit publication article URL (not SR app)             | Bottom-right chip; dismiss hides until page refresh |
| Overlay off             | Disable in options → revisit site                      | No chip                                             |
| SR app excluded         | Visit `standard-reader.app` article                    | No overlay                                          |
| Context menu            | Right-click link to indexed article → Save             | Bookmark created (or login → retry)                 |
| Toolbar badge           | Switch tabs between article and other sites            | Dot on indexed tabs only                            |
| Bluesky embed save      | Post with a standard.site article embed on bsky.app    | Native Save button in embed footer                  |
| Bluesky embed off       | Disable in options                                     | Buttons removed                                     |
| Options sync            | Toggle settings → restart browser                      | Settings persist (`storage.sync`)                   |
| Dev API                 | API origin blank or `http://127.0.0.1:3000` in options | Extension hits local app                            |
