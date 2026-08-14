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
 * Every post is a `putRecord` at a record key derived from the week (see
 * `./week.ts`), which is what stops the weekly job from ever publishing the same
 * thread twice.
 */
import type { Client } from "@atcute/client";
import { ok } from "@atcute/client";

import { utf8ByteLength } from "#/lib/leaflet/utf8";
import { uploadBlob } from "#/server/atproto/repo-records";

import { BSKY_FEED_POST, MAX_THUMB_BYTES } from "./config.ts";

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
 * Write a single post record at a fixed rkey and return its strongRef.
 *
 * `putRecord`, not `createRecord`: paired with the week-derived rkeys from
 * `./week.ts` it makes posting the thread an upsert. Re-running the job
 * overwrites the week's posts in place instead of publishing a second thread —
 * the fresh-TID `createRecord` this replaced is exactly how the job used to
 * duplicate itself.
 */
export async function putPost(
  client: Client,
  repo: string,
  rkey: string,
  record: Record<string, unknown>,
): Promise<StrongRef> {
  const res = await ok(
    client.post("com.atproto.repo.putRecord", {
      input: {
        collection: BSKY_FEED_POST,
        record,
        repo,
        rkey,
      } as never,
    }),
  );
  return { uri: res.uri, cid: res.cid };
}

export interface PostThreadOptions {
  /** Record key per spec, in thread order — see `threadRkeys()`. */
  rkeys: Array<string>;
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
  if (options.rkeys.length < specs.length) {
    throw new Error(
      `postThread needs one rkey per post (${specs.length} specs, ${options.rkeys.length} rkeys)`,
    );
  }

  const created: Array<StrongRef> = [];
  let root: StrongRef | null = null;
  let parent: StrongRef | null = null;

  for (const [i, spec] of specs.entries()) {
    const record = buildPostRecord(
      spec,
      options.createdAt,
      root && parent ? { root, parent } : undefined,
    );
    const ref = await putPost(client, repo, options.rkeys[i], record);
    created.push(ref);
    if (!root) {
      root = ref;
      await options.onRoot?.(ref);
    }
    parent = ref;
  }
  return created;
}
