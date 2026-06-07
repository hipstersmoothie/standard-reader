"use client";

import * as stylex from "@stylexjs/stylex";
import { bskyPostApiUrl, parseBskyPostRef } from "#/lib/leaflet/bsky";
import "bsky-react-post/theme.css";
import { useTheme } from "#/lib/use-theme";
import { Post, PostSkeleton } from "bsky-react-post";

import { articleBodyStyles } from "../../body-styles";

export function BskyPostEmbedView({
  postUri,
}: {
  postUri: string | undefined;
}) {
  const { resolvedScheme } = useTheme();
  if (!postUri) return null;

  const ref = parseBskyPostRef(postUri);
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
