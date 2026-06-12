# Standard Reader Extension — Chrome Web Store

**Deploy:** step-by-step runbook → [`DEPLOY.md`](./DEPLOY.md)

---

## Listing

**Name:** Standard Reader  
**Summary:** Save articles and follow publications on the standard.site network.  
**Category:** News & Weather / Productivity

### Short description (132 chars max)

Save articles, follow publications, and open the reader from any tab — with overlay chips on publication sites.

### Full description

Standard Reader is the browser companion for [standard.site](https://standard.site) — a reading network built on AT Protocol.

**Save from anywhere**

- Popup shows the current page when it matches an indexed article or publication
- Floating overlay chip on publication websites (Save / Open)
- Right-click context menu: Save to Standard Reader / Open in Standard Reader
- Toolbar badge when the active tab is a known article or publication

**Bluesky**

- Save button on standard.site article embeds in the Bluesky app (uses Bluesky’s native button styling)

**Your existing account**

- Sign in once via the web app — the extension reuses your HttpOnly session cookie
- Pending saves complete automatically after login

**Privacy**

- API calls run only in the extension background worker
- Content scripts never access your session cookie directly
- See [privacy-policy.md](./privacy-policy.md) for details

## Permissions justification

Paste these into the Chrome Web Store dashboard (see [`DEPLOY.md`](./DEPLOY.md) for context):

- **`<all_urls>`** — Detect indexed standard.site articles on publication websites and offer save/read actions via the page overlay and context menu.
- **`cookies`** — Reuse your existing Standard Reader sign-in session (no separate extension login).
- **`tabs` / `activeTab`** — Resolve the current tab URL and open articles in Standard Reader.
- **`contextMenus`** — Save links and pages from the right-click menu.
- **`storage`** — Extension settings (overlay toggle, Bluesky embed save button).

## Privacy

Policy text: [`privacy-policy.md`](./privacy-policy.md). Host at a public URL on
`standard-reader.app` before first submit (see [`DEPLOY.md`](./DEPLOY.md)).

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
