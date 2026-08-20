/**
 * Bluesky posts embedded in an article, hydrated for a book.
 *
 * On the web an embedded post is a live component — it fetches itself. A book
 * has no runtime, so the post has to be *in* the file: author, text, pictures
 * and all. Otherwise a reader on a plane gets a bare `bsky.app` URL where the
 * writer put the thing they were responding to, which is usually the half of
 * the conversation that carries the point.
 *
 * Hydration happens once per book rather than once per chapter: the AppView
 * takes 25 URIs at a time, and an anthology of forty articles quoting posts
 * would otherwise be forty round trips.
 */

import { buildRenderTree } from "@standard-reader/renderer-core";
import type {
  BlockNode,
  StandardSiteDocument,
} from "@standard-reader/renderer-core";

import type { BskyPostView } from "#/server/atproto/bsky-posts";
import { getPosts } from "#/server/atproto/bsky-posts";

/** Every post URI a document embeds, in reading order. */
export function bskyPostUrisInDocument(
  document: StandardSiteDocument,
): Array<string> {
  const tree = buildRenderTree(document);
  if (!tree) return [];

  const uris: Array<string> = [];
  const walk = (nodes: Array<BlockNode>) => {
    for (const node of nodes) {
      if (node.type === "blueskyEmbed") uris.push(node.postUri);
      // Embeds nest: a post quoted inside a callout, a list item, a page embed.
      const children = (node as { children?: Array<BlockNode> }).children;
      if (Array.isArray(children)) walk(children);
    }
  };
  walk(tree.children);
  return uris;
}

/**
 * Hydrate every post a set of documents embeds, keyed by URI.
 *
 * Failures are silent by design — the renderer falls back to the link it drew
 * before, and a book is not worth failing over a post that has been deleted or
 * an AppView that is briefly unreachable.
 */
export async function hydrateBskyPosts(
  uris: Array<string>,
): Promise<Map<string, BskyPostView>> {
  if (uris.length === 0) return new Map();
  try {
    const posts = await getPosts(uris);
    return new Map(posts.map((post) => [post.uri, post]));
  } catch {
    return new Map();
  }
}
