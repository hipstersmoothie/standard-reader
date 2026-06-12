# Standard Reader Extension — Privacy Policy

**Last updated:** June 11, 2026  
**Public URL:** `https://standard-reader.app/privacy/extension`

Canonical copy lives in [`src/components/reader/extension-privacy-view.tsx`](../../src/components/reader/extension-privacy-view.tsx).
Update that component first, then sync this file for the Chrome Web Store listing.

## Overview

The Standard Reader browser extension helps you save articles and follow publications on the [standard.site](https://standard.site) network. It connects to your Standard Reader account at [standard-reader.app](https://standard-reader.app). This policy covers the extension only; the [site privacy policy](https://standard-reader.app/privacy) describes data handling on the website.

## What the extension accesses

| Data | Purpose |
| ---- | ------- |
| **Page URLs** | Match pages against the Standard Reader index to offer save/follow/open actions (`/api/extension/*`). Page content is not uploaded. |
| **Session cookie** | Authenticate API requests using your existing Standard Reader sign-in (HttpOnly cookie on standard-reader.app). Content scripts do not read this cookie. |
| **Extension settings** | Stored locally in `chrome.storage.sync` (overlay toggle, Bluesky embed save button). |

## What the extension does not do

- We do not run a separate analytics pipeline in the extension
- We do not sell or share extension data with third parties
- We do not scrape or upload page text — only URLs needed for index matching and actions you choose

## How requests are handled

API calls to standard-reader.app run in the extension background worker, not in scripts injected into third-party pages.

## Account actions

Save and follow actions write AT Protocol records to **your** repository via the Standard Reader server, same as the web app.

## Your choices

Disable the overlay and Bluesky embed save button in extension options. Sign out on the web app to invalidate the session cookie. Uninstalling removes local extension settings.

## Contact

Questions: [About](https://standard-reader.app/about) · [Site privacy policy](https://standard-reader.app/privacy)
