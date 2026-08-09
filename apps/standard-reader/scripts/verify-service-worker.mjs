/**
 * Post-build repair + check for the emitted service worker.
 *
 * ## The bug this exists for
 *
 * `/sw.js` was served truncated and unparseable in production for months. The
 * browser's only symptom is `SyntaxError: Unexpected end of script` at
 * registration, so the service worker silently never registered: offline
 * support and the update prompt were dead, and web push was simply the first
 * feature to notice.
 *
 * The file on disk is fine. **Nitro serves it truncated**, because it bakes a
 * static-asset manifest into `.output/server/index.mjs` at build time:
 *
 *     "/sw.js": { "size": 1774, "etag": "\"6ee-…\"", "path": "../public/sw.js" }
 *
 * while the finished worker is 2351 bytes. `vite-plugin-pwa`'s hooks run once
 * per build pass — three times for client + SSR + Nitro, emitting `0 entries`,
 * `0 entries`, then the real `8 entries` — and Nitro snapshots the directory
 * partway through that sequence. It then reads the *current* file at request
 * time but caps the response at the *recorded* size, so clients get a prefix cut
 * mid-token. That is why the truncation is deterministic, why `content-length`
 * and the etag agree with it, and why a build-time check of the file alone
 * passes while the served bytes are garbage.
 *
 * ## What this does
 *
 * Rewrites any manifest entry whose recorded size disagrees with the file on
 * disk, then asserts the worker is actually usable. Etags are opaque cache
 * validators, so a recomputed one need not match Nitro's own scheme — it only
 * has to change with the content, which this does.
 *
 * Runs from `pnpm build`, so a deploy fails loudly rather than shipping a worker
 * that cannot register.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const publicDir = path.join(appDir, ".output/public");
const serverEntry = path.join(appDir, ".output/server/index.mjs");
const swPath = path.join(publicDir, "sw.js");

function fail(message) {
  console.error(`\n[verify-sw] ${message}\n`);
  // A plain exit, not a throw: this is a build gate, and a stack trace pointing
  // into this script would bury the message that actually explains the failure.
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(1);
}

/** Nitro's shape: `"<size-in-hex>-<hash>"`, quoted. */
function etagFor(buffer) {
  const hash = createHash("sha1")
    .update(buffer)
    .digest("base64")
    .replaceAll("=", "");
  return `"${buffer.length.toString(16)}-${hash}"`;
}

// ── 1. Re-sync the baked manifest with what is actually on disk ──────────────
let repaired = 0;
if (existsSync(serverEntry)) {
  let bundle = readFileSync(serverEntry, "utf8");

  // Entries look like:
  //   "/sw.js": {\n "type": …,\n "etag": "…",\n "mtime": …,\n "size": 1774,\n "path": "../public/sw.js"\n }
  const entry =
    /"(\/[^"]+)":\s*\{\s*"type":\s*"[^"]*",\s*"etag":\s*"((?:[^"\\]|\\.)*)",\s*"mtime":\s*"[^"]*",\s*"size":\s*(\d+),\s*"path":\s*"([^"]+)"\s*\}/g;

  bundle = bundle.replaceAll(entry, (match, url, _etag, size, relPath) => {
    const filePath = path.resolve(path.dirname(serverEntry), relPath);
    if (!existsSync(filePath)) return match;

    const actual = statSync(filePath).size;
    if (actual === Number(size)) return match;

    const fresh = etagFor(readFileSync(filePath));
    repaired += 1;
    console.log(
      `[verify-sw] repaired ${url}: recorded ${size} bytes, actually ${actual} — Nitro would have served a truncated body`,
    );
    return match
      .replace(`"size": ${size}`, `"size": ${actual}`)
      .replace(
        /"etag":\s*"(?:[^"\\]|\\.)*"/,
        `"etag": ${JSON.stringify(fresh)}`,
      );
  });

  if (repaired > 0) writeFileSync(serverEntry, bundle);
}

// ── 2. The worker itself has to be usable ───────────────────────────────────
if (!existsSync(swPath)) {
  fail(
    `no service worker at ${path.relative(appDir, swPath)} — the PWA plugin did not emit one`,
  );
}

const bytes = readFileSync(swPath);
// Byte length, not string length: the worker contains multi-byte characters, so
// `source.length` disagrees with what the server records and serves.
const byteLength = bytes.length;
const source = bytes.toString("utf8");

try {
  new vm.Script(source, { filename: swPath });
} catch (error) {
  fail(
    `service worker is not valid JavaScript (${error.message}).\n` +
      `  ${byteLength} bytes, ends with: ${JSON.stringify(source.slice(-60))}\n` +
      `  The browser rejects this with "SyntaxError: Unexpected end of script",\n` +
      `  registration fails, and the app silently loses offline support, the\n` +
      `  update prompt, and web push.`,
  );
}

// Some build passes emit a structurally valid worker with nothing in it;
// shipping one of those is a quieter way to lose the offline fallback.
const manifest = source.match(/precacheAndRoute\(\[(.*?)\]/s);
const entries = manifest
  ? [...manifest[1].matchAll(/url:\s*"([^"]+)"/g)].map((m) => m[1])
  : [];

if (entries.length === 0) {
  fail(
    "service worker precaches nothing — a zero-entry build pass overwrote the real one",
  );
}
if (!entries.includes("offline.html")) {
  fail(
    `service worker does not precache offline.html (has: ${entries.join(", ")}) — the offline fallback would 404`,
  );
}

// ── 3. And the server must be prepared to serve all of it ───────────────────
if (existsSync(serverEntry)) {
  const bundle = readFileSync(serverEntry, "utf8");
  const recorded = bundle.match(/"\/sw\.js":\s*\{[^}]*"size":\s*(\d+)/);
  if (recorded && Number(recorded[1]) !== byteLength) {
    fail(
      `Nitro would serve ${recorded[1]} of ${byteLength} bytes of sw.js — the manifest repair did not take`,
    );
  }
}

console.log(
  `[verify-sw] ok — ${byteLength} bytes, precaches ${entries.length}: ${entries.join(", ")}${
    repaired > 0
      ? ` (repaired ${repaired} stale manifest entr${repaired === 1 ? "y" : "ies"})`
      : ""
  }`,
);
