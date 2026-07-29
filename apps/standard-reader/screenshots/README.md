# Guide screenshots

Every picture in the [reader guide](../src/components/guide) is generated, not pasted. After
a UI change, refreshing all of them is one command.

```bash
pnpm dev            # in one terminal (or let Playwright start it)
pnpm guide:shots    # from the repo root, or `pnpm --filter standard-reader guide:shots`
```

Output lands in `public/guide/`, which the guide pages serve as `/guide/<id>.png`.

## How it works

| File                                                              | Role                                                                                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [`src/lib/guide/screenshots.ts`](../src/lib/guide/screenshots.ts) | The shot list — route, auth mode, viewport, light/dark, optional pre-capture clicks. **This is the file you edit.** |
| [`capture.spec.ts`](./capture.spec.ts)                            | One Playwright test per shot per scheme.                                                                            |
| [`lib/capture.ts`](./lib/capture.ts)                              | Navigates, waits for the page to settle, writes the PNG.                                                            |
| [`../screenshots.config.ts`](../screenshots.config.ts)            | Playwright config. Separate from the perf suite's, but shares its session bootstrap.                                |
| `GuideFigure`                                                     | Renders a shot by id, reading the same manifest for the image's intrinsic size.                                     |

Captures wait for the app shell's `<main>` to paint and every `aria-busy` flag inside it to
clear — the same ready signal the perf suite measures against — so a shot never catches a
skeleton. Fonts are awaited too, animations are disabled, and each context is pinned to the
scheme being captured.

## Adding a picture

1. Add an entry to `GUIDE_SHOTS`. Give it a stable `id`; that is the file name.
2. Reference it from a guide page:

   ```tsx
   <GuideFigure
     shot="discover"
     alt={t`Describe what the picture demonstrates, not that it is a screenshot.`}
     caption={<Trans>Optional line under the image.</Trans>}
   />
   ```

3. Run `pnpm guide:shots`.

`alt` is required, and `src/lib/guide/navigation.test.ts` fails the build if a page
references a shot that isn't declared. Until a shot has actually been captured,
`GuideFigure` renders its caption instead of a broken image — so declaring one ahead of the
capture run is safe.

## Environment

Guest screenshots need nothing. Signed-in screens (`auth: "signed-in"`) reuse the perf
suite's credentials and skip — rather than fail — when they are absent:

```bash
PERF_TEST_IDENTIFIER="your.handle.bsky.social"
PERF_TEST_APP_PASSWORD="xxxx-xxxx-xxxx-xxxx"   # or PERF_TEST_SESSION_TOKEN
```

A session row alone is **not** enough. The app only treats a request as signed in when it
can also restore an AT Proto client for that account, so the same app password has to be in
the **dev server's** `.env` as well — otherwise every auth-gated route bounces to `/login`.
The capture fails loudly in that case rather than saving a picture of the sign-in form.

Two more things that bite in sandboxes and CI images:

- **`GUIDE_SHOTS_CHROMIUM`** — path to an existing Chromium, for images that ship a pinned
  build not matching what `@playwright/test` wants to download.
- **`GUIDE_SHOTS_PROXY`** — cover images and avatars come from a remote CDN. Behind an
  egress proxy the browser must be pointed at it explicitly, or the pages paint (and pass)
  with broken-image icons everywhere. Verify one real screenshot by eye after a run in a new
  environment; a proxy that shell tools can use won't necessarily accept Chromium's
  `CONNECT`.

Shots whose path contains `{article}`, `{publication}` or `{tag}` resolve against the perf
fixtures (`PERF_TEST_ARTICLE_PATH` and friends; `pnpm perf:discover-fixtures` fills them in).
They are marked `optional`, so a missing fixture skips that shot instead of failing the run.

Point the run at a different server with `PERF_TEST_BASE_URL`.
