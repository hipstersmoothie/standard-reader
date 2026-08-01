import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { parseBskyClientUrl } from "#/lib/atproto/bsky-clients";
import type { BskyEntityCard } from "#/server/atproto/bsky-entities";
import { getBskyEntityCard } from "#/server/atproto/bsky-entities";
import { getPosts } from "#/server/atproto/bsky-posts";

const getEmbedPostsInput = z.object({
  uris: z.array(z.string().min(1)).min(1).max(25),
});

/** Narration-ready author + text for embedded Bluesky posts (public AppView). */
export interface BskyEmbedPost {
  uri: string;
  author: string | null;
  text: string;
}

const getEmbedPosts = createServerFn({ method: "GET" })
  .validator(getEmbedPostsInput)
  .handler(async ({ data }): Promise<Array<BskyEmbedPost>> => {
    const posts = await getPosts(data.uris);
    return posts.map((post) => ({
      uri: post.uri,
      author: post.author.displayName ?? post.author.handle,
      text: post.text,
    }));
  });

const getEntityCardInput = z.object({
  /** A `bsky.app` (or fork) URL — parsed server-side. */
  url: z.string().min(1).max(2048),
});

/**
 * Hydrate the AT Protocol record behind a Bluesky web client link so it can
 * render as a native embed. Returns null when the URL is not a record link or
 * the record can't be resolved — the caller falls back to a plain link card.
 */
const getEntityCard = createServerFn({ method: "GET" })
  .validator(getEntityCardInput)
  .handler(async ({ data }): Promise<BskyEntityCard | null> => {
    const ref = parseBskyClientUrl(data.url);
    return ref ? getBskyEntityCard(ref) : null;
  });

function getEntityCardQueryOptions(url: string) {
  return queryOptions({
    queryKey: ["bsky", "entity", url] as const,
    queryFn: async () => getEntityCard({ data: { url } }),
    staleTime: 300_000,
  });
}

export const bskyApi = {
  getEmbedPosts,
  getEntityCard,
  getEntityCardQueryOptions,
};
