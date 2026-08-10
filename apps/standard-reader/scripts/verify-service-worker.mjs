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
 * ## And a second one, on iOS
 *
 * Once the worker could register, pushes were accepted by Apple and still never
 * appeared. Workbox emits `importScripts("/push-sw.js")` *inside* the AMD
 * factory, which runs in a `.then()` — after initial evaluation. The spec only
 * permits `importScripts()` during initial evaluation; Chrome tolerates the late
 * call, Safari does not. So on iOS no `push` listener ever registered, and every
 * notification was dropped on arrival with nothing anywhere reporting a failure.
 *
 * ## And a third: the worker's own dependency 404s
 *
 * Same snapshot, different casualty. `sw.js` opens with
 * `define(["./workbox-<hash>"])` and loads that chunk via `importScripts`, so
 * every route and the entire precache live behind it. The plugin's repeated
 * passes emit *differently hashed* chunks, and Nitro's snapshot recorded an
 * earlier pass's name — leaving the manifest with `/workbox-4cce69c4.js` while
 * the shipped `sw.js` asks for `/workbox-d95f8ea8.js`. Both files sit on disk;
 * only the stale one is served, and the other 404s.
 *
 * The failure is completely silent, and worse than the truncation: the worker
 * parses, registers, installs, activates, and reports itself healthy — its AMD
 * factory just never runs. No caches are created, no `fetch` handler is
 * installed, and `navigator.serviceWorker.controller` is set, so every
 * diagnostic short of "does it actually cache anything" says yes.
 *
 * ## What this does
 *
 * 1. Inlines `public/push-sw.js` into `sw.js` at top level, so the listeners
 *    register during initial evaluation, and strips the `importScripts` call.
 * 2. Rewrites any manifest entry whose recorded size disagrees with the file on
 *    disk — necessarily after (1), which changes that size. Etags are opaque
 *    cache validators, so a recomputed one need not match Nitro's own scheme; it
 *    only has to change with the content.
 * 3. Adds a manifest entry for the workbox chunk `sw.js` actually imports, when
 *    the snapshot missed it.
 * 4. Asserts the result is usable: parses, precaches the offline fallback,
 *    carries both the `push` and `notificationclick` listeners, and can reach
 *    its own runtime chunk.
 *
 * Runs from `pnpm build`, so a deploy fails loudly rather than shipping a worker
 * that cannot register — or one that registers and silently does nothing.
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

