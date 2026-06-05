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
  (`chosenAddOns: []`). (`packageManager` was originally `npm`; switched to `pnpm`.)

> Note: the workspace was an essentially empty git repo (not a competing platform template), so
> nothing from the CLI output had to be dropped. Every generated integration, dependency, script,
> and config is represented in this repo.

## Stack & integrations

- **Framework:** TanStack Start + TanStack Router (file-based routing), React 19.
- **Build/toolchain (CLI default):** Vite 8, `@vitejs/plugin-react`, `@tanstack/router-plugin`.
- **Styling:** Tailwind CSS v4 via `@tailwindcss/vite`, plus `@tailwindcss/typography`. Theme
  tokens and a light/dark theme toggle ship in the starter.
- **Devtools:** `@tanstack/react-devtools` + `@tanstack/devtools-vite` (stripped from production
  builds automatically).
- **Icons:** `lucide-react` (used by the starter Header/Footer/ThemeToggle).
- **Testing:** Vitest + Testing Library + jsdom (no tests authored yet).
- **Lint/format:** oxlint (oxc) + oxfmt — see "Linting & formatting" below.
- **Agent tooling:** TanStack Intent skill mappings (see the block at the top of this file).

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

## Linting & formatting (oxc + oxfmt)

Linting uses [oxlint](https://oxc.rs) (pinned `oxlint@1.48.0`) and formatting uses
[oxfmt](https://oxc.rs). This setup mirrors the `~/Documents/at-store` project.

- `.oxlintrc.json` — root config: `extends` the shared base + overrides, turns the broad
  `correctness` category `off` (rules are opted into explicitly), declares `jsPlugins`, and sets
  the import-x TypeScript resolver. Ignore globs cover generated/build output
  (`routeTree.gen.ts`, `dist`, `.output`, `.tanstack`, etc.).
- `config/oxlint/rules-base.json` — framework-agnostic base: ESLint core correctness rules,
  `eslint-comments`, `import-x`, `unicorn`, and `perfectionist/sort-imports`.
- `config/oxlint/overrides.json` — type-aware `@typescript-eslint`, `jsx-a11y`, and React /
  react-hooks rules for `*.ts`/`*.tsx`, a Node env override for `*.mjs`/`*.cjs`, and a general
  `*.js`/`*.ts`/`*.tsx` block (import hygiene + `@stylistic/spaced-comment`).
  > Adapted from at-store: StyleX rules and at-store-specific file lists/lexicons were dropped
  > (this project uses Tailwind, not StyleX). The import-resolution allowlist targets this repo's
  > `#/` and `@/` aliases.
- `.oxfmtrc.json` — oxfmt config: 2-space indent, 80 col, semicolons, double quotes,
  trailing commas (`all`), `lf`. Ignores generated files and lockfiles.
- oxlint JS plugins in use (devDependencies): `@eslint-community/eslint-plugin-eslint-comments`,
  `eslint-plugin-perfectionist`, `@stylistic/eslint-plugin`.
- The starter source was brought to a clean state (`pnpm lint` → 0 errors, `pnpm format:check`
  passes): `window.*` member access was switched to `globalThis.*` in `ThemeToggle.tsx`
  (`prefer-global-this`), and imports were regrouped in `__root.tsx`.

## Project structure

```
src/
  router.tsx          # getRouter() factory + Register module augmentation
  routes/
    __root.tsx        # root document shell (HeadContent/Scripts, Header, Footer, devtools)
    index.tsx         # "/" home route
    about.tsx         # "/about" route
  components/         # Header, Footer, ThemeToggle
  styles.css          # Tailwind import + theme tokens + component styles
  routeTree.gen.ts    # GENERATED at dev/build time — do not edit (gitignored)
public/               # static assets (favicon, logos, manifest, robots.txt)
vite.config.ts        # devtools() -> tailwindcss() -> tanstackStart() -> viteReact()
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
- `vite.config.ts` plugin order matters: `devtools()` must be first; `tanstackStart()` precedes
  `viteReact()`.

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
