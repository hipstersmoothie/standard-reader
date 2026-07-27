/**
 * pckt "notes" — the `blog.pckt.mini.post` lexicon (a near-clone of
 * `app.bsky.feed.post`): plaintext `text` + AT-Proto byte facets + a bsky-style
 * embed union + reply/subject/publication references.
 *
 * This module is the ONE place that knows the note record shape. If pckt
 * revises the lexicon, update {@link normalizeMiniPost} and the path constants
 * here — nothing downstream inspects raw records.
 */

import type { JsonValue } from "#/integrations/tanstack-query/api-shapes";
import { fetchRepoRecordWithFallback } from "#/server/atproto/fetch-record";
import { parseAtUri } from "#/server/atproto/uri";

/** The notes collection NSID. */
export const MINI_POST_COLLECTION = "blog.pckt.mini.post";

/** The pckt web permalink for a note: `https://pckt.blog/n/<did>/<rkey>`. */
export function pcktNoteUrl(did: string, rkey: string): string {
  return `https://pckt.blog/n/${did}/${rkey}`;
}
/** Re-blog records ({subject: strongRef}). */
export const MINI_REPOST_COLLECTION = "blog.pckt.mini.repost";

/**
 * Constellation JSON paths on `blog.pckt.mini.post`. A note references a longer
 * post either by replying to it (`.subject`) or quoting it (`.embed.record`).
 */
export const MINI_POST_SUBJECT_PATH = ".subject";
export const MINI_POST_QUOTE_PATHS = [
  ".embed.record.uri",
  ".embed.record.record.uri",
] as const;
export const MINI_POST_PUBLICATION_PATH = ".publication";
export const MINI_POST_REPLY_PARENT_PATH = ".reply.parent.uri";
export const MINI_POST_REPLY_ROOT_PATH = ".reply.root.uri";

export interface MiniPost {
  uri: string;
  cid: string | null;
  did: string;
  rkey: string;
  text: string;
  facets: Array<JsonValue> | null;
  langs: Array<string>;
  tags: Array<string>;
  /** Raw embed union (`#images` / `#external` / `#record` / `#recordWithMedia`). */
  embed: JsonValue | null;
  /** AT-URI of the quoted record when the embed is a `#record`/`#recordWithMedia`. */
  quotedRecordUri: string | null;
  replyRootUri: string | null;
  replyParentUri: string | null;
  /** AT-URI of the `site.standard.document` this note is about, when set. */
  subjectUri: string | null;
  /** AT-URI of the `site.standard.publication` this note is published under. */
  publicationUri: string | null;
  createdAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function stringArray(value: unknown): Array<string> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/** Read the quoted record AT-URI from a `#record` / `#recordWithMedia` embed. */
function quotedRecordUri(embed: unknown): string | null {
  if (!isRecord(embed)) return null;
  // #record: { record: strongRef }; #recordWithMedia: { record: { record: strongRef } }
  const record = embed.record;
  if (isRecord(record)) {
    if (typeof record.uri === "string") return record.uri;
    const inner = record.record;
    if (isRecord(inner) && typeof inner.uri === "string") return inner.uri;
  }
  return null;
}

/**
 * Normalize a raw `blog.pckt.mini.post` record value into a {@link MiniPost}.
 * Returns null when required fields (`text`, `createdAt`) are missing.
 */
export function normalizeMiniPost(
  uri: string,
  did: string,
  rkey: string,
  cid: string | null,
  value: unknown,
): MiniPost | null {
  if (!isRecord(value)) return null;
  const text = typeof value.text === "string" ? value.text : null;
  const createdAt = optionalString(value.createdAt);
  if (text == null || !createdAt) return null;

  const reply = isRecord(value.reply) ? value.reply : null;
  const replyRoot = isRecord(reply?.root) ? reply.root : null;
  const replyParent = isRecord(reply?.parent) ? reply.parent : null;

  return {
    uri,
    cid,
    did,
    rkey,
    text,
    facets: Array.isArray(value.facets)
      ? (value.facets as Array<JsonValue>)
      : null,
    langs: stringArray(value.langs),
    tags: stringArray(value.tags),
    embed: (value.embed as JsonValue) ?? null,
    quotedRecordUri: quotedRecordUri(value.embed),
    replyRootUri: optionalString(replyRoot?.uri),
    replyParentUri: optionalString(replyParent?.uri),
    subjectUri: optionalString(value.subject),
    publicationUri: optionalString(value.publication),
    createdAt,
  };
}

/**
 * Fetch and normalize a single `blog.pckt.mini.post` by AT-URI. Routes through
 * Slingshot (no PDS fallback) so it is safe to call from the browser (e.g. the
 * `noteEmbed` block renderer), mirroring {@link fetchPcktGallery}.
 */
export async function fetchMiniPost(uri: string): Promise<MiniPost | null> {
  const parsed = parseAtUri(uri);
  if (!parsed || parsed.collection !== MINI_POST_COLLECTION) return null;

  const result = await fetchRepoRecordWithFallback(uri);
  if (!result?.value) return null;
  return normalizeMiniPost(
    uri,
    parsed.did,
    parsed.rkey,
    result.cid ?? null,
    result.value,
  );
}
