# Chrome Web Store — Privacy practices tab

Copy/paste text for the **Privacy practices** tab on the item edit page.
Privacy policy URL: **https://standard-reader.app/privacy/extension**

Account setup (not paste fields — do these in the dashboard):

1. **Settings → Contact email** — enter the publisher support address.
2. **Settings → Verify email** — complete the verification link Google sends.
3. **Privacy practices → Data usage certification** — check the box certifying
   compliance with the [Developer Program Policies](https://developer.chrome.com/docs/webstore/program-policies/)
   once the fields below are filled accurately.

---

## Single purpose description

Standard Reader is a browser companion for the Standard Reader web app
(standard-reader.app) and the standard.site reading network. Its sole purpose
is to help signed-in users save articles, follow publications, and open the
reader from pages they visit — including a popup, page overlay, context menu,
and Bluesky embed save buttons on supported sites.

---

## Permission justifications

Paste each block into the matching field on the Privacy practices tab.

### activeTab

When you click the extension icon or use a context-menu action, we read the
active tab’s URL (and optional discovery metadata from the page) to determine
whether the page matches an indexed standard.site article or publication, then
show save/follow/open actions. We do not access tab content beyond the URL and
discovery hints needed for matching.

### tabs

We query tab URLs to update the toolbar badge when you switch tabs, resolve
the current page for the popup, open Standard Reader after save/follow actions,
and close the OAuth login tab after sign-in. Tab access is limited to these
user-initiated reading and account flows.

### contextMenus

Right-click menu items let you save a link or the current page to Standard
Reader, or open a matched article in the reader, without opening the popup first.
The menu only appears for actions relevant to Standard Reader.

### cookies

After you sign in on standard-reader.app, the extension reads your existing
HttpOnly session cookie on that domain so API requests are authenticated with
the same account as the website. We do not use cookies for tracking; there is
no separate extension login.

### storage

User preferences (page overlay on/off, Bluesky embed save button on/off) are
stored locally in chrome.storage.sync so settings persist across browser
sessions. No account credentials are stored in extension storage.

### Host permission use

**standard-reader.app** — Extension API calls (resolve, save, follow, session)
and OAuth sign-in flow.

**bsky.app** — Inject save buttons on standard.site article embeds inside the
Bluesky web app when that feature is enabled in options.

**&lt;all_urls&gt;** — Content scripts run on pages you visit to (1) show an
optional save/open overlay on publication websites, (2) read page URLs and
lightweight discovery hints for index matching, and (3) support context-menu
actions on links. Only URLs and hints are sent to our server; page text is not
uploaded. The overlay is disabled on standard-reader.app itself and can be
turned off in extension options.

### Remote code use

The extension does not load or execute remote code. All JavaScript, HTML, and
CSS are bundled in the published package (Manifest V3). Network requests to
standard-reader.app return JSON API data only; no scripts are downloaded or
evaluated at runtime.

---

## Data use (questionnaire guidance)

When the dashboard asks what data you collect, align with
[`privacy-policy.md`](./privacy-policy.md):

| Data                                             | Collected?  | Notes                                                                                              |
| ------------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------- |
| **Website content / URLs**                       | Yes         | Page and link URLs sent to `/api/extension/*` for index matching only                              |
| **Authentication info**                          | Yes         | Session cookie on standard-reader.app (existing web login)                                         |
| **User activity**                                | Yes         | Save/follow actions you explicitly trigger (written to your AT Protocol repo)                      |
| **Personally identifiable information**          | Via account | Same account as the web app when signed in                                                         |
| **Health / financial / personal communications** | No          |                                                                                                    |
| **Location**                                     | No          |                                                                                                    |
| **Web history browsing**                         | No          | URLs are processed for matching on demand; we do not build a browsing history log in the extension |

**Purpose:** App functionality (save, follow, open reader).

**Shared with third parties:** No sale or sharing of extension data for advertising.

**Encryption in transit:** Yes (HTTPS to standard-reader.app).

---

## Store listing assets (reminder)

| Asset              | File / spec                                          |
| ------------------ | ---------------------------------------------------- |
| Icon 128×128       | `extension/public/icons/icon-128.png`                |
| Screenshots        | 1280×800 or 640×400 — see [`README.md`](./README.md) |
| Privacy policy URL | https://standard-reader.app/privacy/extension        |

Regenerate icons: `node scripts/generate-social-icon.mjs`
