/**
 * Live end-to-end verification of the `atproto-proxy` integration path — the
 * one the userinput.app interop report exercised
 * (https://userinput.app/d/did:plc:7qubw2z53qzfturlblaozz4a/3msqg3okp3kc7).
 *
 * Logs into the PERF_TEST account's real PDS with its app password and makes
 * the same calls an external developer would:
 *
 * 1. The published DID document must carry a bare-origin serviceEndpoint —
 *    a path suffix (`…/xrpc`) makes every PDS's undici dispatcher throw
 *    before sending a byte, surfacing as 502 UpstreamFailure.
 * 2. A query proxied through the PDS (`atproto-proxy` header) must succeed
 *    *and be authenticated* — an optionally-authenticated query answers 200 to
 *    an anonymous caller, so the check reads back a bookmark it just created.
 * 3. A write proxied through the PDS must fail with our explanatory error —
 *    never a 502 (unreachable) or bare 401 (reads as "bad token").
 * 4. A direct write with the account's own token must succeed (then clean up).
 *
 * Run after a deploy:
 *   pnpm --filter standard-reader exec tsx --env-file=.env scripts/verify-atproto-proxy.ts
 */

import process from "node:process";

const APPVIEW_BASE =
  process.env.VERIFY_APPVIEW_BASE ?? "https://standard-reader.app";
const DOC =
  "at://did:plc:f4os2wz5fjl56xpwcvtnqu7m/site.standard.document/3moetu3f65kc4";

interface DidDocument {
  id?: string;
  service?: Array<{ id?: string; serviceEndpoint?: string }>;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  return (await response.json()) as T;
}

async function main(): Promise<void> {
  const appviewHost = new URL(APPVIEW_BASE).hostname;
  const proxyTarget = `did:web:${appviewHost}#standard_reader_appview`;

  const identifier = process.env.PERF_TEST_IDENTIFIER;
  const password = process.env.PERF_TEST_APP_PASSWORD;
  if (!identifier || !password) {
    throw new Error("PERF_TEST_IDENTIFIER / PERF_TEST_APP_PASSWORD not set");
  }

  let failures = 0;
  const check = (label: string, ok: boolean, detail: string): void => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — ${detail}`}`);
    if (!ok) failures += 1;
  };

  // 1. DID document shape.
  const didDoc = await fetchJson<DidDocument>(
    `${APPVIEW_BASE}/.well-known/did.json`,
  );
  check(
    "did.json id uses dot-form host",
    didDoc.id === `did:web:${appviewHost}`,
    `id is ${didDoc.id}`,
  );
  const endpoint = didDoc.service?.find((s) =>
    s.id?.endsWith("standard_reader_appview"),
  )?.serviceEndpoint;
  check(
    "serviceEndpoint is a bare origin",
    !!endpoint && new URL(endpoint).pathname === "/",
    `serviceEndpoint is ${endpoint}`,
  );

  // 2. Log in on the test account's real PDS.
  const resolved = await fetchJson<{ did?: string }>(
    `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${identifier}`,
  );
  const plc = await fetchJson<DidDocument>(
    `https://plc.directory/${resolved.did}`,
  );
  const pds = plc.service?.find(
    (s) => s.id === "#atproto_pds",
  )?.serviceEndpoint;
  if (!pds) {
    throw new Error("Could not resolve the test account's PDS");
  }
  const session = await fetchJson<{ accessJwt?: string }>(
    `${pds}/xrpc/com.atproto.server.createSession`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    },
  );
  const accessJwt = session.accessJwt;
  if (!accessJwt) {
    throw new Error(`createSession failed on ${pds}`);
  }
  console.log(`Signed in; proxying via ${pds}`);

  const call = async (
    base: string,
    path: string,
    init: RequestInit & { proxy?: boolean } = {},
  ): Promise<{ status: number; body: string }> => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${accessJwt}`);
    if (init.proxy) headers.set("atproto-proxy", proxyTarget);
    const response = await fetch(`${base}/xrpc/${path}`, { ...init, headers });
    const body = await response.text();
    return { status: response.status, body };
  };

  // 3. Proxied query must work — and must actually *authenticate*.
  //
  // A 200 alone proves nothing here: `getBookmarkStatus` is an
  // optionally-authenticated query that answers `{"active":false}` to an
  // anonymous caller. When service-JWT verification was broken, every proxied
  // call silently degraded to anonymous and still returned 200 — which is
  // exactly what this script used to accept. So bookmark the document first
  // and require the proxied read to *see* it.
  const setup = await call(
    APPVIEW_BASE,
    "app.standard-reader.bookmarkDocument",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document: DOC }),
    },
  );
  if (setup.status !== 200) {
    throw new Error(`Could not seed the bookmark fixture: ${setup.status}`);
  }
  const proxiedRead = await call(
    pds,
    `app.standard-reader.getBookmarkStatus?document=${encodeURIComponent(DOC)}`,
    { proxy: true },
  );
  check(
    "getBookmarkStatus via atproto-proxy reads as the caller",
    proxiedRead.status === 200 &&
      (JSON.parse(proxiedRead.body) as { active?: boolean }).active === true,
    `got ${proxiedRead.status}: ${proxiedRead.body.slice(0, 200)} (\`active:false\` means the proxied caller was treated as anonymous)`,
  );

  // 4. Proxied write must fail with the explanatory error, not 502/bare 401.
  const proxiedWrite = await call(pds, "app.standard-reader.bookmarkDocument", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document: DOC }),
    proxy: true,
  });
  check(
    "bookmarkDocument via atproto-proxy explains itself (400, not 502)",
    proxiedWrite.status === 400 && proxiedWrite.body.includes("atproto-proxy"),
    `got ${proxiedWrite.status}: ${proxiedWrite.body.slice(0, 200)}`,
  );

  // 5. Direct write must still work (step 3 already seeded one), then clean up.
  const directWrite = await call(
    APPVIEW_BASE,
    "app.standard-reader.bookmarkDocument",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document: DOC }),
    },
  );
  check(
    "bookmarkDocument direct returns 200",
    directWrite.status === 200,
    `got ${directWrite.status}: ${directWrite.body.slice(0, 200)}`,
  );
  const cleanup = await call(
    APPVIEW_BASE,
    "app.standard-reader.unbookmarkDocument",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document: DOC }),
    },
  );
  check(
    "unbookmarkDocument cleanup returns 200",
    cleanup.status === 200,
    `got ${cleanup.status}`,
  );

  console.log(
    failures === 0 ? "\nAll checks passed." : `\n${failures} failed.`,
  );
  if (failures > 0) process.exitCode = 1;
}

await main();
