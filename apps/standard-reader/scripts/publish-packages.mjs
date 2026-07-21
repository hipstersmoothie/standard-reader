// Publish the public @standard-reader/* packages under packages/ to npm with an
// INDEPENDENT versioning scheme: each package carries its own version in its
// package.json and advances on its own cadence. This script never bumps
// versions in lockstep — it publishes only the packages whose current version
// is not yet on the registry. So the release flow is:
//
//   1. Bump the version of whichever package(s) you changed, independently, e.g.
//        pnpm --filter @standard-reader/renderer-react exec npm version minor --no-git-tag-version
//      (or just edit the "version" field). Commit that on a normal PR.
//   2. Run this script. It builds every package, then publishes each one whose
//      version isn't already on npm, and tags each release `name@version`.
//
// pnpm publish rewrites `workspace:*` deps to the concrete published version, so
// the renderers pin the exact @standard-reader/renderer-core they were built
// against. Packages with no internal deps (renderer-core, lexicons) are
// published first so dependents always resolve.
//
// Usage:
//   node scripts/publish-packages.mjs [options] [package...]
//
//   package...        Limit to specific packages (name or dir basename). Default: all.
//   --dry-run         Build + resolve the plan and run `pnpm publish --dry-run`;
//                     no registry writes, no git tags, no push.
//   --otp=CODE        One-time password for npm 2FA, passed through to publish.
//   --tag=NAME        npm dist-tag to publish under (default: latest).
//   --no-build        Skip the pre-publish build (assume dist/ is already fresh).
//   --no-tag          Publish but don't create/push git tags.
//   --yes, -y         Skip the confirmation prompt.
//
// Auth: `npm login` locally, or set NPM_TOKEN (with an .npmrc that reads it) in CI.

import { execFileSync } from "node:child_process"
import { readFileSync, readdirSync } from "node:fs"
import { createInterface } from "node:readline/promises"
import { fileURLToPath } from "node:url"
import { dirname, join, resolve } from "node:path"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const PACKAGES_DIR = join(ROOT, "packages")
const SCOPE_PREFIX = "@standard-reader/"

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
}

function die(msg) {
  console.error(c.red(`\n✖ ${msg}\n`))
  process.exit(1)
}

// Run a command, inheriting stdio so build/publish output streams live.
function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: "inherit", cwd: ROOT, ...opts })
}

// Run a command and capture trimmed stdout; returns "" on non-zero exit.
function capture(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], ...opts }).trim()
  } catch {
    return ""
  }
}

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2)
const flags = {
  dryRun: argv.includes("--dry-run"),
  noBuild: argv.includes("--no-build"),
  noTag: argv.includes("--no-tag"),
  yes: argv.includes("--yes") || argv.includes("-y"),
  otp: (argv.find((a) => a.startsWith("--otp=")) || "").slice("--otp=".length),
  tag: (argv.find((a) => a.startsWith("--tag=")) || "--tag=latest").slice("--tag=".length),
}
const requested = argv.filter((a) => !a.startsWith("-"))

// ---------------------------------------------------------------------------
// Discover packages
// ---------------------------------------------------------------------------

function loadPackages() {
  const out = []
  for (const entry of readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = join(PACKAGES_DIR, entry.name)
    const pkgPath = join(dir, "package.json")
    let pkg
    try {
      pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
    } catch {
      continue
    }
    if (pkg.private) continue // never try to publish a private package
    if (!pkg.name || !pkg.version) continue
    const internalDeps = Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies }).filter((d) =>
      d.startsWith(SCOPE_PREFIX),
    )
    out.push({ name: pkg.name, version: pkg.version, dir: entry.name, internalDeps })
  }
  // Topological-ish order: packages with no internal @standard-reader deps first
  // (renderer-core, lexicons), then everything that depends on them.
  return out.sort((a, b) => a.internalDeps.length - b.internalDeps.length || a.name.localeCompare(b.name))
}

let packages = loadPackages()

if (requested.length > 0) {
  const match = (p) => requested.includes(p.name) || requested.includes(p.dir)
  const unknown = requested.filter((r) => !packages.some((p) => p.name === r || p.dir === r))
  if (unknown.length) die(`Unknown package(s): ${unknown.join(", ")}\nKnown: ${packages.map((p) => p.name).join(", ")}`)
  packages = packages.filter(match)
}

// ---------------------------------------------------------------------------
// Resolve which packages actually need publishing (version not yet on npm)
// ---------------------------------------------------------------------------

