/**
 * Read labels for the reader UI from the read-model.
 *
 * Labels are mirrored into the `document_labels` table by a periodic sync (see
 * `sync.server.ts`) — the *only* time we contact a labeler. Every request path
 * (feeds, tag, article, labeler detail) reads labels from Postgres via SQL, so
 * a page load never makes a per-document label call. The HTTP helpers at the
 * bottom of this file exist solely for that sync.
 */

import { and, eq, inArray } from "drizzle-orm";
import { cache as reactCache } from "react";

import type { LabelPref, LabelVisibility } from "#/db/schema/labels";
import type {
  ArticleCardLabel,
  Db,
  Schema,
} from "#/integrations/tanstack-query/api-shapes";
import type { LabelableCard } from "#/lib/label-subjects";
import {
  attachLabelsFromMap,
  hiddenUrisFromLabels,
  isCardHidden,
  labelSubjects,
} from "#/lib/label-subjects";
import { assertSafeFetchUrl } from "#/server/security/ssrf-guard";

import { resolveLabelerEndpoint } from "./resolve.server.ts";
import { verifyLabels } from "./verify.server.ts";

// Re-exported so label call sites have one import site for the whole concern.
export type { LabelableCard };
export {
  attachLabelsFromMap,
  hiddenUrisFromLabels,
  isCardHidden,
  labelSubjects,
};

/**
 * A raw label as served by a labeler's `queryLabels` (sync path only).
 *
 * Carries the full signed shape, not just what the UI needs: the signature
 * covers every one of these fields, so they all have to survive the trip from
 * the labeler to `verifyLabel` intact.
 */
export interface DisplayLabel {
  /** Label schema version (`1`). Absent on labels predating the field. */
  ver?: number;
  src: string;
  uri: string;
  /** CID of the exact record version labeled, when the labeler pinned one. */
  cid?: string;
  val: string;
  neg?: boolean;
  cts?: string;
  /** Expiry; the label must not be applied after this instant. */
  exp?: string;
  /** Signature over the dag-cbor of this label sans `sig`. JSON uses `$bytes`. */
  sig?: Uint8Array | { $bytes?: string };
}

// ── DB reads (request paths) ────────────────────────────────────────────────

/** The labeler DIDs a reader is subscribed to (from the read-model mirror). */
export async function subscribedLabelerDids(
  db: Db,
  schema: Schema,
  callerDid: string,
): Promise<Array<string>> {
  const rows = await db
    .selectDistinct({ labelerDid: schema.labelerSubscriptions.labelerDid })
    .from(schema.labelerSubscriptions)
    .where(
      and(
        eq(schema.labelerSubscriptions.subscriberDid, callerDid),
        eq(schema.labelerSubscriptions.deleted, false),
      ),
    );
  return rows.map((r) => r.labelerDid);
}

/**
 * The caller's subscribed labeler DIDs plus a `${labelerDid} ${val}` →
 * visibility map of their saved per-label prefs. One query feeds both.
 *
 * Memoized per request ({@link reactCache}): a single feed load reads labels
 * for several URI sets (hide-filter + attach for the critical rows, then the
 * trending rail), and each read would otherwise re-query the reader's labeler
 * subscriptions. `db`/`schema` are stable singletons and `callerDid` is stable
 * within a request, so all of them share one query.
 */
const readerSubscriptions = reactCache(readerSubscriptionsImpl);

async function readerSubscriptionsImpl(
  db: Db,
  schema: Schema,
  callerDid: string,
): Promise<{ dids: Array<string>; visibility: Map<string, LabelVisibility> }> {
  const ls = schema.labelerSubscriptions;
  const rows = await db
    .select({ labelerDid: ls.labelerDid, prefs: ls.prefs })
    .from(ls)
    .where(and(eq(ls.subscriberDid, callerDid), eq(ls.deleted, false)));
  const dids = new Set<string>();
  const visibility = new Map<string, LabelVisibility>();
  for (const row of rows) {
    dids.add(row.labelerDid);
    for (const p of (row.prefs as Array<LabelPref> | null) ?? []) {
      visibility.set(`${row.labelerDid} ${p.val}`, p.visibility);
    }
  }
  return { dids: [...dids], visibility };
}

/**
 * Labels on `subjects` from the caller's subscribed labelers, keyed by subject,
 * with each label's effective visibility (the reader's pref, default `warn`).
 *
 * A subject is either a **document AT-URI** or an **account DID**. Our own
 * labelers score prose and so label documents; labelers on the wider network
 * (pub-search, and every Bluesky-flavored moderation service) label accounts.
 * `document_labels.uri` stores the subject verbatim either way, so one query
 * serves both — callers just pass whichever subjects they hold.
 *
 * Pure SQL — no labeler network calls.
 */
