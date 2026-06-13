# Standard Reader Extension — Chrome Web Store

**Deploy:** step-by-step runbook → [`DEPLOY.md`](./DEPLOY.md)  
**Privacy practices tab (paste-ready):** [`PRIVACY-PRACTICES.md`](./PRIVACY-PRACTICES.md)

---

## Listing

**Name:** Standard Reader  
**Summary:** Save articles and follow publications on the standard.site network.  
**Category:** News & Weather / Productivity

### Short description (132 chars max)

Save articles, follow publications, and listen to articles from any tab — with overlay chips on publication sites.

### Full description

Standard Reader is the browser companion for [standard.site](https://standard.site) — a reading network built on AT Protocol.

**Save from anywhere**

- Popup shows the current page when it matches an indexed article or publication
- Floating overlay chip on publication websites (Save / Open)
- Right-click context menu: Save to Standard Reader / Open in Standard Reader
- Toolbar badge when the active tab is a known article or publication (hidden while read-aloud is playing)

**Read aloud**

- Listen to indexed articles from the popup with on-device text-to-speech
- Playback continues after the popup closes; the toolbar icon switches to a play indicator
- Optional read-along highlighting on the article’s publication page

**Bluesky**

- Save button on standard.site article embeds in the Bluesky app (uses Bluesky’s native button styling)

**Your existing account**

- Sign in once via the web app — the extension reuses your HttpOnly session cookie
- Pending saves complete automatically after login

**Privacy**

- API calls run only in the extension background worker
- Content scripts never access your session cookie directly
- See [standard-reader.app/privacy/extension](https://standard-reader.app/privacy/extension) for details

## Permissions justification

Full paste-ready text for every Privacy practices field:
[`PRIVACY-PRACTICES.md`](./PRIVACY-PRACTICES.md)

Quick reference:

- **Single purpose** — Companion for standard-reader.app: save, follow, open reader
- **activeTab / tabs** — Resolve active tab URL; badge, popup, login tab cleanup
- **contextMenus** — Save / Open from right-click
- **cookies** — HttpOnly session on standard-reader.app (same login as web app)
- **storage** — Overlay and Bluesky embed toggles in chrome.storage.sync
- **Host permissions** — API + OAuth on standard-reader.app; embed UI on bsky.app; `<all_urls>` for overlay and URL matching on publication sites
- **Remote code** — None; MV3 bundle only; API returns JSON

## Privacy

Policy text: [`privacy-policy.md`](./privacy-policy.md). Live at
**https://standard-reader.app/privacy/extension** (see [`DEPLOY.md`](./DEPLOY.md)).

## Store assets

| Asset              | Path                                         |
| ------------------ | -------------------------------------------- |
| Icon 128×128       | `extension/public/icons/icon-128.png`        |
| Icons 16 / 32 / 48 | `extension/public/icons/icon-{16,32,48}.png` |

Regenerate all sizes from the Newsreader glyph:

```bash
node scripts/generate-social-icon.mjs
```

## Release (quick reference)

```bash
VITE_API_ORIGIN=https://standard-reader.app pnpm extension:zip
```

Upload `extension/.output/*-chrome.zip` to the
[Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole).

Full process: [`DEPLOY.md`](./DEPLOY.md).

## Screenshots (capture manually)

1. Popup on an indexed article page
2. Page overlay chip on a publication site
3. Bluesky standard.site article embed with Save button
4. Options page
