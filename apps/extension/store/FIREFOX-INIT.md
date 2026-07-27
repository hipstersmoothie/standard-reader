# Firefox Add-ons (AMO) — first publish runbook

One-time setup for listing Standard Reader on
[addons.mozilla.org](https://addons.mozilla.org). Updates use
[`FIREFOX-DEPLOY.md`](./FIREFOX-DEPLOY.md).

**Audience:** whoever owns the AMO developer account (not end users).

---

## Overview

```text
Backend live on prod
       ↓
Privacy policy URL public
       ↓
Prod Firefox build + QA + screenshots
       ↓
AMO developer account
       ↓
Upload XPI/zip + source archive → listing → submit review
       ↓
Listed on AMO (or respond to reviewer questions)
```

Firefox builds differ from Chrome: **Manifest V2**, **no read-aloud** (no
offscreen API), stable add-on ID `standard-reader@standard-reader.app`.

---

## Prerequisites

### 1. Production web app

Same API surface as Chrome — verify on `https://standard-reader.app` before any
store build:

| Requirement                                   | Verify                                     |
| --------------------------------------------- | ------------------------------------------ |
| App deployed at `https://standard-reader.app` | Open in browser                            |
| `/api/extension/session`                      | Signed-in session returns authenticated    |
| `/api/extension/resolve`                      | Known article URL resolves                 |
| `/api/extension/bookmark`                     | Save works when authenticated              |
| `/api/extension/follow`                       | Follow works when authenticated            |
| `/api/extension/recommend`                    | Like works when authenticated              |
| `/api/extension/discussion`                   | Discussion panel loads for indexed article |
| `/extension/connected`                        | OAuth redirect closes login tab            |
| OAuth `client_id` / redirect URIs             | Login from extension popup completes       |

### 2. Public privacy policy URL

**URL:** `https://standard-reader.app/privacy/extension`

Source: [`src/components/reader/extension-privacy-view.tsx`](../../src/components/reader/extension-privacy-view.tsx).  
Summary: [`privacy-policy.md`](./privacy-policy.md).

### 3. Repo access

```bash
pnpm install
```

Green CI (`pnpm extension:build`, extension lint/typecheck) is a good baseline.

### 4. Mozilla developer account

1. Go to [addons.mozilla.org](https://addons.mozilla.org).
2. **Register** or **Log in** with a Mozilla account (Firefox Account).
3. Open the [Developer Hub](https://addons.mozilla.org/developers/).
4. Accept the [Developer Agreement](https://addons.mozilla.org/en-US/developers/terms).

No registration fee (unlike Chrome’s $5).

---

## Production build

Store builds must **not** default to localhost.

```bash
# From repo root
VITE_API_ORIGIN=https://standard-reader.app pnpm extension:zip:firefox
```

(`extension:zip:firefox` runs `wxt build -b firefox` then
`scripts/zip-firefox.mjs`.)

Output:

```text
extension/.output/*-firefox.zip    ← upload to AMO
extension/.output/firefox-mv2/     ← unpacked dir for local QA
```

Sanity-check before upload:

```bash
unzip -p extension/.output/*-firefox.zip manifest.json | jq '.version, .permissions, .browser_specific_settings.gecko'
```

Confirm:

- `version` matches `extension/package.json`
- Production hosts include `https://standard-reader.app/*`
- `browser_specific_settings.gecko.id` is `standard-reader@standard-reader.app`
- `browser_specific_settings.gecko.data_collection_permissions` is set (required for new AMO submissions)
- No dev/staging loopback hosts (store builds use production hosts only — see
  [`manifest-hosts.ts`](../src/lib/manifest-hosts.ts))

---

## Pre-flight QA (Firefox)

Load the **production** build temporarily:

1. `pnpm extension:zip:firefox` (with prod `VITE_API_ORIGIN`)
2. Firefox → `about:debugging` → **This Firefox** → **Load Temporary Add-on…**
3. Select any file inside `extension/.output/firefox-mv2/` (e.g. `manifest.json`)
4. Run against **production** (`standard-reader.app`), not localhost

| #   | Case            | Steps                                   | Expected                                  |
| --- | --------------- | --------------------------------------- | ----------------------------------------- |
| 1   | Popup — article | Indexed article URL → extension icon    | Title, Save, Follow, View in Reader       |
| 2   | Sign-in flow    | Sign out → popup on article → Save      | Login tab → auto-close → save completes   |
| 3   | Overlay         | Publication article (not SR app)        | Bottom-right chip; dismiss until refresh  |
| 4   | Overlay off     | Options → disable overlay → revisit     | No chip                                   |
| 5   | SR app excluded | `standard-reader.app` article           | No overlay                                |
| 6   | Context menu    | Right-click indexed article link → Save | Bookmark (or login → retry)               |
| 7   | Toolbar badge   | Tabs: indexed article ↔ other site      | Dot on indexed tabs only                  |
| 8   | Bluesky embed   | bsky.app post with standard.site embed  | Save in embed footer                      |
| 9   | Bluesky off     | Options → disable embed save            | Buttons removed                           |
| 10  | Options persist | Toggle settings → restart browser       | Settings kept (`storage.sync`)            |
| 11  | View in Reader  | Popup → View in Reader                  | Opens article on standard-reader.app      |
| 12  | Discussion      | Popup → Discussion icon                 | Tabs load; linked articles open in reader |
| 13  | Like            | Popup → heart icon                      | Like toggles; count updates               |
| 14  | No Listen       | Popup on indexed article                | **No** Listen/headphones button (Firefox) |

Cases 11–13 match Chrome; case 14 confirms read-aloud is correctly absent.

---

## Screenshots

AMO needs **at least one** screenshot; plan for **four**. Capture in **Firefox**
with the prod temporary add-on.

| #   | Scene                    | How to capture                                       |
| --- | ------------------------ | ---------------------------------------------------- |
| 1   | Popup on indexed article | Article tab, signed in, extension popup open         |
| 2   | Page overlay             | Publication site article, chip visible bottom-right  |
| 3   | Bluesky embed            | bsky.app post with standard.site embed, Save visible |
| 4   | Options                  | Options page — color scheme + toggles visible        |

Tips: hide unrelated tabs; consistent light or dark mode; PNG is fine.

Icons: `extension/public/icons/icon-{16,32,48,128}.png` (already in manifest).

---

## Source code archive (required)

AMO requires source when the extension is built with bundlers/minifiers (WXT +
Vite). Prepare **before** first submission.

1. Follow [`FIREFOX-SOURCE.md`](./FIREFOX-SOURCE.md) — include that README in
   the archive root.
2. Tar or zip the monorepo slice reviewers need (see FIREFOX-SOURCE.md).
3. Exclude `node_modules/`, `.output/`, `.env`.
4. Test locally: rebuild from a clean checkout and diff against the uploaded
   `*-firefox.zip`.

Keep the source archive versioned with each release (tag or CI artifact).

---

## First-time AMO submission

1. [Developer Hub](https://addons.mozilla.org/developers/) → **Submit a New
   Add-on**.
2. Choose **On this site** (listed on AMO).
3. **Upload** `extension/.output/*-firefox.zip`.
4. Fix any **validation errors** before continuing (warnings are optional but
   worth addressing).
5. **Platform:** Firefox (desktop).
6. **Source code:** Yes — upload the source archive; point reviewers to
   `FIREFOX-SOURCE.md` in the upload notes.
7. **Listing** — fill from [`README-FIREFOX.md`](./README-FIREFOX.md):

   | Field       | Source                                  |
   | ----------- | --------------------------------------- |
   | Name        | Standard Reader                         |
   | Summary     | Save articles and follow publications…  |
   | Description | Full description (no read-aloud claims) |
   | Category    | Feed & News or Productivity             |
   | Language    | English                                 |

8. Upload screenshots and icons.
9. **Privacy policy URL:** `https://standard-reader.app/privacy/extension`
10. **Permissions / data use:** explain URL matching, session cookie on
    `standard-reader.app`, settings in `storage.sync` — see permission table in
    [`README-FIREFOX.md`](./README-FIREFOX.md).
11. **Submit version** for review.

---

## Review notes

Expect **a few business days**; `<all_urls>` often triggers manual review.

| Permission / host    | Why reviewers care  | Our justification (short)                                                             |
| -------------------- | ------------------- | ------------------------------------------------------------------------------------- |
| `<all_urls>`         | Runs on every site  | Match page URLs to indexed articles; overlay + context menu on publication sites only |
| `cookies`            | Cross-site identity | Read HttpOnly session on `standard-reader.app` only — same login as web app           |
| `tabs` / `activeTab` | Tab access          | Resolve active tab URL; open articles in Standard Reader                              |
| `contextMenus`       | Right-click hooks   | Save / Open on links and pages                                                        |
| `storage`            | Local data          | User toggles (overlay, Bluesky embed, theme)                                          |

If asked for a **video**, record ~30s: publication article → overlay save → popup
→ discussion → View in Reader.

**Read-aloud:** Not in the Firefox build. If reviewers see Kokoro/TTS references
in shared source, note that TTS runs only in the Chrome offscreen document.

**Data collection (manifest):** Firefox requires
`browser_specific_settings.gecko.data_collection_permissions` on new submissions.
This build declares `browsingActivity` (URLs for index matching),
`authenticationInfo` (session cookie), and `websiteActivity` (save/follow/like).
See [`wxt.config.ts`](../wxt.config.ts).

If **rejected**, read the email, fix code or listing, bump version, rebuild,
resubmit with a note explaining the fix.

---

## After approval

- Note the public AMO listing URL.
- Save the signed XPI AMO provides (useful for rollback reference).
- Future releases: [`FIREFOX-DEPLOY.md`](./FIREFOX-DEPLOY.md).

---

## First-publish checklist

```text
[ ] Web app prod deploy includes /api/extension/* and /extension/connected
[ ] Privacy policy URL live
[ ] Mozilla developer account + agreement accepted
[ ] VITE_API_ORIGIN=https://standard-reader.app for Firefox zip build
[ ] pnpm extension:zip:firefox succeeded
[ ] manifest.json version + permissions + gecko.id + data_collection_permissions spot-checked
[ ] Pre-flight QA table (14 cases) passed in Firefox on prod
[ ] Screenshots captured in Firefox
[ ] Source archive prepared with FIREFOX-SOURCE.md; rebuild diff clean
[ ] Listing filled from README-FIREFOX.md
[ ] Zip + source uploaded; submitted for review
```

---

## Related docs

- [`FIREFOX-DEPLOY.md`](./FIREFOX-DEPLOY.md) — updates after first publish
- [`README-FIREFOX.md`](./README-FIREFOX.md) — listing copy
- [`FIREFOX-SOURCE.md`](./FIREFOX-SOURCE.md) — reviewer build instructions
- [`DEPLOY.md`](./DEPLOY.md) — Chrome Web Store runbook
- [`../README.md`](../README.md) — extension dev setup
