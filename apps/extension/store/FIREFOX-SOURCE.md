# AMO source build — reviewer README

Include this file at the root of the source archive you upload to AMO alongside
the extension zip. See [Firefox source code submission](https://extensionworkshop.com/documentation/publish/source-code-submission/).

---

## What to submit

Upload a **tarball or zip of the monorepo** (or at minimum everything needed to
rebuild the Firefox package):

- `pnpm-lock.yaml` (required — reviewers must get identical dependencies)
- `package.json` (repo root)
- `extension/` (extension package + WXT config)
- `src/design-system/` and any other `src/` paths imported by the extension via `#/*`

Do **not** include `node_modules/`, `extension/.output/`, or `.env` files with
secrets.

## Environment

- **OS:** macOS or Linux (reviewers default to Ubuntu 24.04 if unspecified)
- **Node:** >= 22.6 (see repo root `package.json#engines`)
- **Package manager:** pnpm 10.26.0 (`corepack enable` then use the version in
  `package.json#packageManager`)

## Build commands (must match uploaded XPI byte-for-byte)

From the **monorepo root**:

```bash
corepack enable
pnpm install --frozen-lockfile
VITE_API_ORIGIN=https://standard-reader.app pnpm extension:zip:firefox
```

Expected output:

```text
extension/.output/standard-reader-extension-<version>-firefox.zip
extension/.output/firefox-mv2/          ← unpacked dir; diff against zip contents
```

## Verify the build

```bash
unzip -p extension/.output/*-firefox.zip manifest.json | jq '.version, .permissions'
```

Confirm:

- `version` matches `extension/package.json`
- `permissions` includes `https://standard-reader.app/*` and `<all_urls>`
- `browser_specific_settings.gecko.id` is `standard-reader@standard-reader.app`
- `browser_specific_settings.gecko.data_collection_permissions.required` is present (AMO blocks new submissions without it)
- No `offscreen` permission (Firefox build — read-aloud is Chrome-only)

Compare the zip to the uploaded add-on:

```bash
cd extension/.output/firefox-mv2
zip -r /tmp/rebuilt.zip .
diff <(unzip -l ../standard-reader-extension-*-firefox.zip | sort) \
     <(unzip -l /tmp/rebuilt.zip | sort)
```

There should be no differences.

## Architecture notes

- **WXT** builds Firefox as **Manifest V2** → `.output/firefox-mv2/`
- **Chrome** is a separate target (MV3 + offscreen TTS) — not part of this
  Firefox submission
- Shared UI comes from `src/design-system/` (StyleX + react-aria); compiled by
  `@stylexjs/unplugin` in `extension/wxt.config.ts`
- Production API origin is injected at build time via `VITE_API_ORIGIN`

## Contact

Questions during review: publisher contact email on the AMO developer account.