export async function readLabelsForSubjects(
  db: Db,
  schema: Schema,
  callerDid: string,
  subjects: Array<string>,
): Promise<Map<string, Array<ArticleCardLabel>>> {
  const byUri = new Map<string, Array<ArticleCardLabel>>();
  const uris = [...new Set(subjects)];
  if (uris.length === 0) return byUri;
  const { dids, visibility } = await readerSubscriptions(db, schema, callerDid);
  if (dids.length === 0) return byUri;

  const dl = schema.documentLabels;
  const rows = await db
    .select({ src: dl.src, uri: dl.uri, val: dl.val })
    .from(dl)
    .where(and(inArray(dl.uri, uris), inArray(dl.src, dids)));

  for (const r of rows) {
    const arr = byUri.get(r.uri) ?? [];
    arr.push({
      src: r.src,
      val: r.val,
      visibility: visibility.get(`${r.src} ${r.val}`) ?? "warn",
    });
    byUri.set(r.uri, arr);
  }
  return byUri;
}

/** {@link readLabelsForSubjects} for document subjects. */
export async function readLabelsForUris(
  db: Db,
  schema: Schema,
  callerDid: string,
  uris: Array<string>,
): Promise<Map<string, Array<ArticleCardLabel>>> {
  return readLabelsForSubjects(db, schema, callerDid, uris);
}

/**
 * Labels on account DIDs, keyed by DID. Separate entry point from the document
 * one purely so call sites read honestly about what they are labelling.
 */
export async function readAccountLabels(
  db: Db,
  schema: Schema,
  callerDid: string | null | undefined,
  dids: Array<string>,
): Promise<Map<string, Array<ArticleCardLabel>>> {
  if (!callerDid) return new Map();
  return readLabelsForSubjects(db, schema, callerDid, dids);
}

/**
 * Attach each card's labels (from the caller's subscribed labelers, with
 * visibility) so rows can badge them without a client round-trip. Returns the
 * same cards with `labels` set; cheap for non-subscribers (no labeler rows).
 */
export async function attachSubscribedLabels<T extends LabelableCard>(
  db: Db,
  schema: Schema,
  callerDid: string | null | undefined,
  cards: Array<T>,
): Promise<Array<T>> {
  if (!callerDid || cards.length === 0) return cards;
  const byUri = await readLabelsForSubjects(
    db,
    schema,
    callerDid,
    labelSubjects(cards),
  );
  return attachLabelsFromMap(cards, byUri);
}

/**
 * Flat list of labels on `uris` for the caller's subscribed labelers, each
 * tagged with its document URI (for the `app.standard-reader.getLabels` XRPC).
 */
export async function labelsForUris(
  db: Db,
  schema: Schema,
  callerDid: string | null | undefined,
  uris: Array<string>,
): Promise<Array<ArticleCardLabel & { uri: string }>> {
  if (!callerDid) return [];
  const byUri = await readLabelsForUris(db, schema, callerDid, uris);
  const out: Array<ArticleCardLabel & { uri: string }> = [];
  for (const [uri, labels] of byUri) {
    for (const label of labels) out.push({ ...label, uri });
  }
  return out;
}

/** Active labels on a single document for the caller's subscribed labelers. */
export async function labelsForDocument(
  db: Db,
  schema: Schema,
  callerDid: string | null | undefined,
  uri: string,
): Promise<Array<ArticleCardLabel>> {
  if (!callerDid) return [];
  const byUri = await readLabelsForUris(db, schema, callerDid, [uri]);
  return byUri.get(uri) ?? [];
}

/**
 * Of `uris`, which the reader has chosen to hide via a subscribed labeler's
 * label set to `hide`. Used to filter feeds. Pure SQL.
 */
export async function hiddenDocumentUris(
  db: Db,
  schema: Schema,
  callerDid: string | null | undefined,
  uris: Array<string>,
): Promise<Set<string>> {
  const hidden = new Set<string>();
  if (!callerDid || uris.length === 0) return hidden;
  const byUri = await readLabelsForSubjects(db, schema, callerDid, uris);
  return hiddenUrisFromLabels(byUri);
}

/**
 * Drop documents the reader has hidden via labels — whether the `hide` label
 * sits on the document itself or on the account that published it. Flat-array
 * convenience.
 */
export async function filterHiddenDocuments<T extends LabelableCard>(
  db: Db,
  schema: Schema,
  callerDid: string | null | undefined,
  cards: Array<T>,
): Promise<Array<T>> {
  const hidden = await hiddenDocumentUris(
    db,
    schema,
    callerDid,
    labelSubjects(cards),
  );
  return hidden.size === 0
    ? cards
    : cards.filter((c) => !isCardHidden(c, hidden));
}

