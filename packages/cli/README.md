# @standard-reader/cli

Convert the document records in your AT Protocol repo between the Leaflet,
Offprint, pckt and Markpub content formats — and see what each conversion costs
before anything is written.

```bash
npx @standard-reader/cli formats          # what survives which conversion
npx @standard-reader/cli login            # sign in through your browser
npx @standard-reader/cli list --to pckt   # what's in your repo, and what it'd cost
npx @standard-reader/cli convert --to pckt
```

## What it does

Your `site.standard.document` records live in your repo, and their bodies are in
whichever format the tool that wrote them uses. This moves them to a different
one: it reads each record, converts the content, and writes it back with
`putRecord` — the record's title, path, tags and everything else untouched.

The formats do not describe the same set of things, so some conversions lose
something. That is what most of this CLI is about.

## Signing in

```bash
standard-reader login          # opens your browser
standard-reader whoami
standard-reader logout         # revokes the token, then forgets it
```

`login` runs the AT Protocol OAuth flow: it opens your browser, you authorize
on **your own server**, and the redirect comes back to a loopback listener that
exists only for those few seconds. Your password never reaches this process.

The token it stores is scoped to exactly what the tool does:

```
atproto repo?collection=site.standard.document&action=update
```

It cannot post, follow, delete, upload, or read your email — the consent screen
will say so. Revoke it any time with `logout`, or from your account settings,
without disturbing any other tool.

The session lives in `$XDG_CONFIG_HOME/standard-reader/credentials.json`
(`~/.config/...` by default), written `0600`. Sign-ins are per-account; with
more than one, pick with `--did`.

> Because a CLI cannot keep a secret, this registers as a _public_ client, and
> those get a shorter refresh window than a web app — expect to run `login`
> again every couple of weeks.

**Reading needs no credentials at all.** `list` and `convert --dry-run` touch
only public endpoints, so they run against any published blog — including
someone else's — with nothing configured:

```bash
standard-reader list --to pckt --repo someone.bsky.social
standard-reader convert --to markpub --dry-run --repo someone.bsky.social --out ./preview
```

`--repo` takes a handle or a DID and resolves it the usual way: the domain's
own `/.well-known/atproto-did` first, then a public resolver, then the DID
document for the PDS endpoint.

### App passwords

Still supported, for CI and scripts, and they take precedence when passed
explicitly:

```bash
export STANDARD_READER_IDENTIFIER=you.bsky.social
export STANDARD_READER_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
export STANDARD_READER_PDS_URL=https://bsky.social   # optional
```

or pass `--identifier`, `--password`, `--pds`. Prefer `login` when a human is
present: an app password grants full account access, and this tool needs one
collection.

## Commands

### `formats`

Prints the capability matrix — every block type against every target — with no
sign-in required. `--json` gives the full notes, including what each degraded
conversion falls back to.

### `list [--to <format>]`

Every document in the repo with its current format. With `--to`, each one also
reports whether it converts cleanly, how much would change, and how much would
be dropped. Nothing is written.

### `convert --to <format>`

The real thing. For each document:

1. read the record (resolving a body parked in a blob, which large Leaflet, pckt
   and Markpub documents use);
2. convert it in memory and work out what the conversion costs;
3. show that, and — if anything would be lost — ask;
4. save the original to a backup directory;
5. `putRecord` the new content.

```
Ghosts in the Machine  3lc4vv2xk7s2n
  pub.leaflet.content → pckt, 24 blocks
  dropped  table ×2 (blocks 11, 17)
           Leaflet has no table block, and its text blocks cannot hold a grid.
  changed  math (block 5)
           pckt has no math block.
           → a code block holding the LaTeX source
  2 blocks will be lost if you convert this record.
  Convert it? [y/N/d/a/s/q]
```

`d` prints the full issue list, `a` and `s` answer for everything remaining, `q`
stops the run. Pressing enter skips the record — the answer that changes
nothing.

## Options

| Flag                 | Meaning                                                        |
| -------------------- | -------------------------------------------------------------- |
| `-t, --to <format>`  | `leaflet`, `offprint`, `pckt` or `markpub` (required)          |
| `-f, --from <fmt>`   | Only convert documents currently in this format                |
| `--rkey <rkey>`      | Only this record; repeatable                                   |
| `--limit <n>`        | Stop after n documents                                         |
| `-n, --dry-run`      | Convert and report, write nothing                              |
| `--out <dir>`        | Also write each converted payload to disk                      |
| `-y, --yes`          | Don't prompt: convert what is safe, skip what loses content    |
| `--force`            | Convert everything, including records that lose content        |
| `--strict`           | Stop for any change at all, not just for dropped blocks        |
| `--backup-dir <dir>` | Where originals go (default `./standard-reader-backup-<time>`) |
| `--no-backup`        | Don't save originals                                           |
| `--json`             | Machine-readable report on stdout                              |
| `--repo <hnd\|did>`  | Read this repo instead of your own; no sign-in needed          |
| `--did <did>`        | Use this saved account when several are signed in              |

Exit code is `1` when any write failed, `2` on a usage error, `0` otherwise.

## What it will not do to your repo

- **A record whose conversion drops content is not written** unless you say so —
  per record at the prompt, or `--force` for all of them. Without a terminal to
  ask in (a pipe, CI, `--json`), those records are skipped rather than guessed
  at.
- **Originals are saved before any overwrite**, one JSON file per record, with
  the record's CID.
- **Every write is pinned with `swapRecord`** to the CID it was converted from.
  A record edited somewhere else between the read and the write fails loudly
  instead of being overwritten with a conversion of stale content.
- **Documents already in the target format are left alone**, not rewritten.
- **Images are not re-uploaded.** Converted records point at the same blobs.

A good sequence for a repo you care about:

```bash
standard-reader list --to markpub                       # survey
standard-reader convert --to markpub --dry-run --out ./preview   # inspect
standard-reader convert --to markpub --rkey 3lc4vv2xk7s2n        # one record
standard-reader convert --to markpub                             # the rest
```

## Programmatic use

```ts
import { runCli } from "@standard-reader/cli";

process.exitCode = await runCli(["convert", "--to", "pckt", "--dry-run"]);
```

The conversion itself is [`@standard-reader/converter`][converter] and has no
AT Protocol dependencies — reach for that directly if you are not converting a
repo.

[converter]: ../converter
