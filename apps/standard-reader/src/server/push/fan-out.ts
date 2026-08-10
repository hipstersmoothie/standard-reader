import { and, eq, inArray, or } from "drizzle-orm";

import { articleReaderUrl } from "#/components/reader/format";

import { db } from "../../db/index.ts";
import {
  documentContributors,
  documents,
  profiles,
  publications,
  pushDevices,
  pushTopics,
} from "../../db/schema.ts";

/**
 * Turning one queued document into a list of (device, payload) sends.
 *
 * Split out from the run loop so the interesting part — who actually gets
 * notified — is testable on its own, and so the loop stays about throttling and
 * bookkeeping.
 *
 * Everything here goes through the Drizzle query builder rather than raw `sql`
 * templates on purpose: a JS array interpolated into a `sql` template binds as a
 * single scalar, so `= any(${array})` silently matches nothing. `inArray`
 * expands properly.
 */

/** A browser to deliver to. */
export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
  ownerDid: string;
}

/** What a queued document turns into on the wire. */
export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface DocumentNotification {
  documentUri: string;
  payload: PushPayload;
  targets: Array<PushTarget>;
}

/**
 * Web push caps the encrypted payload at ~4KB, and the notification itself is
 * two lines of text on a lock screen. Truncate hard rather than risk a 413.
 */
const MAX_TITLE = 80;
const MAX_BODY = 160;

/**
 * Safari renders a web push as title / "from <app name>" / body, and that middle
 * line is its own — no payload field suppresses or rewords it. A bare source
 * name on the title line therefore lands directly above "from Standard Reader",
 * and the two org names read as one garbled phrase. Labelling the line fixes the
 * collision: "New Post: The Standard Review" parses as a labelled value rather
 * than a competing attribution.
 */
const TITLE_PREFIX = "New Post: ";

export function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;

  // One character of the budget belongs to the ellipsis.
  const slice = trimmed.slice(0, max - 1);

  // If the cut already landed on a word boundary, keep the whole slice — backing
  // off to the previous space would throw away a word for nothing.
  if (/\s/.test(trimmed.charAt(max - 1))) {
    return `${slice.trimEnd()}…`;
  }

  // Otherwise back off to the last space, unless that's so far back it would
  // leave almost nothing — a single very long word is better cut mid-word.
  const lastSpace = slice.lastIndexOf(" ");
  const base = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${base.trimEnd()}…`;
}

/**
 * Notification `tag`, which collapses a burst from one source into a single
 * notification on the device instead of a stack. Also what stops a retried send
 * from showing twice. Push services cap this, so keep it short.
 */
export function notificationTag(
  publicationUri: string | null,
  authorDid: string,
): string {
  const source = publicationUri ?? authorDid;
  return `sr:${source.slice(-32)}`;
}

/** Everything the payload needs, in one round trip. (Neon lives a region away
 * from the app, so round-trip count is what's worth optimizing.) */
async function loadDocument(documentUri: string) {
  const rows = await db
    .select({
      uri: documents.uri,
      did: documents.did,
      title: documents.title,
      description: documents.description,
      publicationUri: documents.publicationUri,
      publicationName: publications.name,
      authorDisplayName: profiles.displayName,
      authorHandle: profiles.handle,
    })
    .from(documents)
    .leftJoin(publications, eq(publications.uri, documents.publicationUri))
    .leftJoin(profiles, eq(profiles.did, documents.did))
    .where(and(eq(documents.uri, documentUri), eq(documents.deleted, false)))
    .limit(1);

  return rows[0] ?? null;
}

/** Author plus every credited contributor — the people an "author" opt-in can
 * match. */
export async function documentSubjectDids(
  documentUri: string,
  authorDid: string,
): Promise<Array<string>> {
  const rows = await db
    .select({ did: documentContributors.did })
    .from(documentContributors)
    .where(eq(documentContributors.documentUri, documentUri));

  return [...new Set([authorDid, ...rows.map((row) => row.did)])];
}

/**
 * Which browsers should hear about this document.
 *
 * `push_topics` is the permission — a row there is the only reason anyone gets
 * a notification, and it is honoured as written.
 *
 * `selectDistinct` matters: a reader with two devices should get two sends, but
 * the join must not multiply rows for any other reason.
 *
 * **The author is deliberately NOT excluded.** An earlier version dropped the
 * author and every credited contributor, reasoning that being told about your
 * own post is noise. That is wrong for an opt-in this explicit: someone who
 * turned the bell on for a source asked to hear about it, and silently
 * discarding what they asked for is worse than one redundant notification. It
 * also made the feature impossible to test on your own publication — which is
 * exactly how the first person to try it tested, and they got nothing.
 *
 * Note this does NOT consult `subscriptions` / `user_follows`: notifications are
 * deliberately independent of following, so the opt-in row stands on its own.
 */
export async function resolveTargets(
  publicationUri: string | null,
  subjectDids: Array<string>,
): Promise<Array<PushTarget>> {
  if (subjectDids.length === 0) return [];

  const authorMatch = and(
    eq(pushTopics.subjectType, "author"),
    inArray(pushTopics.subject, subjectDids),
  );
  const publicationMatch = publicationUri
    ? and(
        eq(pushTopics.subjectType, "publication"),
        eq(pushTopics.subject, publicationUri),
      )
    : undefined;

  const optedIn = db
    .select({ ownerDid: pushTopics.ownerDid })
    .from(pushTopics)
    .where(publicationMatch ? or(authorMatch, publicationMatch) : authorMatch);

  return db
    .selectDistinct({
      endpoint: pushDevices.endpoint,
      p256dh: pushDevices.p256dh,
      auth: pushDevices.auth,
      ownerDid: pushDevices.ownerDid,
    })
    .from(pushDevices)
    .where(inArray(pushDevices.ownerDid, optedIn));
}

/**
 * Build the notification for a queued document, or `null` when there is nothing
 * to send (document gone, unlinkable, or nobody opted in).
 */
export async function buildNotification(
  documentUri: string,
  baseUrl: string,
): Promise<DocumentNotification | null> {
  const document = await loadDocument(documentUri);
  if (!document) return null;

  const url = articleReaderUrl(document.uri, baseUrl);
  if (!url) return null;

  const subjectDids = await documentSubjectDids(documentUri, document.did);
  const targets = await resolveTargets(document.publicationUri, subjectDids);
  if (targets.length === 0) return null;

  return {
    documentUri,
    payload: buildPayload(document, url),
    targets,
  };
}

/** Split out from {@link buildNotification} so the copy is testable without a DB. */
export function buildPayload(
  document: {
    did: string;
    title: string;
    description: string | null;
    publicationUri: string | null;
    publicationName: string | null;
    authorDisplayName: string | null;
    authorHandle: string | null;
  },
  url: string,
): PushPayload {
  // Whose name goes on the notification: the publication when the post has one,
  // otherwise the author — matching how the reader chose to follow it.
  const source =
    document.publicationName ??
    document.authorDisplayName ??
    (document.authorHandle ? `@${document.authorHandle}` : null) ??
    "Standard Reader";

  // The prefix eats into the same budget, so the source is truncated to what is
  // left rather than to the full cap.
  const label = truncate(source, MAX_TITLE - TITLE_PREFIX.length);

  // A post with neither title nor description sends an empty body on purpose —
  // the service worker fills it with generic copy, which is what keeps every
  // push showing something. (iOS revokes the subscription if one displays
  // nothing at all.)
  return {
    title: `${TITLE_PREFIX}${label}`,
    body: truncate(document.title || document.description || "", MAX_BODY),
    url,
    tag: notificationTag(document.publicationUri, document.did),
  };
}
