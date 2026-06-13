# Release 0.2.0 — Chrome Web Store

Paste the **Release notes** block into the dashboard when uploading
`extension/.output/standard-reader-extension-0.2.0-chrome.zip`.

## Release notes (user-facing)

```text
Listen to articles from the extension popup with on-device text-to-speech. Playback continues after you close the popup, with a play icon in the toolbar while audio is active. Read-along highlighting on publication pages when available.
```

## Reviewer notes (optional, if asked)

- New `offscreen` permission (Chromium): hosts on-device Kokoro TTS so read-aloud survives popup close. No remote code; WASM bundled in the package.
- `/api/extension/narration` returns indexed article text (same as the web reader) when the user taps Listen. Live page text is used only when the index lacks a full body; that extraction stays on-device.
- Toolbar badge dot is hidden while read-aloud is active; the play icon indicates an active session instead.
- Fixes production builds hitting `127.0.0.1:3000` when `VITE_API_ORIGIN` was not set at build time (and ignores stale loopback values in extension storage).

## Pre-upload checklist

- [ ] `https://standard-reader.app/api/extension/narration` live on prod (deploy web app first if this release includes server changes)
- [ ] Privacy policy at `/privacy/extension` deployed with read-aloud section
- [ ] `VITE_API_ORIGIN=https://standard-reader.app pnpm extension:zip` succeeded
- [ ] QA cases 11–13 in DEPLOY.md passed on prod unpacked build
- [ ] Screenshot of popup with Listen / player updated (recommended)

## Upload

1. [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) → Standard Reader
2. **Package** → Upload `standard-reader-extension-0.2.0-chrome.zip`
3. **Store listing** — update short/full description if not already (see README.md)
4. **Privacy practices** — add `offscreen` justification from PRIVACY-PRACTICES.md
5. Paste release notes → **Submit for review**
