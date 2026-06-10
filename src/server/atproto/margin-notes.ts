import type { JsonValue } from "#/integrations/tanstack-query/api-shapes";
import type { ConstellationBacklinkRecord } from "#/server/atproto/constellation";
import type {
  DocumentComment,
  DocumentCommentAuthor,
} from "#/server/reader/document-comments";

import { fetchBlueskyPublicProfileFields } from "#/lib/bluesky-public-profile";
import { marginNoteUrl } from "#/lib/margin-note-url";
import { semblePageUrl } from "#/lib/semble-page-url";
import {
  COSMIK_CARD_COLLECTION,
  MARGIN_DISCUSSION_COLLECTIONS,
  MARGIN_NOTE_COLLECTIONS,
  getMarginNoteBacklinksForTarget,
  getMarginReplyCountForNote,
} from "#/server/atproto/constellation";
import { fetchRepoRecord } from "#/server/atproto/fetch-record";
import { resolveIdentity } from "#/server/atproto/identity";

const MARGIN_AVATAR_ORIGIN = "https://margin.at";
const DISCUSSION_MOTIVATIONS = new Set([
  "commenting",
  "highlighting",
  "questioning",
  "assessing",
  "describing",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function noteUriFromRecord(record: ConstellationBacklinkRecord): string {
  return `at://${record.did}/${record.collection}/${record.rkey}`;
}

function marginAvatarUrl(did: string): string {
  return `${MARGIN_AVATAR_ORIGIN}/api/avatar/${encodeURIComponent(did)}`;
}

const MARGIN_DISCUSSION_COLLECTION_SET = new Set<string>(
  MARGIN_DISCUSSION_COLLECTIONS,
);
const MARGIN_COUNT_TTL_MS = 5 * 60 * 1000;
const COSMIK_DISCUSSION_TTL_MS = 10 * 60 * 1000;

const marginCountByUrlsCache = new Map<
  string,
  { count: number; expiresAt: number }
>();
const cosmikDiscussionCache = new Map<
  string,
  { expiresAt: number; isDiscussion: boolean }
>();

function marginLinkTargetVariants(url: string): Array<string> {
  const trimmed = url.trim();
  if (!trimmed) return [];

  const variants = new Set<string>([trimmed]);
  try {
    const parsed = new URL(trimmed);
    if (!parsed.search && !parsed.hash) {
      if (trimmed.endsWith("/")) {
        variants.add(trimmed.replace(/\/+$/, "") || trimmed);
      } else {
        variants.add(`${trimmed}/`);
      }
      if (parsed.pathname === "/") {
        variants.add(`${parsed.origin}/`);
        variants.add(parsed.origin);
      }
    }
  } catch {
    // Keep the original target when it is not a parseable absolute URL.
  }

  return [...variants];
}

function dedupeMarginRecords(
  recordSets: Array<Array<ConstellationBacklinkRecord>>,
): Array<ConstellationBacklinkRecord> {
  const seen = new Set<string>();
  const merged: Array<ConstellationBacklinkRecord> = [];

  for (const records of recordSets) {
    for (const record of records) {
      if (!MARGIN_DISCUSSION_COLLECTION_SET.has(record.collection)) continue;
      const key = noteUriFromRecord(record);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(record);
    }
  }

  return merged;
}

interface ParsedMarginNote {
  uri: string;
  collection: string;
  authorDid: string;
  motivation: string;
  commentary: string;
  commentaryFacets: Array<JsonValue> | null;
  quote: string | null;
  createdAt: string;
  /** Bookmarked page URL on `network.cosmik.card` records (Semble page target). */
  pageUrl?: string;
}

function parseCosmikCardValue(
  record: ConstellationBacklinkRecord,
  value: unknown,
): ParsedMarginNote | null {
  if (!isRecord(value)) return null;

  const type = typeof value.type === "string" ? value.type : "";
  if (type === "URL") return null;

  const content = isRecord(value.content) ? value.content : null;
  const commentary =
    typeof content?.text === "string" ? content.text.trim() : "";
  if (!commentary) return null;

  const pageUrl =
    typeof value.url === "string"
      ? value.url.trim()
      : typeof content?.url === "string"
        ? content.url.trim()
        : "";
  if (!pageUrl) return null;

  const createdAt =
    typeof value.createdAt === "string"
      ? value.createdAt
      : new Date().toISOString();

  return {
    uri: noteUriFromRecord(record),
    collection: record.collection,
    authorDid: record.did,
    motivation: "commenting",
    commentary,
    commentaryFacets: null,
    quote: null,
    createdAt,
    pageUrl,
  };
}

function parseMarginNoteValue(
  record: ConstellationBacklinkRecord,
  value: unknown,
): ParsedMarginNote | null {
  if (!isRecord(value)) return null;

  const motivation =
    typeof value.motivation === "string" ? value.motivation : "";
  if (!DISCUSSION_MOTIVATIONS.has(motivation)) return null;

  const body = isRecord(value.body) ? value.body : null;
  const commentary = typeof body?.value === "string" ? body.value.trim() : "";

  const target = isRecord(value.target) ? value.target : null;
  const selector = isRecord(target?.selector) ? target.selector : null;
  const quote =
    typeof selector?.exact === "string" ? selector.exact.trim() : null;

  if (!commentary && !quote) return null;

  const facets = Array.isArray(value.facets)
    ? (value.facets as Array<JsonValue>)
    : null;

  const createdAt =
    typeof value.createdAt === "string"
      ? value.createdAt
      : new Date().toISOString();

  return {
    uri: noteUriFromRecord(record),
    collection: record.collection,
    authorDid: record.did,
    motivation,
    commentary,
    commentaryFacets: facets,
    quote,
    createdAt,
  };
}

function parseDiscussionMarginRecord(
  record: ConstellationBacklinkRecord,
  value: unknown,
): ParsedMarginNote | null {
  if (record.collection === COSMIK_CARD_COLLECTION) {
    return parseCosmikCardValue(record, value);
  }

  if (
    MARGIN_NOTE_COLLECTIONS.includes(
      record.collection as (typeof MARGIN_NOTE_COLLECTIONS)[number],
    )
  ) {
    return parseMarginNoteValue(record, value);
  }

  return null;
}

function marginUrlsCacheKey(urls: Array<string>): string {
  return [...new Set(urls.flatMap((url) => marginLinkTargetVariants(url)))]
    .toSorted()
    .join("|");
}

async function discoverMarginBacklinkRecords(
  urls: Array<string>,
): Promise<Array<ConstellationBacklinkRecord>> {
  const linkTargets = [
    ...new Set(urls.flatMap((url) => marginLinkTargetVariants(url))),
  ];
  if (linkTargets.length === 0) return [];

  const backlinkSets = await Promise.all(
    linkTargets.map((target) => getMarginNoteBacklinksForTarget(target)),
  );
  return dedupeMarginRecords(backlinkSets);
}

async function fetchCosmikCardValue(
  record: ConstellationBacklinkRecord,
): Promise<unknown | null> {
  const identity = await resolveIdentity(record.did);
  if (!identity.pds) return null;
  return fetchRepoRecord(identity.pds, noteUriFromRecord(record));
}

async function isCosmikDiscussionCard(
  record: ConstellationBacklinkRecord,
): Promise<boolean> {
  const uri = noteUriFromRecord(record);
  const cached = cosmikDiscussionCache.get(uri);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.isDiscussion;
  }

  const value = await fetchCosmikCardValue(record);
  const isDiscussion = parseCosmikCardValue(record, value) != null;
  cosmikDiscussionCache.set(uri, {
    isDiscussion,
    expiresAt: Date.now() + COSMIK_DISCUSSION_TTL_MS,
  });
  return isDiscussion;
}

async function countCosmikDiscussionCards(
  records: Array<ConstellationBacklinkRecord>,
): Promise<number> {
  if (records.length === 0) return 0;

  const flags = await Promise.all(
    records.map((record) => isCosmikDiscussionCard(record)),
  );
  return flags.filter(Boolean).length;
}

async function loadMarginNote(
  record: ConstellationBacklinkRecord,
): Promise<ParsedMarginNote | null> {
  if (record.collection === COSMIK_CARD_COLLECTION) {
    const value = await fetchCosmikCardValue(record);
    return parseCosmikCardValue(record, value);
  }

  const identity = await resolveIdentity(record.did);
  if (!identity.pds) return null;

  const value = await fetchRepoRecord(identity.pds, noteUriFromRecord(record));
  return parseDiscussionMarginRecord(record, value);
}

async function discoverParsedMarginNotes(
  urls: Array<string>,
): Promise<Array<ParsedMarginNote>> {
  const records = await discoverMarginBacklinkRecords(urls);
  if (records.length === 0) return [];

  const loadedNotes = await Promise.all(
    records.map((record) => loadMarginNote(record)),
  );
  return loadedNotes.filter((note): note is ParsedMarginNote => note != null);
}

async function resolveMarginAuthors(
  dids: Array<string>,
): Promise<Map<string, DocumentCommentAuthor>> {
  const unique = [...new Set(dids)];
  const authors = new Map<string, DocumentCommentAuthor>();

  await Promise.all(
    unique.map(async (did) => {
      const [identity, profile] = await Promise.all([
        resolveIdentity(did),
        fetchBlueskyPublicProfileFields(did),
      ]);

      authors.set(did, {
        did,
        handle: profile?.handle ?? identity.handle,
        displayName: profile?.displayName ?? null,
        avatarUrl: profile?.avatarUrl ?? marginAvatarUrl(did),
      });
    }),
  );

  return authors;
}

/** Discover and hydrate margin.at notes for article URL targets. */
export async function fetchMarginNotesForUrls(
  urls: Array<string>,
): Promise<Array<DocumentComment>> {
  const parsedNotes = await discoverParsedMarginNotes(urls);
  if (parsedNotes.length === 0) return [];

  const authorByDid = await resolveMarginAuthors(
    parsedNotes.map((note) => note.authorDid),
  );

  const comments: Array<DocumentComment> = [];

  for (const note of parsedNotes) {
    const isCosmikCard = note.collection === COSMIK_CARD_COLLECTION;
    const postUrl = isCosmikCard
      ? semblePageUrl(note.pageUrl ?? "")
      : marginNoteUrl(note.uri);
    const author = authorByDid.get(note.authorDid);
    if (!postUrl || !author) continue;

    const replyCount = isCosmikCard
      ? 0
      : await getMarginReplyCountForNote(note.uri);

    comments.push({
      source: isCosmikCard ? "semble" : "margin",
      kind: note.quote ? "quote" : "link",
      postUri: note.uri,
      postUrl,
      author,
      commentary: note.commentary,
      commentaryFacets: note.commentaryFacets,
      quote: note.quote,
      replyCount,
      indexedAt: note.createdAt,
    });
  }

  return comments;
}

/**
 * Fast margin note total for card badges — Constellation for `at.margin.*`
 * (no PDS hydration), PDS lookup only for `network.cosmik.card` NOTE cards.
 */
export async function countMarginNotesForUrls(
  urls: Array<string>,
): Promise<number> {
  const trimmed = urls.map((url) => url.trim()).filter(Boolean);
  if (trimmed.length === 0) return 0;

  const cacheKey = marginUrlsCacheKey(trimmed);
  const cached = marginCountByUrlsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.count;
  }

  const records = await discoverMarginBacklinkRecords(trimmed);
  if (records.length === 0) {
    marginCountByUrlsCache.set(cacheKey, {
      count: 0,
      expiresAt: Date.now() + MARGIN_COUNT_TTL_MS,
    });
    return 0;
  }

  const cosmikRecords: Array<ConstellationBacklinkRecord> = [];
  let count = 0;

  for (const record of records) {
    if (record.collection === COSMIK_CARD_COLLECTION) {
      cosmikRecords.push(record);
    } else {
      count += 1;
    }
  }

  if (cosmikRecords.length > 0) {
    count += await countCosmikDiscussionCards(cosmikRecords);
  }

  marginCountByUrlsCache.set(cacheKey, {
    count,
    expiresAt: Date.now() + MARGIN_COUNT_TTL_MS,
  });
  return count;
}
