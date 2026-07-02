/**
 * Read labels for the reader UI from the read-model.
 *
 * Labels are mirrored into the `document_labels` table by a periodic sync (see
 * `sync.server.ts`) — the *only* time we contact a labeler. Every request path
 * (feeds, tag, article, labeler detail) reads labels from Postgres via SQL, so
 * a page load never makes a per-document label call. The HTTP helpers at the
 * bottom of this file exist solely for that sync.
 */

import type { LabelPref, LabelVisibility } from "#/db/schema/labels";
import type {
  ArticleCardLabel,
  Db,
  Schema,
} from "#/integrations/tanstack-query/api-shapes";

import { assertSafeFetchUrl } from "#/server/security/ssrf-guard";
import { and, eq, inArray } from "drizzle-orm";

import { resolveLabelerEndpoint } from "./resolve.server.ts";

/** A raw label as served by a labeler's `queryLabels` (sync path only). */
export interface DisplayLabel {
  src: string;
  uri: string;
  val: string;
  neg?: boolean;
  cts?: string;
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
 */
async function readerSubscriptions(
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
 * Labels for `uris` from the caller's subscribed labelers, keyed by document
 * URI, with each label's effective visibility (the reader's pref, default
 * `warn`). Pure SQL against `document_labels` — no labeler network calls.
 */
async function readLabelsForUris(
  db: Db,
  schema: Schema,
  callerDid: string,
  uris: Array<string>,
): Promise<Map<string, Array<ArticleCardLabel>>> {
  const byUri = new Map<string, Array<ArticleCardLabel>>();
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

/**
 * Attach each card's labels (from the caller's subscribed labelers, with
 * visibility) so rows can badge them without a client round-trip. Returns the
 * same cards with `labels` set; cheap for non-subscribers (no labeler rows).
 */
export async function attachSubscribedLabels<
  T extends { uri: string; labels?: Array<ArticleCardLabel> },
>(
  db: Db,
  schema: Schema,
  callerDid: string | null | undefined,
  cards: Array<T>,
): Promise<Array<T>> {
  if (!callerDid || cards.length === 0) return cards;
  const byUri = await readLabelsForUris(
    db,
    schema,
    callerDid,
    cards.map((c) => c.uri),
  );
  if (byUri.size === 0) return cards;
  return cards.map((card) => {
    const labels = byUri.get(card.uri);
    return labels ? { ...card, labels } : card;
  });
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
  const byUri = await readLabelsForUris(db, schema, callerDid, uris);
  for (const [uri, labels] of byUri) {
    if (labels.some((l) => l.visibility === "hide")) hidden.add(uri);
  }
  return hidden;
}

/** Drop documents the reader has hidden via labels. Flat-array convenience. */
export async function filterHiddenDocuments<T extends { uri: string }>(
  db: Db,
  schema: Schema,
  callerDid: string | null | undefined,
  cards: Array<T>,
): Promise<Array<T>> {
  const hidden = await hiddenDocumentUris(
    db,
    schema,
    callerDid,
    cards.map((c) => c.uri),
  );
  return hidden.size === 0 ? cards : cards.filter((c) => !hidden.has(c.uri));
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

async function queryLabeler(
  did: string,
  uris: Array<string>,
): Promise<Array<DisplayLabel>> {
  const base = await resolveLabelerEndpoint(did);
  if (!base) return [];
  // Defense-in-depth: re-validate the stored endpoint before fetching, in
  // case a malicious URL was stored before the ingest-time guard was added
  // (security audit C3).
  try {
    assertSafeFetchUrl(base);
  } catch {
    return [];
  }
  const url = new URL(`${base}/xrpc/com.atproto.label.queryLabels`);
  for (const u of uris) url.searchParams.append("uriPatterns", u);
  url.searchParams.append("sources", did);
  url.searchParams.set("limit", "250");
  try {
    const res = await fetchWithTimeout(url.toString());
    if (!res.ok) return [];
    const json = (await res.json()) as { labels?: Array<DisplayLabel> };
    return json.labels ?? [];
  } catch {
    return [];
  }
}

/**
 * Reduce a raw label list to the labels currently in effect: the latest by `cts`
 * for each (src, uri, val), dropping any whose latest state is a negation.
 */
export function resolveActiveLabels(
  labels: Array<DisplayLabel>,
): Array<DisplayLabel> {
  const latest = new Map<string, DisplayLabel>();
  for (const label of labels) {
    const key = `${label.src} ${label.uri} ${label.val}`;
    const prev = latest.get(key);
    if (!prev || (label.cts ?? "") >= (prev.cts ?? "")) latest.set(key, label);
  }
  return [...latest.values()].filter((l) => !l.neg);
}

/**
 * All active labels a labeler has ever emitted (best effort: queries with the
 * `*` wildcard, which our labelers support). Used by the sync only.
 */
export async function fetchAllLabelsFromLabeler(
  did: string,
): Promise<Array<DisplayLabel>> {
  return resolveActiveLabels(await queryLabeler(did, ["*"]));
}
