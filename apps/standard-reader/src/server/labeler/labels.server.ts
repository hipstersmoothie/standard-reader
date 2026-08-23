/**
 * Read labels for the reader UI from the read-model.
 *
 * Labels are mirrored into the `document_labels` table by a periodic sync (see
 * `sync.server.ts`) — the *only* time we contact a labeler. Every request path
 * (feeds, tag, article, labeler detail) reads labels from Postgres via SQL, so
 * a page load never makes a per-document label call. The HTTP helpers at the
 * bottom of this file exist solely for that sync.
 */

import type {
  LabelPref,
  LabelVisibility,
} from "@standard-reader/db/schema/labels.ts";
import { and, eq, inArray } from "drizzle-orm";
import { cache as reactCache } from "react";

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

/**
 * The labeler DIDs a reader is subscribed to (from the read-model mirror).
 *
 * Includes labelers the reader has **disabled** — this answers "what is in my
 * list", which the settings and directory surfaces need in order to show a
 * muted labeler at all. Label resolution uses `readerSubscriptions` instead,
 * which filters them out.
 */
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
  // `enabled = false` labelers are deliberately excluded here and *only* here:
  // this is the label-resolution path, so a muted labeler stops badging,
  // warning, and hiding across every surface at once. It stays in the reader's
  // subscription list (see `subscribedLabelerDids`) with its prefs intact, so
  // re-enabling restores exactly what they had.
  const rows = await db
    .select({ labelerDid: ls.labelerDid, prefs: ls.prefs })
    .from(ls)
    .where(
      and(
        eq(ls.subscriberDid, callerDid),
        eq(ls.deleted, false),
        eq(ls.enabled, true),
      ),
    );
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

/**
 * Distinct label values a labeler has actually emitted, per the read-model.
 *
 * A labeler's registration record declares what it *says* it emits, and the two
 * drift — so this is the ground truth used to spot values with no definition.
 */
export async function observedLabelValues(
  db: Db,
  schema: Schema,
  labelerDid: string,
): Promise<Array<string>> {
  const dl = schema.documentLabels;
  const rows = await db
    .selectDistinct({ val: dl.val })
    .from(dl)
    .where(eq(dl.src, labelerDid));
  return rows.map((r) => r.val);
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
 * Page sizes tried in order, shrinking after a failure and **never growing back**.
 *
 * Not just tuning: some label servers fail *deterministically* on a large page
 * at a particular cursor. The Account Activity Labeler answers HTTP 500 for
 * `limit=250` at one offset every single time, while serving `limit=100` from
 * that same cursor without complaint — so a fixed 250 stopped its sync at 2000
 * labels permanently, since every later run stalled on the same page.
 *
 * Monotonic by measurement, not by preference: a version that climbed back up
 * after a few clean pages made *less* progress (0 labels per run vs 175),
 * because the same server also answers some offsets with a bogus empty page —
 * 200, no labels, no cursor — at larger limits, which is indistinguishable from
 * a legitimate end of stream. Growing the page size back walked straight into
 * one and ended the run early.
 */
const PAGE_LIMITS = [250, 100, 25] as const;

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
  /** Stop after roughly this many labels — used by the classification probe,
   * which wants one small page rather than the labeler's whole history. */
  maxLabels?: number,
): Promise<{
  labels: Array<DisplayLabel>;
  cursor: string | undefined;
  error?: string;
}> {
  const base = await resolveLabelerEndpoint(did);
  if (!base) {
    return {
      labels: [],
      cursor: sinceCursor,
      error: "No label server declared",
    };
  }
  // Defense-in-depth: re-validate the stored endpoint before fetching, in
  // case a malicious URL was stored before the ingest-time guard was added
  // (security audit C3).
  try {
    assertSafeFetchUrl(base);
  } catch {
    return {
      labels: [],
      cursor: sinceCursor,
      error: "Unsafe label server URL",
    };
  }

  const labels: Array<DisplayLabel> = [];
  let cursor = sinceCursor;
  let transportError: string | undefined;
  // Page size shrinks on failure and never grows back. Some label servers fail
  // deterministically on a large page at a particular offset — the Account
  // Activity Labeler answers 500 for `limit=250` at one cursor while happily
  // serving `limit=100` from the same one. Retrying smaller walks past it.
  let limitIndex = 0;
  let pages = 0;

  while (pages < MAX_LABEL_PAGES) {
    const limit = Math.min(
      PAGE_LIMITS[limitIndex] ?? PAGE_LIMITS.at(-1) ?? 25,
      maxLabels ?? Number.MAX_SAFE_INTEGER,
    );
    const url = new URL(`${base}/xrpc/com.atproto.label.queryLabels`);
    for (const u of uris) url.searchParams.append("uriPatterns", u);
    url.searchParams.append("sources", did);
    url.searchParams.set("limit", String(limit));
    if (cursor) url.searchParams.set("cursor", cursor);

    /**
     * Give up on this page, or shrink and retry.
     *
     * A failure part-way through used to be treated as a successful partial
     * sync on the theory that the saved cursor would resume it. That only holds
     * for a *transient* failure: a deterministic one means every later run stops
     * at the same page and the labeler is capped forever — which is exactly what
     * pinned that labeler at 2000 of its labels. So the error is now reported
     * whether or not we got anything, and the caller records it.
     */
    const failed = (reason: string): boolean => {
      if (limitIndex + 1 < PAGE_LIMITS.length) {
        limitIndex++;
        return false;
      }
      transportError =
        pages === 0
          ? reason
          : `${reason} after ${labels.length} label(s); sync is incomplete`;
      return true;
    };

    try {
      const res = await fetchWithTimeout(url.toString());
      if (!res.ok) {
        if (failed(`Label server returned HTTP ${res.status}`)) break;
        continue;
      }
      const json = (await res.json()) as {
        labels?: Array<DisplayLabel>;
        cursor?: string;
      };
      const batch = json.labels ?? [];
      labels.push(...batch);
      pages++;
      if (maxLabels !== undefined && labels.length >= maxLabels) break;
      if (!json.cursor || batch.length === 0) break;
      cursor = json.cursor;
    } catch (error) {
      const reason = `Couldn't reach the label server (${error instanceof Error ? error.message : "unknown error"})`;
      if (failed(reason)) break;
      continue;
    }
  }
  return { labels, cursor, error: transportError };
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
/**
 * One unverified page of a labeler's labels, for cheap classification.
 *
 * Deliberately skips signature verification and the read-model entirely: the
 * caller only wants to know *what kind of thing* this labeler labels (see
 * `probeStandardSiteLabelers`), not to trust or store any of it. Verification
 * still gates everything that reaches `document_labels`.
 */
export async function sampleLabels(
  did: string,
  limit: number,
): Promise<{ labels: Array<DisplayLabel>; error?: string }> {
  const { labels, error } = await queryLabeler(did, ["*"], undefined, limit);
  return { labels: labels.slice(0, limit), error };
}

export async function fetchLabelerLabelsSince(
  did: string,
  sinceCursor: string | undefined,
): Promise<{
  diff: LabelDiff;
  cursor: string | undefined;
  rejected: number;
  /** Set when the labeler couldn't be reached at all, for the health display. */
  error?: string;
}> {
  const { labels, cursor, error } = await queryLabeler(did, ["*"], sinceCursor);
  const { verified, rejected } = await verifyLabels(labels, did);
  return { diff: resolveLabelDiff(verified), cursor, rejected, error };
}
