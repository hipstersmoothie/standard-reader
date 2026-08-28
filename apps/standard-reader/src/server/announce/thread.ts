/**
 * Build and post the weekly "hottest articles" thread as `app.bsky.feed.post`
 * records: each article gets a rich `app.bsky.embed.external` link card back to
 * Standard Reader, replies are chained root→parent, and the final CTA post
 * carries a link facet to the app.
 *
 * Posts are created SEQUENTIALLY: every reply references the previous post's
 * `cid`, which is only known after that post is written — so `applyWrites`
 * (which needs all refs up front) can't be used here.
 *
 * Posts are CREATED, never rewritten: `createRecord` at a fresh TID. A published
 * post is immutable as far as the rest of the network is concerned — replies,
 * likes and quotes all pin its `cid` — so writing over one at a stable rkey
 * orphans them onto content that did not exist when they were written and leaves
 * AppViews disagreeing with the PDS about what the post says. Not publishing the
 * thread twice is the ledger's job (`./ledger.ts`), backed by
 * {@link findWeekThreadRoot} below; it is never the write path's.
 */
import type { Client } from "@atcute/client";
import { ok } from "@atcute/client";

import { utf8ByteLength } from "#/lib/leaflet/utf8";
import { uploadBlob } from "#/server/atproto/repo-records";

import {
  BSKY_FEED_POST,
  MAX_THUMB_BYTES,
  THREAD_ROOT_MARKER,
} from "./config.ts";
import { isoWeekKey } from "./week.ts";

/** A `com.atproto.repo.strongRef` target (uri + cid). */
export interface StrongRef {
  uri: string;
  cid: string;
}

export type FacetFeature =
  | { $type: "app.bsky.richtext.facet#link"; uri: string }
  | { $type: "app.bsky.richtext.facet#mention"; did: string };

export interface Facet {
  index: { byteStart: number; byteEnd: number };
  features: Array<FacetFeature>;
}

interface ExternalEmbed {
  uri: string;
  title: string;
  description: string;
  thumb?: Record<string, unknown>;
}

export interface PostSpec {
  text: string;
  external?: ExternalEmbed;
  facets?: Array<Facet>;
}

/**
 * A facet over the first occurrence of `needle` in `text`. Facet indices are
 * UTF-8 byte offsets. Returns `null` if `needle` isn't present.
 */
function facetOver(
  text: string,
  needle: string,
  feature: FacetFeature,
): Facet | null {
  const at = text.indexOf(needle);
  if (at === -1) return null;
  const byteStart = utf8ByteLength(text.slice(0, at));
  const byteEnd = byteStart + utf8ByteLength(needle);
  return { index: { byteStart, byteEnd }, features: [feature] };
}

/** One `app.bsky.richtext.facet#link` over `linkText` (`[]` if not found). */
export function linkFacets(
  text: string,
  linkText: string,
  uri: string,
): Array<Facet> {
  const facet = facetOver(text, linkText, {
    $type: "app.bsky.richtext.facet#link",
    uri,
  });
  return facet ? [facet] : [];
}

/** One `app.bsky.richtext.facet#mention` over `mentionText` (e.g. `@handle`). */
export function mentionFacet(
  text: string,
  mentionText: string,
  did: string,
): Facet | null {
  return facetOver(text, mentionText, {
    $type: "app.bsky.richtext.facet#mention",
    did,
  });
}

/**
 * Fetch an image URL and upload it as a blob for a link-card thumbnail. Returns
 * `null` (card renders without a thumb) on any failure: missing URL, non-image
 * content, oversized bytes, or network/PDS error.
 */
export async function fetchThumbBlob(
  client: Client,
  url: string | null,
): Promise<Record<string, unknown> | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    if (!mime.startsWith("image/")) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_THUMB_BYTES)
      return null;
    return await uploadBlob(client, bytes, mime);
  } catch {
    return null;
  }
}

/**
 * Assemble one `app.bsky.feed.post` record (optionally as a reply).
 *
 * `createdAt` is passed in rather than read from the clock so the record is a
 * pure function of the week's content — re-running the job then rewrites an
 * identical record instead of shifting the thread's timestamp.
 */
export function buildPostRecord(
  spec: PostSpec,
  createdAt: string,
  reply?: { root: StrongRef; parent: StrongRef },
): Record<string, unknown> {
  const record: Record<string, unknown> = {
    $type: BSKY_FEED_POST,
    text: spec.text,
    createdAt,
  };
  if (spec.facets && spec.facets.length > 0) {
    record.facets = spec.facets;
  }
  if (spec.external) {
    record.embed = {
      $type: "app.bsky.embed.external",
      external: {
        uri: spec.external.uri,
        title: spec.external.title,
        description: spec.external.description,
        ...(spec.external.thumb ? { thumb: spec.external.thumb } : {}),
      },
    };
  }
  if (reply) {
    record.reply = {
      root: { $type: "com.atproto.repo.strongRef", ...reply.root },
      parent: { $type: "com.atproto.repo.strongRef", ...reply.parent },
    };
  }
  return record;
}

