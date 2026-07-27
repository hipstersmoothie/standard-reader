# Release 0.3.0 — Chrome Web Store

Paste the **Release notes** block into the dashboard when uploading
`extension/.output/standard-reader-extension-0.3.0-chrome.zip`.

## Release notes (user-facing)

```text
Open articles in Standard Reader from the popup, browse discussion and related reading, and like articles without leaving the page. Refreshed popup layout with a sticky listen player. Choose your read-aloud voice and light/dark theme in extension settings.
```

## Reviewer notes (optional, if asked)

- **View in Reader** opens the matched article (or publication) on standard-reader.app in a new tab via `openReader` in the background worker — same session cookie as the web app.
- **Discussion** panel calls `/api/extension/discussion` for comments, related reading, and cited-in links; user can open linked articles in the reader from there.
- **Like / recommend** uses existing `/api/extension/recommend` endpoint.
- **Listen voice** preference is stored in `chrome.storage.sync` (`readerVoice`); options page also adds light/dark color scheme.
- No new permissions beyond 0.2.0 (`offscreen` for on-device TTS unchanged).
- Deploy web app first so `/api/extension/discussion` is live on prod.

## Pre-upload checklist

- [ ] Web app prod deploy includes `/api/extension/discussion` (and existing `/api/extension/*` routes)
- [ ] Privacy policy at `/privacy/extension` deployed (no new permissions; discussion uses same API data model as web)
- [ ] `VITE_API_ORIGIN=https://standard-reader.app pnpm extension:zip` succeeded
- [ ] QA cases 11–16 in DEPLOY.md passed on prod unpacked build
- [ ] Screenshot of popup with Discussion / View in Reader updated (recommended)
- [ ] Options screenshot updated to show voice + color scheme (recommended)

## Upload

1. [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) → Standard Reader
2. **Package** → Upload `standard-reader-extension-0.3.0-chrome.zip`
3. **Store listing** — update short/full description if not already (see README.md)
4. **Privacy practices** — unchanged from 0.2.0 (see PRIVACY-PRACTICES.md)
5. Paste release notes → **Submit for review**
