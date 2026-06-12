# Chrome Web Store — deploy runbook

Step-by-step guide for publishing and updating the Standard Reader extension.
Listing copy and permission justifications live in [`README.md`](./README.md);
privacy policy text in [`privacy-policy.md`](./privacy-policy.md).

**Audience:** whoever owns the Chrome Web Store developer account and release
process (not end users).

---

## Overview

```text
Backend live on prod
       ↓
Privacy policy URL public
       ↓
Prod build (VITE_API_ORIGIN) + QA + screenshots
       ↓
Upload zip → fill dashboard → submit review
       ↓
Publish (or respond to reviewer questions)
```

First publish is mostly one-time setup (developer account, listing, privacy
URL). Updates reuse the same dashboard entry — bump version, rebuild zip,
upload, submit.

---

## Prerequisites

### 1. Chrome Web Store developer account

1. Sign in at [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Pay the **one-time $5** registration fee (Google account required).
3. Note which Google account owns the listing — transfers are painful.

### 2. Production web app

The extension talks to the main app over HTTPS. Before any store build:

| Requirement | Verify |
| ----------- | ------ |
| App deployed at `https://standard-reader.app` | Open in browser |
| `/api/extension/session` | Signed-in session returns `{ authenticated: true }` |
| `/api/extension/resolve` | Known article URL resolves |
| `/api/extension/bookmark` | Save works when authenticated |
| `/api/extension/follow` | Follow works when authenticated |
| `/extension/connected` | OAuth redirect closes login tab |
| OAuth `client_id` / redirect URIs | Login from extension popup completes |

Quick smoke test with an **unpacked prod build** (see [Pre-flight QA](#pre-flight-qa))
before uploading to the store.

### 3. Public privacy policy URL

Chrome requires a **privacy policy URL** on the store listing. The extension
policy text is in [`privacy-policy.md`](./privacy-policy.md).

**Before first submit:** publish that content at a stable URL on the main site,
for example:

```text
https://standard-reader.app/privacy/extension
```

Use the same URL in the developer dashboard and in listing copy if you link
“Privacy” from the description.

### 4. Repo access

From the monorepo root:

```bash
pnpm install
```

CI already runs `pnpm extension:build` and extension typecheck/lint — green CI
is a good baseline before you cut a store zip.

---

## Version and release notes

1. Bump **`extension/package.json`** `"version"` (semver).
2. WXT embeds this in the packaged manifest; the store uses it to detect updates.
3. Draft **release notes** for the dashboard (what changed for users/reviewers).

For the **first** publish, `0.1.0` is fine. Every subsequent upload needs a
**higher** version than what is currently live.

---

## Production build

Store builds must **not** default to localhost. Set the API origin at build time.

### Option A — `extension/.env` (local release build)

```bash
# extension/.env  (gitignored — do not commit prod values)
VITE_API_ORIGIN=https://standard-reader.app
```

### Option B — inline env (CI or one-off)

```bash
VITE_API_ORIGIN=https://standard-reader.app pnpm extension:zip
```

### Build commands

From repo root:

```bash
pnpm extension:zip
```

Output:

```text
extension/.output/*-chrome.zip    ← upload this
extension/.output/chrome-mv3/     ← unpacked dir for local QA
```

Sanity-check the zip manifest before upload:

```bash
unzip -p extension/.output/*-chrome.zip manifest.json | jq '.version, .host_permissions'
```

Confirm:

- `version` matches `extension/package.json`
- Production hosts include `https://standard-reader.app/*`
- You understand any dev/staging hosts still present (see [Review notes](#review-notes))

---

## Pre-flight QA

Load the **production** build unpacked:

1. `pnpm extension:zip` (with prod `VITE_API_ORIGIN`)
2. Chrome → **Extensions** → **Load unpacked** → `extension/.output/chrome-mv3/`
3. Run the checklist below against **production** (`standard-reader.app`), not
   localhost.

| # | Case | Steps | Expected |
| - | ---- | ----- | -------- |
| 1 | Popup — article | Indexed article URL → extension icon | Title, Save, Follow, Open |
| 2 | Sign-in flow | Sign out → popup on article → Save | Login tab → auto-close → save completes |
| 3 | Overlay | Publication article (not SR app) | Bottom-right chip; dismiss until refresh |
| 4 | Overlay off | Options → disable overlay → revisit | No chip |
| 5 | SR app excluded | `standard-reader.app` article | No overlay |
| 6 | Context menu | Right-click indexed article link → Save | Bookmark (or login → retry) |
| 7 | Toolbar badge | Tabs: indexed article ↔ other site | Dot on indexed tabs only |
| 8 | Bluesky embed | bsky.app post with standard.site embed | Save in embed footer |
| 9 | Bluesky off | Options → disable embed save | Buttons removed |
| 10 | Options persist | Toggle settings → restart browser | Settings kept (`storage.sync`) |

Capture failures before upload — reviewers exercise the same flows.

---

## Screenshots

Chrome needs **at least one** screenshot; plan for **four** (1280×800 or
640×400). Capture from a clean profile with the **prod** unpacked build.

| # | Scene | How to capture |
| - | ----- | -------------- |
| 1 | Popup on indexed article | Article tab, signed in, extension popup open |
| 2 | Page overlay | Publication site article, chip visible bottom-right |
| 3 | Bluesky embed | bsky.app post with standard.site embed, Save visible |
| 4 | Options | Extension options page, both toggles visible |

Tips:

- Hide personal bookmarks / unrelated tabs.
- Use light or dark mode consistently across shots.
- PNG is fine; avoid blurry upscales.

Optional: **440×280** promotional tile (small banner in search).

Icons are already in the manifest (`icons/icon-{16,32,48,128}.png`).

---

## First-time dashboard setup

1. Open [Developer Dashboard](https://chrome.google.com/webstore/devconsole) →
   **New item**.
2. Upload `extension/.output/*-chrome.zip`.
3. Fill **Store listing** from [`README.md`](./README.md):

   | Field | Source |
   | ----- | ------ |
   | Name | Standard Reader |
   | Summary | Save articles and follow publications… |
   | Description | Full description section |
   | Category | News & Weather or Productivity |
   | Language | English |

4. Upload screenshots and icon assets.
5. **Privacy**:

   - Privacy policy URL → hosted extension policy URL
   - Data use: page URLs sent to your server for index matching; session
     cookie on `standard-reader.app` for auth; settings in `chrome.storage.sync`
   - No separate extension analytics pipeline (see policy)

6. **Privacy practices** questionnaire — align answers with
   [`privacy-policy.md`](./privacy-policy.md).

7. **Permissions** — paste justifications from [`README.md`](./README.md)
   (Permissions justification section). Be specific; `<all_urls>` and `cookies`
   trigger manual review.

8. **Distribution**:

   - Visibility: Public (or Unlisted for a soft launch)
   - Regions: as needed
   - Mature content: No (unless that changes)

9. **Submit for review**.

---

## Review notes

Expect **1–3 business days**; broad permissions can take longer.

| Permission | Why reviewers care | Our justification (short) |
| ---------- | ------------------ | ------------------------- |
| `<all_urls>` | Runs on every site | Match page URLs to indexed articles; overlay + context menu on publication sites only |
| `cookies` | Cross-site identity | Read HttpOnly session on `standard-reader.app` only — same login as web app |
| `tabs` / `activeTab` | Tab access | Resolve active tab URL; open articles in Standard Reader |
| `contextMenus` | Right-click hooks | Save / Open on links and pages |
| `storage` | Local data | User toggles (overlay, Bluesky embed) |

If Google asks for a **video**, record ~30s: visit publication article → overlay
→ save → popup on article → Bluesky embed save.

**Dev hosts in manifest:** production zips may still list
`127.0.0.1`, `staging.standard-reader.app`, etc. Reviewers may ask why. Answer:
internal staging and local development; production users hit
`standard-reader.app`. Optionally strip dev hosts from prod builds before
upload to reduce friction.

If **rejected**, read the email carefully, fix code or listing copy, bump
version, rebuild zip, resubmit with a note explaining the fix.

---

## Publishing updates

1. Merge and deploy web app if API behavior changed.
2. Bump `extension/package.json` version.
3. `VITE_API_ORIGIN=https://standard-reader.app pnpm extension:zip`
4. Re-run [Pre-flight QA](#pre-flight-qa) on changed behavior.
5. Dashboard → your item → **Package** → upload new zip.
6. Add release notes → **Submit for review**.

Existing users get updates via Chrome’s extension update channel after approval
(no action required from them).

---

## Rollback and incidents

| Situation | Action |
| --------- | ------ |
| Bad build live | Upload previous zip with a **new higher** version, or disable new installs in dashboard while fixing |
| API outage | Extension degrades (resolve/save fail); fix server first — no store resubmit needed |
| Auth broken | Check OAuth redirects and cookie domain on `standard-reader.app` |
| Review stuck | Dashboard → item → check **Status** and registered developer email |

Keep the last known-good `*-chrome.zip` artifact (tagged release or CI artifact)
for quick rollback uploads.

---

## Checklist (copy before each release)

```text
[ ] Web app prod deploy includes /api/extension/* and /extension/connected
[ ] Privacy policy URL live and linked in dashboard
[ ] extension/package.json version bumped
[ ] VITE_API_ORIGIN=https://standard-reader.app for zip build
[ ] pnpm extension:zip succeeded
[ ] manifest.json version + host_permissions spot-checked
[ ] Pre-flight QA table (10 cases) passed on prod
[ ] Screenshots updated if UI changed
[ ] Release notes written
[ ] Zip uploaded; listing + privacy + permissions current
[ ] Submitted for review
```

---

## Related docs

- [`README.md`](./README.md) — listing copy, permission blurbs
- [`privacy-policy.md`](./privacy-policy.md) — policy text to host
- [`../README.md`](../README.md) — extension dev setup, architecture
- [`../../TODO.md`](../../TODO.md) — roadmap item for first publish
