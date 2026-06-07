"use client";

import type { LeafletBskyPostBlock } from "#/lib/leaflet/types";

import * as stylex from "@stylexjs/stylex";
import { Post, PostSkeleton } from "bsky-react-post";
import "bsky-react-post/theme.css";
import { bskyPostApiUrl, parseBskyPostRef } from "#/lib/leaflet/bsky";
import { useTheme } from "#/lib/use-theme";

import { articleBodyStyles } from "../body-styles";

export function LeafletBskyPostBlockView({
  block,
}: {
  block: LeafletBskyPostBlock;
}) {
  const { resolvedScheme } = useTheme();
  const uri = block.postRef?.uri;
  if (!uri) return null;

  const ref = parseBskyPostRef(uri);
  if (!ref) return null;

  return (
    <div
      {...stylex.props(articleBodyStyles.bskyPostEmbed)}
      data-theme={resolvedScheme}
    >
      <Post
        did={ref.did}
        id={ref.id}
        apiUrl={bskyPostApiUrl(ref.did, ref.id)}
        fallback={<PostSkeleton />}
        components={{ PostNotFound: () => <></> }}
      />
    </div>
  );
}
