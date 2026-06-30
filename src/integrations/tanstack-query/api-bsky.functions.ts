import { createServerFn } from "@tanstack/react-start";
import { getPosts } from "#/server/atproto/bsky-posts";
import { z } from "zod";

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

export const bskyApi = {
  getEmbedPosts,
};