/**
 * Create a single post record at a fresh TID and return its strongRef.
 *
 * `createRecord`, never `putRecord` at a computed rkey: the PDS picks the rkey,
 * so this can only ever add a post, never rewrite one somebody has already
 * replied to. Stopping the job from posting twice happens before we get here.
 */
export async function createPost(
  client: Client,
  repo: string,
  record: Record<string, unknown>,
): Promise<StrongRef> {
  const res = await ok(
    client.post("com.atproto.repo.createRecord", {
      input: {
        collection: BSKY_FEED_POST,
        record,
        repo,
      } as never,
    }),
  );
  return { uri: res.uri, cid: res.cid };
}

/** How many pages of the bot's own posts the duplicate scan will walk. */
const ROOT_SCAN_PAGE = 100;
const ROOT_SCAN_MAX_PAGES = 3;

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The AT-URI of a thread root already posted for `periodKey`, or `null`.
 *
 * This is the guard that used to be "write to a week-derived rkey and let
 * `putRecord` collapse the duplicate". That worked by mutating already-published
 * posts, which is far worse than the duplicate it prevented, so the check moved
 * here: ask the repo whether this week's thread exists instead of overwriting it
 * on the assumption that it might.
 *
 * Reads the bot's own posts newest-first and looks for a non-reply carrying
 * {@link THREAD_ROOT_MARKER} whose `createdAt` lands in the target week.
 *
 * The scan does not stop early on the first older-looking post: `createdAt` is
 * whatever the writer put there, not a repo ordering, and this very repo holds
 * posts the old job backdated to the week's nominal Friday. So it walks a fixed
 * few pages instead — the week being looked for is always the most recent one,
 * so its root is realistically on page one, and this runs once a week.
 *
 * Deliberately not fail-open: a transport error propagates, so a run that cannot
 * establish whether the thread already went out does not post one anyway.
 */
export async function findWeekThreadRoot(
  client: Client,
  repo: string,
  periodKey: string,
): Promise<string | null> {
  let cursor: string | undefined;

  for (let page = 0; page < ROOT_SCAN_MAX_PAGES; page++) {
    const res = await ok(
      client.get("com.atproto.repo.listRecords", {
        params: {
          collection: BSKY_FEED_POST,
          limit: ROOT_SCAN_PAGE,
          repo,
          ...(cursor ? { cursor } : {}),
        } as never,
      }),
    );

    for (const record of res.records) {
      const value = record.value;
      if (!isRecordValue(value)) continue;
      // Replies are thread posts 2..n, and the CTA — only roots count.
      if (value.reply) continue;

      const createdAt =
        typeof value.createdAt === "string"
          ? Date.parse(value.createdAt)
          : Number.NaN;
      if (!Number.isFinite(createdAt)) continue;
      const week = isoWeekKey(new Date(createdAt));

      if (
        week === periodKey &&
        typeof value.text === "string" &&
        value.text.includes(THREAD_ROOT_MARKER)
      ) {
        return record.uri;
      }
    }

    if (!res.cursor) return null;
    cursor = res.cursor;
  }

  return null;
}

export interface PostThreadOptions {
  /** `createdAt` stamped on every post in the thread. */
  createdAt: string;
  /**
   * Awaited right after the root post lands, before any reply goes out. The
   * caller uses it to record that this week's thread now exists — from that
   * moment the thread is public, so a crash partway through leaves a partial
   * thread rather than letting a later run publish a second one.
   */
  onRoot?: (ref: StrongRef) => Promise<void>;
}

/**
 * Post `specs` as a single reply-chained thread. Returns each post's strongRef
 * in order (first is the thread root). Sequential by necessity: each reply
 * references the previous post's `cid`.
 */
export async function postThread(
  client: Client,
  repo: string,
  specs: Array<PostSpec>,
  options: PostThreadOptions,
): Promise<Array<StrongRef>> {
  const created: Array<StrongRef> = [];
  let root: StrongRef | null = null;
  let parent: StrongRef | null = null;

  for (const spec of specs) {
    const record = buildPostRecord(
      spec,
      options.createdAt,
      root && parent ? { root, parent } : undefined,
    );
    const ref = await createPost(client, repo, record);
    created.push(ref);
    if (!root) {
      root = ref;
      await options.onRoot?.(ref);
    }
    parent = ref;
  }
  return created;
}
