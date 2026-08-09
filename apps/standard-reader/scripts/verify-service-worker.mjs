/**
 * Post-build check that the emitted service worker is actually usable.
 *
 * This exists because a truncated `sw.js` shipped to production undetected. The
 * served file was a strict prefix of a valid build, cut off mid-token:
 *
 *     production  1745 bytes, ends `…ugin({statuses:[0,200]})]}),"G`
 *     preview     1774 bytes, ends `…maxEntries:300,maxAgeSeconds:2`
 *     good build  2351 bytes, ends `…{statuses:[0,200]})]}),"GET")});`
 *
 * The browser's only symptom was `SyntaxError: Unexpected end of script` at
 * registration — which nothing surfaced, so the service worker silently never
 * registered at all. Offline support and the update prompt had been dead for as
 * long as it had been broken, and push was simply the first feature to notice.
 *
 * Two tools write `.output/public`: `vite-plugin-pwa` (via its `outDir`) and
 * Nitro, which owns that directory as its static root. The PWA plugin's hooks
 * additionally run once per build pass — three times for a
 * client + SSR + Nitro build — so `sw.js` is written repeatedly while another
 * tool is assembling the same directory. That is the shape of a partial write.
 *
 * Rather than guess at the exact interleaving, this fails the build loudly if
 * the artifact isn't valid. A broken deploy is worth catching here; it is not
 * worth discovering months later from a push timeout on someone's phone.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const swPath = path.join(appDir, ".output/public/sw.js");

function fail(message) {
  console.error(`\n[verify-sw] ${message}\n`);
  // A plain exit, not a throw: this is a build gate, and a stack trace pointing
  // into this script would bury the message that actually explains the failure.
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(1);
}

if (!existsSync(swPath)) {
  fail(
    `no service worker at ${path.relative(appDir, swPath)} — the PWA plugin did not emit one`,
  );
}

const source = readFileSync(swPath, "utf8");

// 1. It has to parse. A truncated file is the failure this exists to catch, and
//    it is invisible to any check that only looks at size or existence.
try {
  new vm.Script(source, { filename: swPath });
} catch (error) {
  fail(
    `service worker is not valid JavaScript (${error.message}).\n` +
      `  ${source.length} bytes, ends with: ${JSON.stringify(source.slice(-60))}\n` +
      `  This is the truncated-sw.js failure: the browser rejects it with\n` +
      `  "SyntaxError: Unexpected end of script", registration fails, and the\n` +
      `  app silently loses offline support, the update prompt, and web push.`,
  );
}

// 2. It has to carry a precache manifest. Some build passes emit a structurally
//    valid worker with zero entries; shipping one of those is a different, quieter
//    way to lose the offline fallback.
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

console.log(
  `[verify-sw] ok — ${source.length} bytes, precaches ${entries.length}: ${entries.join(", ")}`,
);
