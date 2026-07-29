"use client";

import * as stylex from "@stylexjs/stylex";
import { Post, PostSkeleton } from "bsky-react-post";
import type { ReactNode } from "react";
import { use } from "react";

import "bsky-react-post/theme.css";
import { bskyPostApiUrl, parseBskyPostRef } from "#/lib/leaflet/bsky";
import { useTheme } from "#/lib/use-theme";
import { MagazineColorContext } from "#/magazine/context";

import { articleBodyStyles } from "../../body-styles";

export function BskyPostEmbedView({
  postUri,
}: {
  postUri: string | undefined;
}) {
  const ref = postUri ? parseBskyPostRef(postUri) : null;
  return <BskyPostView ident={ref?.did} rkey={ref?.id} />;
}

/**
 * An embedded Bluesky post addressed by repo + record key. `ident` is a DID or
 * a handle — a link from a web client (`bsky.app/profile/<handle>/post/<rkey>`
 * and its forks) can carry either. `notFound` stands in when the post can't be
 * fetched (deleted, blocked); it defaults to nothing, matching how an author's
 * explicit post block behaves when its target disappears.
 */
export function BskyPostView({
  ident,
  rkey,
  notFound = null,
}: {
  ident: string | undefined;
  rkey: string | undefined;
  notFound?: ReactNode;
}) {
  const magazine = use(MagazineColorContext);
  const { resolvedScheme } = useTheme();
  const colorScheme = magazine
    ? magazine.dark
      ? "dark"
      : "light"
    : resolvedScheme;
  if (!ident || !rkey) return null;

  return (
    <div
      {...stylex.props(articleBodyStyles.bskyPostEmbed)}
      data-bsky-post-embed
      data-magazine-bsky={magazine ? "" : undefined}
      data-theme={colorScheme}
    >
      <Post
        {...(ident.startsWith("did:") ? { did: ident } : { handle: ident })}
        id={rkey}
        apiUrl={bskyPostApiUrl(ident, rkey)}
        fallback={<PostSkeleton />}
        components={{ PostNotFound: () => <>{notFound}</> }}
      />
    </div>
  );
}