// ── 1. Inline the push listeners instead of importing them ──────────────────
//
// Workbox emits `importScripts("/push-sw.js")` *inside* the AMD factory, which
// runs in a `.then()` — after the worker's initial evaluation has finished. The
// spec only permits `importScripts()` during initial evaluation. Chrome
// tolerates the late call; **Safari does not**, so on iOS the push listeners
// were never registered.
//
// The symptom is maddening precisely because nothing looks broken: the worker
// installs and activates, the subscription is valid, Apple accepts the push and
// reports success — and the device shows nothing, because there is no `push`
// handler to show it.
//
// So the handlers are concatenated into `sw.js` here, at top level, where they
// register during initial evaluation. No second fetch, no timing dependency.
const pushSource = path.join(appDir, "public/push-sw.js");
let inlined = false;
if (existsSync(swPath) && existsSync(pushSource)) {
  const sw = readFileSync(swPath, "utf8");
  if (sw.includes('addEventListener("push"')) {
    inlined = true; // already inlined by an earlier run
  } else {
    const handlers = readFileSync(pushSource, "utf8");
    // Drop the now-redundant import; leaving it would refetch the same code and
    // reintroduce the late-`importScripts` throw on Safari.
    const withoutImport = sw.replaceAll(
      /importScripts\(\s*["']\/push-sw\.js["']\s*\)\s*[,;]?/g,
      "",
    );
    writeFileSync(swPath, `${withoutImport}\n${handlers}`);
    inlined = true;
    console.log(
      "[verify-sw] inlined push-sw.js into sw.js (importScripts runs too late for Safari)",
    );
  }
}

// ── 2. Re-sync the baked manifest with what is actually on disk ──────────────
// Must run after the inline above: appending changed the file's size, and Nitro
// serves exactly the number of bytes it recorded.
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

// ── 2b. Make sure the worker's runtime chunk is servable ────────────────────
// `sw.js` starts with `define(["./workbox-<hash>"])`; that chunk carries every
// strategy, route, and the precache itself. A manifest that names a *different*
// hash serves a 404 for it, and the worker becomes an inert no-op that still
// reports as activated. Add the entry rather than fail: the file is on disk and
// correct, only the snapshot is stale.
let addedChunk = null;
if (existsSync(swPath) && existsSync(serverEntry)) {
  const swSource = readFileSync(swPath, "utf8");
  const referenced = swSource.match(/define\(\[\s*"\.\/(workbox-[^"]+)"/);
  if (referenced) {
    const chunkFile = `${referenced[1]}.js`;
    const chunkUrl = `/${chunkFile}`;
    const chunkPath = path.join(publicDir, chunkFile);
    let bundle = readFileSync(serverEntry, "utf8");

    if (!existsSync(chunkPath)) {
      fail(
        `sw.js imports ${chunkUrl}, which the build never emitted — the worker would register and then do nothing`,
      );
    }

    if (!bundle.includes(`"${chunkUrl}"`)) {
      const buffer = readFileSync(chunkPath);
      const entry =
        `\t"${chunkUrl}": {\n` +
        `\t\t"type": "text/javascript; charset=utf-8",\n` +
        `\t\t"etag": ${JSON.stringify(etagFor(buffer))},\n` +
        `\t\t"mtime": ${JSON.stringify(statSync(chunkPath).mtime.toISOString())},\n` +
        `\t\t"size": ${buffer.length},\n` +
        `\t\t"path": "../public/${chunkFile}"\n` +
        `\t},\n`;
      // Anchor on `/sw.js`, which is always present in the same object.
      const anchor = bundle.indexOf('\t"/sw.js": {');
      if (anchor === -1) {
        fail(
          `cannot add a manifest entry for ${chunkUrl}: no "/sw.js" entry to anchor to`,
        );
      }
      bundle = bundle.slice(0, anchor) + entry + bundle.slice(anchor);
      writeFileSync(serverEntry, bundle);
      addedChunk = chunkUrl;
      console.log(
        `[verify-sw] added missing manifest entry for ${chunkUrl} — Nitro recorded a stale chunk hash and would have 404'd the worker's runtime`,
      );
    }
  }
}

// ── 3. The worker itself has to be usable ───────────────────────────────────
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
if (!inlined || !source.includes('addEventListener("push"')) {
  fail(
    "the service worker has no `push` listener — notifications would be accepted by the push service and then silently dropped on the device",
  );
}
if (!source.includes("notificationclick")) {
  fail(
    "the service worker has no `notificationclick` listener — tapping a notification would do nothing",
  );
}
if (/importScripts\(\s*["']\/push-sw\.js["']/.test(source)) {
  fail(
    "sw.js still calls importScripts('/push-sw.js') — Safari rejects that call after initial evaluation",
  );
}
if (!entries.includes("offline.html")) {
  fail(
    `service worker does not precache offline.html (has: ${entries.join(", ")}) — the offline fallback would 404`,
  );
}

// ── 4. And the server must be prepared to serve all of it ───────────────────
if (existsSync(serverEntry)) {
  const bundle = readFileSync(serverEntry, "utf8");
  const recorded = bundle.match(/"\/sw\.js":\s*\{[^}]*"size":\s*(\d+)/);
  if (recorded && Number(recorded[1]) !== byteLength) {
    fail(
      `Nitro would serve ${recorded[1]} of ${byteLength} bytes of sw.js — the manifest repair did not take`,
    );
  }

  // Every chunk the worker imports has to be reachable, at the right size. A
  // missing entry 404s and a stale size truncates; either way the AMD factory
  // never runs and the worker silently caches nothing.
  const referenced = source.match(/define\(\[\s*"\.\/(workbox-[^"]+)"/);
  if (referenced) {
    const chunkUrl = `/${referenced[1]}.js`;
    const chunkEntry = bundle.match(
      new RegExp(
        `"${chunkUrl.replaceAll(".", String.raw`\.`)}":\\s*\\{[^}]*"size":\\s*(\\d+)`,
      ),
    );
    if (!chunkEntry) {
      fail(
        `sw.js imports ${chunkUrl} but Nitro has no manifest entry for it — it would 404, and the worker would activate and then do nothing`,
      );
    }
    const chunkBytes = statSync(
      path.join(publicDir, `${referenced[1]}.js`),
    ).size;
    if (Number(chunkEntry[1]) !== chunkBytes) {
      fail(
        `Nitro would serve ${chunkEntry[1]} of ${chunkBytes} bytes of ${chunkUrl} — the worker's runtime would be truncated`,
      );
    }
  }
}

const repairs = [
  repaired > 0
    ? `repaired ${repaired} stale manifest entr${repaired === 1 ? "y" : "ies"}`
    : null,
  addedChunk ? `added ${addedChunk}` : null,
].filter(Boolean);

console.log(
  `[verify-sw] ok — ${byteLength} bytes, precaches ${entries.length}: ${entries.join(", ")}${
    repairs.length > 0 ? ` (${repairs.join("; ")})` : ""
  }`,
);
