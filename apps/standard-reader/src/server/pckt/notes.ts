/**
 * pckt "notes" (`blog.pckt.mini.post`) surfaced in a document's Discussion.
 *
 * Read-only and microcosm-only: Constellation discovers notes that reply to
 * (`.subject`) or quote (`.embed.record`) a document; Slingshot hydrates each
 * note record. Nothing is persisted and no author PDS is ever contacted
 * (`fetchRepoRecordWithFallback` with no `pds` arg reads Slingshot alone).
 */

import type { JsonValue } from "#/integrations/tanstack-query/api-shapes";
import { fetchBlueskyPublicProfileFields } from "#/lib/bluesky-public-profile";
import {
  MINI_POST_COLLECTION,
  normalizeMiniPost,
  pcktNoteUrl,
} from "#/lib/pckt/mini";
import type { MiniPost } from "#/lib/pckt/mini";
import type { ConstellationBacklinkRecord } from "#/server/atproto/constellation";
import {
  getNoteBacklinksForDocument,
  getNoteBacklinksForPublication,
} from "#/server/atproto/constellation";
import { fetchRepoRecordWithFallback } from "#/server/atproto/fetch-record";
import { resolveIdentity } from "#/server/atproto/identity";
import type {
  DocumentComment,
  DocumentCommentAuthor,
} from "#/server/reader/document-comments";

const NOTE_CACHE_TTL_MS = 5 * 60 * 1000;

const noteCommentsCache = new Map<
  string,
  { expiresAt: number; comments: Array<DocumentComment> }
>();

function noteUriFromRecord(record: ConstellationBacklinkRecord): string {
  return `at://${record.did}/${record.collection}/${record.rkey}`;
}

async function hydrateNote(
  record: ConstellationBacklinkRecord,
): Promise<MiniPost | null> {
  const uri = noteUriFromRecord(record);
  // Slingshot only — omit the `pds` arg so no author PDS is contacted.
  const result = await fetchRepoRecordWithFallback(uri);
  if (!result) return null;
  return normalizeMiniPost(
    uri,
    record.did,
    record.rkey,
    result.cid ?? null,
    result.value,
  );
}

async function resolveNoteAuthors(
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
        avatarUrl: profile?.avatarUrl ?? null,
      });
    }),
  );

  return authors;
}

/** Map a hydrated note to a Discussion comment (links to the note on pckt). */
function toComment(
  note: MiniPost,
  author: DocumentCommentAuthor,
  documentUri: string,
): DocumentComment {
  const isQuote = note.quotedRecordUri === documentUri;
  return {
    source: "note",
    kind: isQuote ? "quote" : "link",
    postUri: note.uri,
    postUrl: pcktNoteUrl(note.did, note.rkey),
    author,
    commentary: note.text,
    commentaryFacets: note.facets,
    quote: null,
    replyCount: 0,
    indexedAt: note.createdAt,
  };
}

/**
 * pckt notes that reply to or quote `documentUri`, mapped to Discussion
 * comments. Best-effort: returns [] on any failure so the section still renders
 * its other sources.
 */
export async function fetchNotesForDocument(
  documentUri: string,
): Promise<Array<DocumentComment>> {
  if (!documentUri.startsWith("at://")) return [];

  const cached = noteCommentsCache.get(documentUri);
  if (cached && cached.expiresAt > Date.now()) return cached.comments;

  try {
    const records = await getNoteBacklinksForDocument(documentUri);
    const hydrated = await Promise.all(
      records.map((record) => hydrateNote(record)),
    );
    const notes = hydrated.filter((note): note is MiniPost => note != null);

    if (notes.length === 0) {
      // Only cache "no notes" when Constellation genuinely reported none. If it
      // found records but every hydration failed (Slingshot hiccup), caching []
      // would hide real notes behind "No discussion yet" for the full TTL, and
      // a transient blip would look identical to a document with no discussion.
      if (records.length === 0) {
        noteCommentsCache.set(documentUri, {
          comments: [],
          expiresAt: Date.now() + NOTE_CACHE_TTL_MS,
        });
      }
      return [];
    }

    const authorByDid = await resolveNoteAuthors(notes.map((note) => note.did));

    const comments: Array<DocumentComment> = [];
    for (const note of notes) {
      const author = authorByDid.get(note.did);
      if (!author) continue;
      comments.push(toComment(note, author, documentUri));
    }

    noteCommentsCache.set(documentUri, {
      comments,
      expiresAt: Date.now() + NOTE_CACHE_TTL_MS,
    });
    return comments;
  } catch {
    return cached?.comments ?? [];
  }
}

export interface PublicationLatestNote {
  uri: string;
  /** The pckt web permalink for the note. */
  url: string;
  text: string;
  facets: Array<JsonValue> | null;
  createdAt: string;
}

const latestPublicationNoteCache = new Map<
  string,
  { expiresAt: number; note: PublicationLatestNote | null }
>();

/**
 * The most recent pckt note published under `publicationUri` (its `publication`
 * field), for the teaser atop a publication profile. Best-effort; null on
 * failure or when the publication has no notes.
 */
export async function fetchLatestPublicationNote(
  publicationUri: string,
): Promise<PublicationLatestNote | null> {
  if (!publicationUri.startsWith("at://")) return null;

  const cached = latestPublicationNoteCache.get(publicationUri);
  if (cached && cached.expiresAt > Date.now()) return cached.note;

  try {
    const records = await getNoteBacklinksForPublication(publicationUri);
    const hydrated = await Promise.all(
      records.map((record) => hydrateNote(record)),
    );
    const notes = hydrated.filter((note): note is MiniPost => note != null);

    const latest = notes.toSorted(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];

    const note: PublicationLatestNote | null = latest
      ? {
          uri: latest.uri,
          url: pcktNoteUrl(latest.did, latest.rkey),
          text: latest.text,
          facets: latest.facets,
          createdAt: latest.createdAt,
        }
      : null;

    latestPublicationNoteCache.set(publicationUri, {
      note,
      expiresAt: Date.now() + NOTE_CACHE_TTL_MS,
    });
    return note;
  } catch {
    return cached?.note ?? null;
  }
}

/** Count of pckt notes referencing `documentUri` (deduped). Best-effort. */
export async function countNotesForDocument(
  documentUri: string,
): Promise<number> {
  if (!documentUri.startsWith("at://")) return 0;
  const cached = noteCommentsCache.get(documentUri);
  if (cached && cached.expiresAt > Date.now()) return cached.comments.length;
  try {
    const records = await getNoteBacklinksForDocument(documentUri);
    return records.filter(
      (record) => record.collection === MINI_POST_COLLECTION,
    ).length;
  } catch {
    return cached?.comments.length ?? 0;
  }
}
