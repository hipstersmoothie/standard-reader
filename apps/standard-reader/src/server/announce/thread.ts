/**
 * Build and post the weekly "hottest articles" thread as `app.bsky.feed.post`
 * records: each article gets a rich `app.bsky.embed.external` link card back to
 * Standard Reader, replies are chained root→parent, and the final CTA post
 * carries a link facet to the app.
 *
 * Posts are created SEQUENTIALLY: every reply references the previous post's
 * `cid`, which is only known after that post is written — so `applyWrites`
 * (which needs all refs up front) can't be used here.
 */
import type { Client } from "@atcute/client";
import { ok } from "@atcute/client";
import { now as tidNow } from "@atcute/tid";

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

/** Assemble one `app.bsky.feed.post` record (optionally as a reply). */
export function buildPostRecord(
  spec: PostSpec,
  reply?: { root: StrongRef; parent: StrongRef },
): Record<string, unknown> {
  const record: Record<string, unknown> = {
    $type: BSKY_FEED_POST,
    text: spec.text,
    createdAt: new Date().toISOString(),
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

/** Create a single post record and return its strongRef. */
export async function createPost(
  client: Client,
  repo: string,
  record: Record<string, unknown>,
): Promise<StrongRef> {
  const res = await ok(
    client.post("com.atproto.repo.createRecord", {
      input: {
        repo,
        collection: BSKY_FEED_POST,
        rkey: tidNow(),
        record,
      } as never,
    }),
  );
  return { uri: res.uri, cid: res.cid };
}

/**
 * Post `specs` as a single reply-chained thread. Returns each created post's
 * strongRef in order (first is the thread root). Sequential by necessity.
 */
export async function postThread(
  client: Client,
  repo: string,
  specs: Array<PostSpec>,
): Promise<Array<StrongRef>> {
  const created: Array<StrongRef> = [];
  let root: StrongRef | null = null;
  let parent: StrongRef | null = null;

  for (const spec of specs) {
    const record = buildPostRecord(
      spec,
      root && parent ? { root, parent } : undefined,
    );
    const ref = await createPost(client, repo, record);
    created.push(ref);
    if (!root) root = ref;
    parent = ref;
  }
  return created;
}
