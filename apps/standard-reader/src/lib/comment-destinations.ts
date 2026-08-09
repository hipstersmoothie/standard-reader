/**
 * Where a reader can go to comment on an article.
 *
 * Standard Reader stores no comments of its own — the Discussion section is
 * assembled from records that live in other people's repos (see
 * `#/server/reader/document-comments`). So "add a comment" is not a compose box
 * here, it's a well-chosen link out to the place whose records we already read
 * back:
 *
 *   - **Bluesky and its clients.** When the document carries a `bskyPostRef`,
 *     that post is the article's discussion thread and the destination is the
 *     post itself, ready to reply to — and *which* clients can open it comes
 *     from the `@aturi.to/waypoints` catalog, so a new client in that catalog
 *     appears here without a code change. Without a post ref there is nothing
 *     to reply to, so the destination is a fresh post pre-filled with the
 *     author's handle and the article's Standard Reader URL — which is one of
 *     the exact link targets Discussion resolves backlinks against, so the post
 *     comes back to this page once Constellation indexes it. Only clients that
 *     implement `/intent/compose` can take a pre-filled draft, so that list is
 *     narrower than the list that can open a post.
 *   - **The publishing platform**, for the two that host comments on the
 *     article itself: Leaflet (comment drawer) and pckt (notes). Offprint has
 *     no comment surface, so it's absent here even though it's a platform we
 *     otherwise attribute.
 */

import { resolveAtUri } from "@aturi.to/waypoints";

import type { BskyClient } from "#/lib/bsky-clients";
import {
  BSKY_CLIENTS_OFF_CATALOG,
  BSKY_COMPOSE_CLIENTS,
  bskyClientById,
} from "#/lib/bsky-clients";
import { bskyPostUrl, parseBskyPostRef } from "#/lib/leaflet/bsky";
import { leafletCommentDrawerUrl } from "#/lib/leaflet/comment";
import type { PublishingPlatform } from "#/lib/publishing-platform";
import { buildAtprotoComposeUrlWithLead } from "#/lib/quote-share";

/** One row in the dialog: a client and the URL that opens it. */
export interface CommentDestination {
  id: string;
  label: string;
  iconUrl: string | null;
  url: string;
}

/**
 * `"reply"` when the article has a Bluesky post to reply under, `"post"` when
 * the reader has to start the thread themselves.
 */
export type BskyCommentMode = "reply" | "post";

export function bskyCommentMode(
  bskyPostUri: string | null | undefined,
): BskyCommentMode {
  return bskyPostUri && parseBskyPostRef(bskyPostUri) ? "reply" : "post";
}

/**
 * Waypoint categories that are microblog clients — the only ones where "open
 * this post" means "somewhere you can reply". The catalog's other categories
 * are publications, record viewers, and dev tools.
 */
const BSKY_CLIENT_CATEGORIES = new Set(["blueskyClients", "blueskyForks"]);

function toDestination(client: BskyClient, url: string): CommentDestination {
  return {
    id: client.id,
    label: client.label,
    iconUrl: client.iconUrl,
    url,
  };
}

/**
 * Every client that can open the article's post, ordered with the ones we know
 * first (catalog order) and anything new from the waypoints catalog after.
 */
function replyDestinations(bskyPostUri: string): Array<CommentDestination> {
  const resolved = resolveAtUri(bskyPostUri);
  const byId = new Map<string, CommentDestination>();

  for (const waypoint of resolved?.waypoints ?? []) {
    if (!BSKY_CLIENT_CATEGORIES.has(waypoint.category)) continue;
    const known = bskyClientById(waypoint.id);
    byId.set(waypoint.id, {
      id: waypoint.id,
      // Prefer our own label (hostnames, matching the share menu) and fall back
      // to the catalog's display name for clients we don't know yet.
      label: known?.label ?? waypoint.name,
      iconUrl: known?.iconUrl ?? null,
      url: waypoint.url,
    });
  }

  // Clients the catalog hasn't picked up yet still speak the official app's
  // permalink shape, so they're appended by hand.
  for (const client of BSKY_CLIENTS_OFF_CATALOG) {
    if (byId.has(client.id)) continue;
    const url = bskyPostUrl(bskyPostUri, client.origin);
    if (url) byId.set(client.id, toDestination(client, url));
  }

  // Our catalog's order first (Bluesky leads), then anything else the waypoints
  // catalog turned up.
  const ordered: Array<CommentDestination> = [];
  for (const client of [...BSKY_COMPOSE_CLIENTS, ...BSKY_CLIENTS_OFF_CATALOG]) {
    const found = byId.get(client.id);
    if (found) {
      ordered.push(found);
      byId.delete(client.id);
    }
  }
  return [...ordered, ...byId.values()];
}

export interface BskyCommentTarget {
  /** The article's `bskyPostRef`, when it has one. */
  bskyPostUri: string | null;
  /** Byline author's handle, mentioned in the draft when there's no post. */
  authorHandle: string | null;
  /** Absolute Standard Reader URL for this article. */
  readerUrl: string | null;
}

/**
 * Every Bluesky destination for this article: the post itself across every
 * client that can render it (reply mode), or a pre-filled composer in each
 * client that accepts one (post mode).
 */
export function bskyCommentDestinations({
  bskyPostUri,
  authorHandle,
  readerUrl,
}: BskyCommentTarget): Array<CommentDestination> {
  if (bskyPostUri && parseBskyPostRef(bskyPostUri)) {
    return replyDestinations(bskyPostUri);
  }
  if (!readerUrl) return [];

  const lead = authorHandle ? `@${authorHandle}` : "";
  return BSKY_COMPOSE_CLIENTS.map((client) =>
    toDestination(
      client,
      buildAtprotoComposeUrlWithLead(client.origin, lead, readerUrl),
    ),
  );
}

/**
 * Platforms that host comments on the article page itself. Offprint is
 * deliberately absent — it publishes to AT Protocol but has no comment surface
 * for us to send a reader to.
 */
export const COMMENT_PLATFORMS: ReadonlyArray<PublishingPlatform> = [
  "leaflet",
  "pckt",
];

export function platformSupportsComments(
  platform: PublishingPlatform | null,
): boolean {
  return platform != null && COMMENT_PLATFORMS.includes(platform);
}

/**
 * The article on its own platform, with that platform's comment affordance
 * open where it's addressable (Leaflet's `interactionDrawer`). Null when the
 * platform hosts no comments or we have no URL for the original.
 */
export function platformCommentUrl(
  platform: PublishingPlatform | null,
  document: { canonicalUrl: string | null; contentFormat: string | null },
): string | null {
  if (!platform || !document.canonicalUrl) return null;
  // The same drawer link the Discussion list gives Leaflet comments, so both
  // point at one place — and it does its own Leaflet check, custom domains
  // included.
  if (platform === "leaflet") return leafletCommentDrawerUrl(document);
  // pckt's notes are composed from the post page — no drawer to deep-link.
  if (platform === "pckt") return document.canonicalUrl;
  return null;
}
