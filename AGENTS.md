<!-- intent-skills:start -->

## Skill Loading

Before substantial work:

- Skill check: run `npx @tanstack/intent@latest list`, or use skills already listed in context.
- Skill guidance: if one local skill clearly matches the task, run `npx @tanstack/intent@latest load <package>#<skill>` and follow the returned `SKILL.md`.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

# Project Context

A blank [TanStack Start](https://tanstack.com/start) (React) application. No partner add-ons or
extra feature scaffolding were selected — this is the default blank React starter.

**Package manager: pnpm** (`pnpm@10.26.0`, pinned via `package.json#packageManager`). The project
was scaffolded with npm and later switched to pnpm: `package-lock.json` was removed and
`pnpm-lock.yaml` is the committed lockfile. Use `pnpm` for all installs/scripts.

## How this project was scaffolded

The project was created with the TanStack CLI, then the generated output was merged into this
repository (which already contained `.git`, `.cursor/`, and a generic `.gitignore`).

```bash
# 1. Scaffold (run in a scratch directory, then merged into this repo root)
npx @tanstack/cli@latest create my-tanstack-app --agent

# 2. TanStack Intent (run in this repo root, after merge + install)
npx @tanstack/intent@latest install   # wires skill-loading guidance into this AGENTS.md
npx @tanstack/intent@latest list      # lists installed, loadable skills

# 3. Switched the package manager from npm to pnpm
rm package-lock.json node_modules -rf
pnpm install                          # generates pnpm-lock.yaml
```

- CLI version resolved: `@tanstack/cli@0.69.0` (via `@latest`).
- Intent version resolved: `@tanstack/intent@0.0.41` (via `@latest`).
- Effective scaffold config (`.cta.json`): `framework: react`, `mode: file-router`,
  `typescript: true`, `tailwind: true`, `packageManager: pnpm`, `intent: true`, no add-ons
  (`chosenAddOns: []`). (`packageManager` was originally `npm`; switched to `pnpm`. `.cta.json`
  records `tailwind: true` as the original scaffold choice, but Tailwind has since been removed in
  favor of StyleX — see "Stack & integrations".)

> Note: the workspace was an essentially empty git repo (not a competing platform template), so
> nothing from the CLI output had to be dropped. Every generated integration, dependency, script,
> and config is represented in this repo.

## Stack & integrations

- **Framework:** TanStack Start + TanStack Router (file-based routing), React 19.
- **Build/toolchain (CLI default):** Vite 8, `@vitejs/plugin-react`, `@tanstack/router-plugin`.
- **Design system:** [hip-ui](https://hip-ui.tngl.io) — a copy-and-own, StyleX + react-aria
  component library vendored into `src/design-system/`. **Build UI from these components and
  tokens** (see "Design system" below).
- **Styling:** StyleX (`@stylexjs/stylex`) is the only styling layer, compiled by
  `@stylexjs/unplugin` in `vite.config.ts`. **Tailwind has been removed** (no `@tailwindcss/vite`,
  `tailwindcss`, or `@tailwindcss/typography`, and `styles.css` is now just a tiny reset). Build all
  UI from design-system components + StyleX tokens.
- **Devtools:** `@tanstack/react-devtools` + `@tanstack/devtools-vite` (stripped from production
  builds automatically).
- **Icons:** `lucide-react` (used by the starter Header/Footer/ThemeToggle).
- **Testing:** Vitest + Testing Library + jsdom (no tests authored yet).
- **Lint/format:** oxlint (oxc) + oxfmt — see "Linting & formatting" below.
- **Agent tooling:** TanStack Intent skill mappings (see the block at the top of this file).

## Design system (hip-ui) — use it for all UI

This project vendors the **hip-ui** design system into `src/design-system/` (a "copy-and-own"
StyleX + [react-aria-components](https://react-spectrum.adobe.com/react-aria/) library). When
building or changing UI, **use these components and tokens instead of hand-rolling markup, raw
HTML elements, or ad-hoc CSS / inline styles.**

### Rules

- **Prefer design-system components.** Import from `src/design-system/<component>` (aliases `#/` and
  `@/` both map to `./src`, e.g. `import { Button } from "#/design-system/button"`). Components are
  named exports built on react-aria, so they're accessible by default (use their props rather than
  re-implementing keyboard/ARIA behavior). Browse `src/design-system/*/index.tsx` for the catalog
  (Button, Card, Dialog, Flex, Grid, TextField, Select, Menu, Toast, etc.).
- **Use theme tokens, never hardcoded values.** Pull design tokens from the StyleX theme in
  `src/design-system/theme/` (re-exported from `src/design-system/theme/index.ts`): colors and
  `semantic-color`, `spacing` / `semantic-spacing` (`gap`), `radius`, `shadow`, `typography`,
  `animations` (`animationDuration`), and `media-queries`. Reference them in `stylex.create(...)`
  (e.g. `gap: gap["md"]`, `transitionDuration: animationDuration.fast`) instead of literal
  px/hex/duration values.
- **Style with StyleX**, following the existing component conventions (`stylex.create` +
  `stylex.props`, `"use client"` where needed). Avoid introducing new Tailwind/inline styling for
  design-system work.
- **Layout tips (from hip-ui):** prefer `Flex` for layout (use `Grid` only for true 2D layouts) and
  **always set a `gap`**; text uses `text-box-trim`, so bump the flex `gap` around text; use `Card`
  sparingly.

### Use the hip-ui MCP server before building UI

The repo configures the hip-ui MCP server in `.cursor/mcp.json` (`npx hip-ui mcp` → server
`hip-ui-docs`). **Consult it before adding or significantly changing UI** so you follow the current,
shipped component patterns rather than guessing:

1. **Load the resource `hip-ui://tips-and-tricks-for-llms`** ("tips & tricks for LLMs") first and
   keep it in context.
2. **`list-sections`** — discover the available docs (introduction, foundations, components,
   showcase, ai).
3. **`get-documentation`** — fetch full markdown for the component/section you're working with
   (accepts a title, docs slug, or `/docs` URL path; single or array).

If the MCP server isn't connected, the same docs are vendored at
`node_modules/hip-ui/dist/mcp/docs/` and component source lives in `src/design-system/`.

### StyleX build wiring

StyleX is compiled by `@stylexjs/unplugin/vite` (first plugin in `vite.config.ts`, mirroring
`~/Documents/at-store`). The plugin is configured with `treeshakeCompensation`, `dev` toggled by
`NODE_ENV`, the `#/*` + `@/*` aliases pointing at `./src/*`, and `lightningcssOptions.targets`
derived from `browserslist("baseline 2024")` (via `lightningcss` + `browserslist`). In dev,
`__root.tsx` imports `virtual:stylex:runtime` and links `/virtual:stylex.css` (typed via
`src/stylex-env.d.ts`); the production build emits a real CSS asset. The StyleX-aware lint rules are
wired up too (see "Linting & formatting"). `pnpm lint`, `pnpm format:check`, `pnpm typecheck`,
`pnpm build`, and `pnpm dev` all pass with the design system linted and in use.

## Scripts

- `pnpm install` — install dependencies.
- `pnpm dev` — Vite dev server on port 3000 (falls back to the next free port if taken).
- `pnpm build` — production build (client + SSR bundles into `dist/`).
- `pnpm preview` — preview the production build.
- `pnpm test` — run Vitest once.
- `pnpm typecheck` — `tsc --noEmit`.
- `pnpm lint` — run oxlint over the repo.
- `pnpm format` — format the repo with oxfmt (writes changes).
- `pnpm format:check` — verify formatting without writing (CI-friendly).
- `pnpm check` — format, then `oxlint . --fix` (one-shot local cleanup).
- `pnpm fix-stylex-keys` — autofix StyleX `sort-keys` / `valid-shorthands` across `src` via
  `eslint.stylex-autofix.mjs` (oxlint reports these but can't autofix them). May need to be run a
  couple of times to converge on large objects.

## Linting & formatting (oxc + oxfmt)

Linting uses [oxlint](https://oxc.rs) (pinned `oxlint@1.48.0`) and formatting uses
[oxfmt](https://oxc.rs). This setup mirrors the `~/Documents/at-store` project.

- `.oxlintrc.json` — root config: `extends` the shared base + overrides, turns the broad
  `correctness` category `off` (rules are opted into explicitly), declares `jsPlugins`, and sets
  the import-x TypeScript resolver. Ignore globs cover generated/build output
  (`routeTree.gen.ts`, `dist`, `.output`, `.tanstack`, etc.).
- `config/oxlint/rules-base.json` — framework-agnostic base: ESLint core correctness rules,
  `eslint-comments`, `import-x`, `unicorn`, and `perfectionist/sort-imports`.
- `config/oxlint/overrides.json` — type-aware `@typescript-eslint`, `jsx-a11y`, React /
  react-hooks, and **`@stylexjs/eslint-plugin`** rules for `*.ts`/`*.tsx`, a Node env override for
  `*.mjs`/`*.cjs`, and a general `*.js`/`*.ts`/`*.tsx` block (import hygiene +
  `@stylistic/spaced-comment`).
  > Adapted from at-store: at-store-specific file lists/lexicons were dropped and the
  > import-resolution allowlist targets this repo's `#/` and `@/` aliases.
- **StyleX-aware linting (mirrors at-store).** The `*.ts`/`*.tsx` override adds
  `"jsPlugins": ["@stylexjs/eslint-plugin"]` and enables `@stylexjs/valid-styles` (with
  `propLimits` forcing `transitionDuration`/`animationDuration` to the `animationDuration.*`
  tokens), `sort-keys`, `valid-shorthands`, `enforce-extension`, `no-unused`,
  `no-legacy-contextual-styles`, and `no-lookahead-selectors`. Per-file override blocks switch off
  `enforce-extension` for the `*.stylex.tsx` token files and `valid-styles` /
  `no-legacy-contextual-styles` for the design-system components that legitimately need raw values
  / contextual selectors (see the file list in `overrides.json`).
- `.oxfmtrc.json` — oxfmt config: 2-space indent, 80 col, semicolons, double quotes,
  trailing commas (`all`), `lf`. Ignores generated files and lockfiles.
- **The design system is linted and formatted** (no longer excluded). `pnpm lint` runs over the
  whole repo incl. `src/design-system/` (0 errors). Because it's copy-and-own, a few violations in
  the pristine hip-ui copy were fixed in place (e.g. `video/index.tsx`: `transitionDuration` now
  uses `animationDuration.default`, and `.filter()` callbacks are wrapped).
- oxlint JS plugins in use (devDependencies): `@eslint-community/eslint-plugin-eslint-comments`,
  `eslint-plugin-perfectionist`, `@stylistic/eslint-plugin`, `@stylexjs/eslint-plugin`. The
  StyleX key-sort autofix (`eslint.stylex-autofix.mjs`, run via `pnpm fix-stylex-keys`) also needs
  `eslint` + `@typescript-eslint/parser`.
- App source is clean (`pnpm lint` → 0 errors, `pnpm format:check` passes). Note the
  `unicorn/no-typeof-undefined` rule: use `globalThis.localStorage === undefined`, not
  `typeof ... === "undefined"`, and `charSet: "utf8"` (not `"utf-8"`) in route `head`.

## Project structure

```
src/
  router.tsx          # getRouter() factory + Register module augmentation
  routes/
    __root.tsx        # root shell: applies DS theme tokens to <body>, Header/Footer, devtools
    index.tsx         # "/" home route — DS placeholder (Page/Content/Flex/Button)
    about.tsx         # "/about" route — DS placeholder (Page/Content)
  components/         # app-specific components (Header, Footer, ThemeToggle) — StyleX, no Tailwind
  design-system/      # hip-ui (copy-and-own): components + StyleX theme tokens (theme/)
  styles.css          # minimal global reset only (no Tailwind)
  stylex-env.d.ts     # ambient types for the StyleX virtual modules
  routeTree.gen.ts    # GENERATED at dev/build time — do not edit (gitignored)
public/               # static assets (favicon, logos, manifest, robots.txt)
config/oxlint/        # shared oxlint rules-base.json + overrides.json (incl. StyleX rules)
vite.config.ts        # stylexPlugin() -> devtools() -> tanstackStart() -> viteReact()
eslint.stylex-autofix.mjs # ESLint flat config used only for `pnpm fix-stylex-keys`
tsconfig.json         # bundler resolution; "#/*" and "@/*" aliases -> ./src/*
```

## Environment variables

- No environment variables are required to run the blank starter.
- When you add config, follow TanStack Start's env model: only variables prefixed with `VITE_`
  are exposed to client code; everything else stays server-only. `.env` / `.env.*` are gitignored
  (`.env.example` is allowed). For details load
  `@tanstack/start-client-core#start-core/execution-model`.

## Deployment notes

- `pnpm build` emits a Node server bundle at `dist/server/server.js` plus client assets in
  `dist/client/`.
- TanStack Start supports Cloudflare Workers, Netlify, Vercel, Node/Docker, Bun, and Railway. The
  default toolchain produces a Node server output; choose/configure a target before deploying. Load
  `@tanstack/start-client-core#start-core/deployment` for target-specific guidance.

## Key architectural decisions

- Kept the CLI default toolchain (Vite) and the generated structure unchanged; switched the
  package manager from npm to pnpm (lockfile is `pnpm-lock.yaml`, pinned via `packageManager`).
- Merged the CLI output into the pre-existing repo rather than scaffolding into a subfolder; the
  TanStack-specific `.gitignore` entries were appended to the repo's existing generic `.gitignore`.
- `vite.config.ts` plugin order matters: `stylexPlugin()` runs first, then `devtools()`, and
  `tanstackStart()` precedes `viteReact()`.
- **Removed Tailwind** in favor of StyleX + the hip-ui design system: dropped the Tailwind deps and
  Vite plugin, reduced `styles.css` to a reset, wired `@stylexjs/unplugin`, and rebuilt
  `__root.tsx`, `Header`, `Footer`, `ThemeToggle`, and the route pages on design-system components.

## Known gotchas

- `src/routeTree.gen.ts` is auto-generated and gitignored; it is created on the first `dev`/`build`.
  Don't edit it or commit it. It is marked read-only in `.vscode/settings.json`.
- `dev` uses port 3000 but will hop to the next free port if it's occupied — check the startup log
  for the actual URL.
- Devtools code is automatically removed from production builds by `@tanstack/devtools-vite`.
- Path aliases `#/*` and `@/*` both map to `./src/*` (see `tsconfig.json` and `package.json#imports`).

## Next steps

- `pnpm dev` and start editing `src/routes/index.tsx`.
- Before architectural or library-specific changes, consult the TanStack Intent skills: run
  `npx @tanstack/intent@latest list` then `npx @tanstack/intent@latest load <package>#<skill>`.
- Add routes under `src/routes/`; add server logic with `createServerFn` / route `server` handlers.
- Author tests (Vitest) as features land; pick and configure a deployment target.
