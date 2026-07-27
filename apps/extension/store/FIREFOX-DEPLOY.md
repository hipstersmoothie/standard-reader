# Firefox Add-ons (AMO) — deploy runbook

Publishing **updates** to the Standard Reader Firefox extension on AMO.

**First publish?** Use [`FIREFOX-INIT.md`](./FIREFOX-INIT.md) instead.

Listing copy: [`README-FIREFOX.md`](./README-FIREFOX.md).  
Source build: [`FIREFOX-SOURCE.md`](./FIREFOX-SOURCE.md).

**Audience:** whoever owns the AMO developer account and release process.

---

## Overview

```text
Deploy web app (if API changed)
       ↓
Bump extension/package.json version
       ↓
Prod Firefox build + QA
       ↓
Upload new zip on existing AMO listing + source archive
       ↓
Release notes → submit review
       ↓
Firefox auto-updates users after approval
```

Upload updates on the **existing add-on page** — do not use “Submit a New
Add-on” or AMO will treat it as a duplicate.

---

## Prerequisites

Same production API checklist as Chrome — see [`FIREFOX-INIT.md`](./FIREFOX-INIT.md#1-production-web-app).

Deploy the web app **first** when the release depends on new server routes
(e.g. `/api/extension/discussion`).

Privacy policy must stay live at `https://standard-reader.app/privacy/extension`.

---

## Version and release notes

1. Bump **`extension/package.json`** `"version"` (semver).
2. WXT embeds this in the packaged manifest; AMO uses it to detect updates.
3. Draft **release notes** for the version (user-facing changelog).
4. Every upload needs a **higher** version than what is currently approved on AMO.

Optional: add `extension/store/RELEASE-<version>-FIREFOX.md` (mirror
`RELEASE-0.3.0.md` for Chrome) with paste-ready notes and a pre-upload
checklist.

---

## Production build

From repo root:

```bash
VITE_API_ORIGIN=https://standard-reader.app pnpm extension:zip:firefox
```

Output:

```text
extension/.output/standard-reader-extension-<version>-firefox.zip
extension/.output/firefox-mv2/
```

Verify manifest:

```bash
unzip -p extension/.output/*-firefox.zip manifest.json | jq '.version, .permissions, .browser_specific_settings.gecko'
```

---

## Pre-flight QA

Re-run the Firefox checklist from [`FIREFOX-INIT.md`](./FIREFOX-INIT.md#pre-flight-qa-firefox) on the **changed** behavior at minimum. For major releases, run all 14 cases.

Load temporary add-on: `about:debugging` → **Load Temporary Add-on…** →
`extension/.output/firefox-mv2/manifest.json`.

**Skip read-aloud cases** — not applicable on Firefox.

Update screenshots on AMO if popup/options UI changed materially.

---

## Source code archive

AMO requires a matching source archive **for every version** when you use a
bundler.

1. Update [`FIREFOX-SOURCE.md`](./FIREFOX-SOURCE.md) if build steps changed.
2. Create a fresh archive from the release tag/commit.
3. Rebuild locally and diff against the new `*-firefox.zip` (see FIREFOX-SOURCE.md).

---

## Upload update

1. [Developer Hub](https://addons.mozilla.org/developers/) → **My Add-ons** →
   **Standard Reader**.
2. **Manage Status & Versions** → **Upload a New Version**.
3. Upload `extension/.output/*-firefox.zip`.
4. Resolve validation **errors** (warnings optional).
5. Upload **source code** archive; reference `FIREFOX-SOURCE.md`.
6. Paste **release notes** for this version.
7. Update listing copy on AMO if features changed (keep read-aloud out of
   Firefox description).
8. **Submit version** for review.

Existing users receive updates through Firefox’s extension update channel after
approval.

---

## Review notes

Same permission justifications as first publish — see
[`FIREFOX-INIT.md` § Review notes](./FIREFOX-INIT.md#review-notes).

Call out in reviewer notes when a release:

- Adds new API routes (deploy web app first).
- Changes overlay or `<all_urls>` behavior.
- Touches auth / cookie handling.

**Chrome-only features:** Read-aloud and `offscreen` are not in the Firefox
package. Mention this if reviewers diff shared monorepo source.

---

## Rollback and incidents

| Situation      | Action                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------- |
| Bad build live | Upload previous zip with a **new higher** version, or disable version in AMO while fixing |
| API outage     | Extension degrades; fix server first — no AMO resubmit needed                             |
| Auth broken    | Check OAuth redirects and cookie domain on `standard-reader.app`                          |
| Review stuck   | AMO → add-on → **Review History**; check developer account email                          |

Keep the last known-good `*-firefox.zip` and matching source archive (tagged
release or CI artifact).

---

## Release checklist (copy before each deploy)

```text
[ ] Web app prod deploy includes any new /api/extension/* routes
[ ] Privacy policy URL live
[ ] extension/package.json version bumped (higher than AMO live version)
[ ] VITE_API_ORIGIN=https://standard-reader.app for Firefox zip build
[ ] pnpm extension:zip:firefox succeeded
[ ] manifest.json version + permissions + gecko.id + data_collection_permissions spot-checked
[ ] Pre-flight QA on changed behavior passed in Firefox on prod
[ ] Source archive rebuilt; diff against zip is clean
[ ] Screenshots / listing copy updated if UI changed
[ ] Release notes written
[ ] New zip + source uploaded on existing AMO listing
[ ] Submitted for review
```

---

## Related docs

- [`FIREFOX-INIT.md`](./FIREFOX-INIT.md) — first publish
- [`README-FIREFOX.md`](./README-FIREFOX.md) — listing copy
- [`FIREFOX-SOURCE.md`](./FIREFOX-SOURCE.md) — reviewer build instructions
- [`DEPLOY.md`](./DEPLOY.md) — Chrome Web Store updates
- [`RELEASE-0.3.0.md`](./RELEASE-0.3.0.md) — example Chrome release notes (adapt for Firefox)
