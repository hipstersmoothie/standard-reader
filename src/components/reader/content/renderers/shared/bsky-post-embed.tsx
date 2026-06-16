"use client";

import * as stylex from "@stylexjs/stylex";
import { bskyPostApiUrl, parseBskyPostRef } from "#/lib/leaflet/bsky";
import { MagazineColorContext } from "#/magazine/context";
import "bsky-react-post/theme.css";
import { useTheme } from "#/lib/use-theme";
import { Post, PostSkeleton } from "bsky-react-post";
import { use } from "react";

import { articleBodyStyles } from "../../body-styles";

export function BskyPostEmbedView({
  postUri,
}: {
  postUri: string | undefined;
}) {
  const magazine = use(MagazineColorContext);
  const { resolvedScheme } = useTheme();
  const colorScheme = magazine
    ? magazine.dark
      ? "dark"
      : "light"
    : resolvedScheme;
  if (!postUri) return null;

  const ref = parseBskyPostRef(postUri);
  if (!ref) return null;

  return (
    <div
      {...stylex.props(articleBodyStyles.bskyPostEmbed)}
      data-bsky-post-embed
      data-theme={colorScheme}
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
