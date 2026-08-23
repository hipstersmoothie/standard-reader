import type { EmbedCardLayout, EmbedCardTab } from "#/lib/embed-snippet";
import {
  buildEmbedAnchorSnippet,
  buildEmbedIframeSnippet,
  embedIframeId,
} from "#/lib/embed-snippet";
import { getPublicUrlClient } from "#/lib/public-url";
import type { QuoteOgColors } from "#/lib/publication-theme";
import { resolveQuoteOgColors } from "#/lib/publication-theme";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";

/**
 * The author counterpart to `publication-embed.ts`: a follow button an author
 * can drop on their own site, plus the plain link behind it.
 *
 * Unlike a publication, an account has no theme record of its own — there is no
 * `basicTheme` on a profile — so the card always paints in Standard Reader's
 * default editorial palette.
 */

export type FollowEmbedLayout = EmbedCardLayout;
export type FollowEmbedTab = EmbedCardTab;

/** Identity the snippet builders need. A subset of `AuthorEmbedMeta`. */
export interface FollowEmbedSubject {
  displayName?: string | null;
  handle?: string | null;
  description?: string | null;
}

/**
 * Palette for the author embed. `resolveQuoteOgColors` with no theme input
 * resolves to Standard Reader's default editorial palette, which is exactly
 * what an account without a theme record should get.
 */
export function followEmbedColors(): QuoteOgColors {
  return resolveQuoteOgColors({
    themeBackground: null,
    themeForeground: null,
    themeAccent: null,
    themeAccentForeground: null,
  });
}

/** Card fill for the author embed — the default palette, with no theme record. */
export function followEmbedBackgroundColor(): string {
  return followEmbedColors().background;
}

/** What the card and every "Follow X" string call this account. */
export function followSubjectName(subject: FollowEmbedSubject): string {
  return subject.displayName?.trim() || subject.handle?.trim() || "this author";
}

/** Stable iframe id for an author embed (used in the snippet + resize script). */
export function followEmbedIframeId(did: string): string {
  return embedIframeId("follow", did);
}

/**
 * Fallback iframe height before the live resize message arrives. Mirrors
 * `estimateSubscribeEmbedHeight`, minus the publication's topic kicker: an
 * account's kicker is its handle, which is always there when we have one.
 */
export function estimateFollowEmbedHeight(
  subject: FollowEmbedSubject,
  layout: FollowEmbedLayout = "landscape",
): number {
  const name = followSubjectName(subject);
  const hasHandle = Boolean(subject.handle?.trim());

  if (layout === "portrait") {
    let height = 248;
    if (hasHandle) {
      height += 20;
    }
    if (subject.description?.trim()) {
      height += 36;
    }
    if (name.length > 24) {
      height += 24;
    }
    if (name.length > 48) {
      height += 24;
    }
    return height;
  }

  let height = 116;
  if (hasHandle) {
    height += 18;
  }
  if (name.length > 28) {
    height += 20;
  }
  if (name.length > 52) {
    height += 20;
  }
  return height;
}

/** Embed iframe `src` for landscape or portrait. */
export function followEmbedUrl({
  did,
  layout = "landscape",
  baseUrl = getPublicUrlClient(),
}: {
  did: string;
  layout?: FollowEmbedLayout;
  baseUrl?: string;
}): string {
  const origin = baseUrl.replace(/\/$/, "");
  const path = `${origin}/embed/follow/${did}`;
  return layout === "portrait" ? `${path}?layout=portrait` : path;
}

/** Post-login destination: auto-follow then success screen. */
export function followPageUrl({
  did,
  baseUrl = getPublicUrlClient(),
}: {
  did: string;
  baseUrl?: string;
}): string {
  return `${baseUrl.replace(/\/$/, "")}/follow/${did}`;
}

/**
 * Themed follow-login page (`/follow-login/$did`). Renders the author-branded
 * login card — no Standard Reader chrome, no saved handles, just the author's
 * avatar + "Follow NAME".
 */
export function followLoginPageUrl({
  did,
  baseUrl = getPublicUrlClient(),
}: {
  did: string;
  baseUrl?: string;
}): string {
  return `${baseUrl.replace(/\/$/, "")}/follow-login/${did}`;
}

/** Opens Bluesky login with follow scope; returns to {@link followPageUrl}. */
export function followLoginUrl({
  did,
  baseUrl = getPublicUrlClient(),
}: {
  did: string;
  baseUrl?: string;
}): string {
  const origin = baseUrl.replace(/\/$/, "");
  const params = new URLSearchParams({
    redirect: buildAuthRedirectPath(`/follow/${did}`),
    intent: "follow",
  });
  return `${origin}/login?${params}`;
}

/** iframe snippet an author can paste on their site. */
export function buildFollowEmbedSnippet({
  did,
  displayName = null,
  handle = null,
  description = null,
  layout = "landscape",
  baseUrl = getPublicUrlClient(),
}: {
  did: string;
  displayName?: string | null;
  handle?: string | null;
  description?: string | null;
  layout?: FollowEmbedLayout;
  baseUrl?: string;
}): string {
  const subject = { displayName, handle, description };
  return buildEmbedIframeSnippet({
    src: followEmbedUrl({ did, layout, baseUrl }),
    iframeId: followEmbedIframeId(did),
    title: `Follow ${followSubjectName(subject)}`,
    height: estimateFollowEmbedHeight(subject, layout),
    backgroundColor: followEmbedBackgroundColor(),
  });
}

/** Plain anchor snippet — authors style the link to match their site. */
export function buildFollowAnchorSnippet({
  did,
  displayName = null,
  handle = null,
  baseUrl = getPublicUrlClient(),
}: {
  did: string;
  displayName?: string | null;
  handle?: string | null;
  baseUrl?: string;
}): string {
  return buildEmbedAnchorSnippet({
    href: followPageUrl({ did, baseUrl }),
    label: `Follow ${followSubjectName({ displayName, handle })}`,
  });
}
