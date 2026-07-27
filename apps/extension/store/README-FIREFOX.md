# Firefox Add-ons (AMO) — listing copy

**First publish:** [`FIREFOX-INIT.md`](./FIREFOX-INIT.md)  
**Updates:** [`FIREFOX-DEPLOY.md`](./FIREFOX-DEPLOY.md)  
**Source build (reviewers):** [`FIREFOX-SOURCE.md`](./FIREFOX-SOURCE.md)

---

## Listing

**Name:** Standard Reader  
**Summary:** Save articles and follow publications on the standard.site network.  
**Category:** Feed & News / Productivity

### Short description (250 chars max on AMO)

Save articles, follow publications, and open the reader from any tab — with overlay chips on publication sites.

### Full description

Standard Reader is the browser companion for [standard.site](https://standard.site) — a reading network built on AT Protocol.

**Save from anywhere**

- Popup shows the current page when it matches an indexed article or publication
- Floating overlay chip on publication websites (Save / Open)
- Right-click context menu: Save to Standard Reader / Open in Standard Reader
- Toolbar badge when the active tab is a known article or publication

**Read and discuss**

- Open the article in Standard Reader from the popup
- Browse discussion, related reading, and cited-in links without leaving the popup
- Like articles and see engagement counts

**Bluesky**

- Save button on standard.site article embeds in the Bluesky app (uses Bluesky’s native button styling)

**Your existing account**

- Sign in once via the web app — the extension reuses your HttpOnly session cookie
- Pending saves complete automatically after login

**Privacy**

- API calls run only in the extension background worker
- Content scripts never access your session cookie directly
- See [standard-reader.app/privacy/extension](https://standard-reader.app/privacy/extension) for details

> **Note:** Read-aloud (on-device text-to-speech) is available in the Chrome extension only. Firefox has no offscreen document API, so the Listen control is hidden in this build.

## Permissions justification (AMO review)

Paste or adapt when reviewers ask about broad permissions:

| Permission / host               | Why                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| `tabs` / `activeTab`            | Resolve active tab URL; badge, popup, login tab cleanup                               |
| `contextMenus`                  | Save / Open from right-click                                                          |
| `cookies`                       | HttpOnly session on `standard-reader.app` (same login as web app)                     |
| `storage`                       | Overlay, Bluesky embed, and color-scheme toggles in `browser.storage.sync`            |
| `https://standard-reader.app/*` | Extension API + OAuth sign-in                                                         |
| `https://bsky.app/*`            | Bluesky embed save buttons                                                            |
| `<all_urls>`                    | Match page URLs to indexed articles; overlay + context menu on publication sites only |

**Remote code:** None. The packaged bundle is built with WXT + Vite; API responses are JSON only.

## Privacy

Policy text: [`privacy-policy.md`](./privacy-policy.md). Live at
**https://standard-reader.app/privacy/extension**.

## Store assets

Same icons as Chrome — see [`README.md`](./README.md#store-assets).

## Release (quick reference)

```bash
VITE_API_ORIGIN=https://standard-reader.app pnpm extension:zip:firefox
```

Upload `extension/.output/*-firefox.zip` to
[addons.mozilla.org developers](https://addons.mozilla.org/developers/).

Full process: [`FIREFOX-DEPLOY.md`](./FIREFOX-DEPLOY.md).

## Screenshots (capture manually in Firefox)

1. Popup on an indexed article page (signed in)
2. Page overlay chip on a publication site
3. Bluesky standard.site article embed with Save button
4. Options page (color scheme + overlay toggles)

Use the **prod** unpacked build from `extension/.output/firefox-mv2/`.