/** Distinct document URIs a labeler has labeled (labeler-detail listing). */
export async function documentUrisLabeledBy(
  db: Db,
  schema: Schema,
  labelerDid: string,
): Promise<Array<string>> {
  const dl = schema.documentLabels;
  const rows = await db
    .selectDistinct({ uri: dl.uri })
    .from(dl)
    .where(eq(dl.src, labelerDid));
  return rows.map((r) => r.uri);
}

// ── Labeler HTTP (sync path only) ────────────────────────────────────────────

async function fetchWithTimeout(url: string, ms = 4000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Hard stop on pagination so a misbehaving labeler can't loop forever. */
const MAX_LABEL_PAGES = 200;

/**
 * Query a labeler's `queryLabels`, paginating from `sinceCursor` (or from the
 * beginning if omitted) until exhausted. Returns the labels fetched plus the
 * cursor to resume from next time.
 *
 * The server only returns a `cursor` on a full page (see labelers' own
 * `queryLabels` impl) — a short final page means "caught up," so `cursor` here
 * is the last *full* page's boundary rather than `sinceCursor` unchanged. The
 * next run harmlessly re-fetches (and re-applies) that final partial page.
 */
async function queryLabeler(
  did: string,
  uris: Array<string>,
  sinceCursor?: string,
): Promise<{ labels: Array<DisplayLabel>; cursor: string | undefined }> {
  const base = await resolveLabelerEndpoint(did);
  if (!base) return { labels: [], cursor: sinceCursor };
  // Defense-in-depth: re-validate the stored endpoint before fetching, in
  // case a malicious URL was stored before the ingest-time guard was added
  // (security audit C3).
  try {
    assertSafeFetchUrl(base);
  } catch {
    return { labels: [], cursor: sinceCursor };
  }

  const labels: Array<DisplayLabel> = [];
  let cursor = sinceCursor;
  for (let page = 0; page < MAX_LABEL_PAGES; page++) {
    const url = new URL(`${base}/xrpc/com.atproto.label.queryLabels`);
    for (const u of uris) url.searchParams.append("uriPatterns", u);
    url.searchParams.append("sources", did);
    url.searchParams.set("limit", "250");
    if (cursor) url.searchParams.set("cursor", cursor);
    try {
      const res = await fetchWithTimeout(url.toString());
      if (!res.ok) break;
      const json = (await res.json()) as {
        labels?: Array<DisplayLabel>;
        cursor?: string;
      };
      const batch = json.labels ?? [];
      labels.push(...batch);
      if (!json.cursor || batch.length === 0) break;
      cursor = json.cursor;
    } catch {
      break;
    }
  }
  return { labels, cursor };
}

/** The latest state per (src, uri, val), split into active vs. negated. */
export interface LabelDiff {
  active: Array<DisplayLabel>;
  negated: Array<{ src: string; uri: string; val: string }>;
}

/**
 * Reduce a raw label list (as fetched incrementally, oldest-first) to its
 * latest state per (src, uri, val): still-active labels to upsert, and
 * negated ones to remove from the mirror.
 */
export function resolveLabelDiff(labels: Array<DisplayLabel>): LabelDiff {
  const latest = new Map<string, DisplayLabel>();
  for (const label of labels) {
    const key = `${label.src} ${label.uri} ${label.val}`;
    const prev = latest.get(key);
    if (!prev || (label.cts ?? "") >= (prev.cts ?? "")) latest.set(key, label);
  }
  const active: Array<DisplayLabel> = [];
  const negated: Array<{ src: string; uri: string; val: string }> = [];
  for (const label of latest.values()) {
    if (label.neg) {
      negated.push({ src: label.src, uri: label.uri, val: label.val });
    } else {
      active.push(label);
    }
  }
  return { active, negated };
}

/**
 * Labels a labeler has emitted since `sinceCursor` (queries the `*` wildcard,
 * which our labelers support), reduced to a diff plus the cursor to persist
 * for next time. Omit `sinceCursor` to bootstrap a newly-registered labeler
 * from its full history. Used by the sync only.
 *
 * Every label is signature-checked against the labeler's published
 * `#atproto_label` key before it reaches the diff, so nothing unverified is
 * ever mirrored into the read-model. Labels that fail are dropped and counted;
 * a non-zero `rejected` means the labeler served something we could not
 * attribute to it, which the caller logs.
 */
export async function fetchLabelerLabelsSince(
  did: string,
  sinceCursor: string | undefined,
): Promise<{
  diff: LabelDiff;
  cursor: string | undefined;
  rejected: number;
}> {
  const { labels, cursor } = await queryLabeler(did, ["*"], sinceCursor);
  const { verified, rejected } = await verifyLabels(labels, did);
  return { diff: resolveLabelDiff(verified), cursor, rejected };
}