function publishedVersions(name) {
  const json = capture("npm", ["view", name, "versions", "--json"])
  if (!json) return [] // 404 / never published
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return []
  }
}

console.log(c.bold("\nResolving publish plan (independent per-package versions)…\n"))

const plan = []
for (const p of packages) {
  const existing = publishedVersions(p.name)
  const already = existing.includes(p.version)
  plan.push({ ...p, already })
  const status = already
    ? c.dim(`skip — ${p.version} already on npm`)
    : c.green(`publish ${p.version}`) + (existing.length ? c.dim(` (latest on npm: ${existing.at(-1)})`) : c.dim(" (new package)"))
  console.log(`  ${c.cyan(p.name.padEnd(34))} ${status}`)
}

const toPublish = plan.filter((p) => !p.already)

if (toPublish.length === 0) {
  console.log(c.yellow("\nNothing to publish — every selected package's version is already on npm.\n"))
  console.log(c.dim("Bump a package's version first, e.g.:"))
  console.log(c.dim("  pnpm --filter @standard-reader/renderer-core exec npm version patch --no-git-tag-version\n"))
  process.exit(0)
}

console.log(c.bold(`\n${toPublish.length} package(s) to publish under dist-tag "${flags.tag}"${flags.dryRun ? c.yellow("  [DRY RUN]") : ""}\n`))

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------

if (!flags.dryRun) {
  const whoami = capture("npm", ["whoami"])
  if (!whoami && !process.env.NPM_TOKEN) {
    die("Not authenticated with npm. Run `npm login`, or set NPM_TOKEN in the environment (CI).")
  }
  if (whoami) console.log(c.dim(`npm user: ${whoami}`))

  const dirty = capture("git", ["status", "--porcelain"])
  if (dirty) {
    console.log(c.yellow("⚠ Working tree is dirty. Publishing packages built from uncommitted changes:"))
    console.log(c.dim(dirty.split("\n").slice(0, 10).map((l) => "  " + l).join("\n")))
  }
}

// ---------------------------------------------------------------------------
// Confirm
// ---------------------------------------------------------------------------

if (!flags.yes && !flags.dryRun) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(c.bold(`\nPublish ${toPublish.length} package(s) to npm? [y/N] `))
  rl.close()
  if (!/^y(es)?$/i.test(answer.trim())) die("Aborted.")
}

// ---------------------------------------------------------------------------
// Build (topological — pnpm -r respects workspace dep order)
// ---------------------------------------------------------------------------

if (!flags.noBuild) {
  console.log(c.bold("\n▸ Building packages…\n"))
  run("pnpm", ["-r", "--filter", "./packages/**", "run", "build"])
}

// ---------------------------------------------------------------------------
// Publish (core/lexicons first — see sort above)
// ---------------------------------------------------------------------------

const publishArgs = (name) => {
  const args = ["--filter", name, "publish", "--access", "public", "--no-git-checks", "--tag", flags.tag]
  if (flags.otp) args.push("--otp", flags.otp)
  if (flags.dryRun) args.push("--dry-run")
  return args
}

const published = []
for (const p of toPublish) {
  console.log(c.bold(`\n▸ Publishing ${c.cyan(p.name)}@${p.version}…\n`))
  try {
    run("pnpm", publishArgs(p.name))
    published.push(p)
  } catch {
    die(`Publish failed for ${p.name}@${p.version}. Already-published packages this run: ${published.map((x) => x.name).join(", ") || "none"}`)
  }
}

// ---------------------------------------------------------------------------
// Git tags — one per package, `name@version` (npm/changesets convention)
// ---------------------------------------------------------------------------

if (flags.dryRun) {
  console.log(c.yellow(`\n[dry run] would tag: ${published.map((p) => `${p.name}@${p.version}`).join(", ")}\n`))
} else if (!flags.noTag) {
  console.log(c.bold("\n▸ Tagging releases…\n"))
  const tags = []
  for (const p of published) {
    const tag = `${p.name}@${p.version}`
    const exists = capture("git", ["tag", "--list", tag])
    if (exists) {
      console.log(c.dim(`  ${tag} already exists — skipping`))
      continue
    }
    run("git", ["tag", tag])
    tags.push(tag)
    console.log(c.green(`  tagged ${tag}`))
  }
  if (tags.length) {
    run("git", ["push", "origin", ...tags])
    console.log(c.green(`\n  pushed ${tags.length} tag(s)`))
  }
}

console.log(c.green(c.bold(`\n✔ Done. Published ${published.length} package(s):`)))
for (const p of published) console.log(`  ${p.name}@${p.version}`)
console.log()
