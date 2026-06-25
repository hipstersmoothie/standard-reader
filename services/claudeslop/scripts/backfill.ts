/**
 * One-off backfill: score the most recent `site.standard.document` posts and
 * label the AI-ish ones, instead of waiting for them to flow by on Jetstream.
 *
 *   pnpm backfill            # last 100 (default)
 *   BACKFILL_LIMIT=50 pnpm backfill
 *
 * Stays decoupled like the live path: it lists recent documents from a public
 * AppView (`app.standard-reader.getLatestFeed`) and reads each document's text
 * straight from its author's PDS (`com.atproto.repo.getRecord`) — no shared DB.
 */

import { config } from "../src/config.ts";
import {
  getScanState,
  insertLabel,
  openDb,
  setScanState,
} from "../src/db.ts";
import { score } from "../src/detector.ts";
import { loadKeypair, signLabel } from "../src/sign.ts";

const APPVIEW = (
  process.env.APPVIEW_URL ?? "https://standard-reader.app"
).replace(/\/$/, "");
const LIMIT = Number(process.env.BACKFILL_LIMIT ?? 100);

interface FeedItem {
  uri: string;
  did: string;
  title?: string;
  description?: string;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** The N most recent indexed documents (uri + did), paged from the AppView. */
async function recentDocuments(n: number): Promise<Array<FeedItem>> {
  const out: Array<FeedItem> = [];
  let cursor: string | undefined;
  while (out.length < n) {
    const url = new URL(`${APPVIEW}/xrpc/app.standard-reader.getLatestFeed`);
    url.searchParams.set("filter", "all");
    url.searchParams.set("limit", "50");
    if (cursor) url.searchParams.set("cursor", cursor);
    const page = await getJson<{ cursor?: string; items?: Array<FeedItem> }>(
      url.toString(),
    );
    const items = page?.items ?? [];
    if (items.length === 0) break;
    for (const it of items) {
      out.push(it);
      if (out.length >= n) break;
    }
    cursor = page?.cursor;
    if (!cursor) break;
  }
  return out;
}

const pdsCache = new Map<string, string | null>();

/** Resolve a DID's PDS service endpoint (did:plc + did:web). */
async function resolvePds(did: string): Promise<string | null> {
  if (pdsCache.has(did)) return pdsCache.get(did)!;
  let docUrl: string | null = null;
  if (did.startsWith("did:plc:")) docUrl = `https://plc.directory/${did}`;
  else if (did.startsWith("did:web:")) {
    const host = decodeURIComponent(did.slice("did:web:".length).split(":")[0]);
    docUrl = `https://${host}/.well-known/did.json`;
  }
  let endpoint: string | null = null;
  if (docUrl) {
    const doc = await getJson<{
      service?: Array<{ id?: string; type?: string; serviceEndpoint?: string }>;
    }>(docUrl);
    endpoint =
      doc?.service?.find(
        (s) =>
          s.type === "AtprotoPersonalDataServer" || s.id === "#atproto_pds",
      )?.serviceEndpoint?.replace(/\/$/, "") ?? null;
  }
  pdsCache.set(did, endpoint);
  return endpoint;
}

/** Fetch a document record's text (title + body) and CID from the author's PDS. */
async function documentText(
  uri: string,
  did: string,
): Promise<{ text: string; cid?: string } | null> {
  const rkey = uri.split("/").pop();
  if (!rkey) return null;
  const pds = await resolvePds(did);
  if (!pds) return null;
  const url = new URL(`${pds}/xrpc/com.atproto.repo.getRecord`);
  url.searchParams.set("repo", did);
  url.searchParams.set("collection", config.documentCollection);
  url.searchParams.set("rkey", rkey);
  const res = await getJson<{
    cid?: string;
    value?: { title?: string; textContent?: string; description?: string };
  }>(url.toString());
  if (!res?.value) return null;
  const v = res.value;
  const body = [v.title, v.textContent ?? v.description]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .join("\n\n");
  return { text: body, cid: res.cid };
}

async function main(): Promise<void> {
  if (!config.signingKeyHex) {
    throw new Error("LABELER_SIGNING_KEY is required (run `pnpm gen-key`).");
  }
  const db = openDb(config.sqlitePath);
  const keypair = await loadKeypair(config.signingKeyHex);

  console.log(`[backfill] listing ${LIMIT} recent documents from ${APPVIEW}…`);
  const docs = await recentDocuments(LIMIT);
  console.log(`[backfill] got ${docs.length}; scoring…`);

  const scored: Array<{ uri: string; score: number; klass: string }> = [];
  let labeled = 0;

  for (const doc of docs) {
    const fetched = await documentText(doc.uri, doc.did);
    if (!fetched) continue;
    const result = score(fetched.text);
    scored.push({ uri: doc.uri, score: result.score, klass: result.classification });

    const desired = result.score >= config.aiThreshold;
    const prev = getScanState(db, doc.uri);
    const wasLabeled = prev?.labeled ?? false;
    if (desired && !wasLabeled) {
      const signed = await signLabel(keypair, {
        ver: 1,
        src: config.labelerDid,
        uri: doc.uri,
        cid: fetched.cid,
        val: config.labelValue,
        cts: new Date().toISOString(),
      });
      insertLabel(db, signed);
      labeled++;
    }
    setScanState(db, doc.uri, {
      version: config.detectorVersion,
      labeled: desired,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  console.log(`\n[backfill] top scores (threshold ${config.aiThreshold}):`);
  for (const s of scored.slice(0, 15)) {
    console.log(`  ${s.score.toFixed(2)}  ${s.klass.padEnd(11)}  ${s.uri}`);
  }
  console.log(
    `\n[backfill] done: scored ${scored.length}, labeled ${labeled} as "${config.labelValue}".`,
  );
}

main().catch((err) => {
  console.error("[backfill] fatal", err);
  process.exit(1);
});
