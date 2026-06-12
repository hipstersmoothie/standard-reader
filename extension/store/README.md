# Standard Reader Extension — Chrome Web Store

## Listing

**Name:** Standard Reader  
**Summary:** Save articles and follow publications on the standard.site network.  
**Category:** News & Weather / Productivity

### Short description (132 chars max)

Save articles, follow publications, and open the reader from any tab — with overlay chips and Bluesky link badges.

### Full description

Standard Reader is the browser companion for [standard.site](https://standard.site) — a reading network built on AT Protocol.

**Save from anywhere**
- Popup shows the current page when it matches an indexed article or publication
- Floating overlay chip on publication websites (Save / Open)
- Right-click context menu: Save to Standard Reader / Open in Standard Reader
- Toolbar badge when the active tab is a known article or publication

**Bluesky integration**
- Inline save badges on `bsky.app` posts that link to Standard Reader articles

**Your existing account**
- Sign in once via the web app — the extension reuses your HttpOnly session cookie
- Pending saves complete automatically after login

**Privacy**
- API calls run only in the extension background worker
- Content scripts never access your session cookie directly
- See [privacy-policy.md](./privacy-policy.md) for details

## Permissions justification

- **`<all_urls>`** — Detect indexed standard.site articles on publication websites and offer save/read actions via the page overlay and context menu.
- **`cookies`** — Reuse your existing Standard Reader sign-in session (no separate extension login).
- **`tabs` / `activeTab`** — Resolve the current tab URL and open articles in Standard Reader.
- **`contextMenus`** — Save links and pages from the right-click menu.
- **`storage`** — Extension settings (overlay toggle, Bluesky badges).

## Privacy

See [privacy-policy.md](./privacy-policy.md).

## Release

```bash
pnpm extension:zip
```

Upload `.output/*-chrome.zip` from `extension/.output/` to the Chrome Web Store developer dashboard.

## Screenshots (capture manually)

1. Popup on an indexed article page
2. Page overlay chip on a publication site
3. Bluesky link badge on a post with an SR article link
4. Options page
