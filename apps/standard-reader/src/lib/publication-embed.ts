import type { EmbedCardLayout, EmbedCardTab } from "#/lib/embed-snippet";
import {
  EMBED_RESIZE_MESSAGE,
  buildEmbedAnchorSnippet,
  buildEmbedIframeSnippet,
  buildEmbedResizeScript,
  embedFrameInlineStyle,
  embedIframeId,
  embedPageBackgroundCss,
} from "#/lib/embed-snippet";
import { getPublicUrlClient } from "#/lib/public-url";
import type { PublicationThemeInput } from "#/lib/publication-theme";
import { resolveQuoteOgColors } from "#/lib/publication-theme";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";

/** `postMessage` type the embed page sends so the host page can resize its iframe. */
export const SUBSCRIBE_EMBED_RESIZE_MESSAGE = EMBED_RESIZE_MESSAGE;

/** Publication brand background — same value as the subscribe card fill. */
export function subscribeEmbedBackgroundColor(
  theme: PublicationThemeInput,
): string {
  return resolveQuoteOgColors(theme).background;
}

/** Paints the embed document with the publication brand background. */
export const subscribeEmbedPageBackgroundCss = embedPageBackgroundCss;

export type SubscribeEmbedLayout = EmbedCardLayout;

/** Embed dialog tabs — iframe layouts or a plain anchor for custom styling. */
export type SubscribeEmbedTab = EmbedCardTab;

/** Stable iframe id for a publication embed (used in the snippet + resize script). */
export function subscribeEmbedIframeId(rkey: string): string {
  return embedIframeId("subscribe", rkey);
}

/**
 * Fallback iframe height before the live resize message arrives. Tuned for the
 * compact card at 400px width — long names and topic kickers need more room.
 */
export function estimateSubscribeEmbedHeight(
  meta: {
    name: string;
    topic?: string | null;
    ownerDisplayName?: string | null;
    ownerHandle?: string | null;
    description?: string | null;
  },
  layout: SubscribeEmbedLayout = "landscape",
): number {
  if (layout === "portrait") {
    let height = 248;
    if (meta.topic?.trim()) {
      height += 20;
    }
    if (meta.ownerDisplayName?.trim() || meta.ownerHandle?.trim()) {
      height += 18;
    }
    if (meta.description?.trim()) {
      height += 36;
    }
    const nameLength = meta.name.trim().length;
    if (nameLength > 24) {
      height += 24;
    }
    if (nameLength > 48) {
      height += 24;
    }
    return height;
  }

  let height = 116;
  if (meta.topic?.trim()) {
    height += 18;
  }
  if (meta.ownerDisplayName?.trim() || meta.ownerHandle?.trim()) {
    height += 16;
  }
  const nameLength = meta.name.trim().length;
  if (nameLength > 28) {
    height += 20;
  }
  if (nameLength > 52) {
    height += 20;
  }
  return height;
}

/** Embed iframe `src` for landscape or portrait. */
export function subscribeEmbedUrl({
  did,
  rkey,
  layout = "landscape",
  baseUrl = getPublicUrlClient(),
}: {
  did: string;
  rkey: string;
  layout?: SubscribeEmbedLayout;
  baseUrl?: string;
}): string {
  const origin = baseUrl.replace(/\/$/, "");
  const path = `${origin}/embed/subscribe/${did}/${rkey}`;
  return layout === "portrait" ? `${path}?layout=portrait` : path;
}

/** Inline style for the squircle clip wrapper around the iframe. */
export const subscribeEmbedFrameInlineStyle = embedFrameInlineStyle;

/** Host-page script that resizes the iframe from embed `postMessage` events. */
export const buildSubscribeEmbedResizeScript = buildEmbedResizeScript;

/** iframe snippet publishers can paste on their site. */
export function buildSubscribeEmbedSnippet({
  did,
  rkey,
  name,
  topic = null,
  ownerDisplayName = null,
  ownerHandle = null,
  description = null,
  layout = "landscape",
  themeBackground = null,
  themeForeground = null,
  themeAccent = null,
  themeAccentForeground = null,
  baseUrl = getPublicUrlClient(),
}: {
  did: string;
  rkey: string;
  name: string;
  topic?: string | null;
  ownerDisplayName?: string | null;
  ownerHandle?: string | null;
  description?: string | null;
  layout?: SubscribeEmbedLayout;
  themeBackground?: string | null;
  themeForeground?: string | null;
  themeAccent?: string | null;
  themeAccentForeground?: string | null;
  baseUrl?: string;
}): string {
  return buildEmbedIframeSnippet({
    src: subscribeEmbedUrl({ did, rkey, layout, baseUrl }),
    iframeId: subscribeEmbedIframeId(rkey),
    title: `Subscribe to ${name}`,
    height: estimateSubscribeEmbedHeight(
      {
        name,
        topic,
        ownerDisplayName,
        ownerHandle,
        description,
      },
      layout,
    ),
    backgroundColor: subscribeEmbedBackgroundColor({
      themeBackground,
      themeForeground,
      themeAccent,
      themeAccentForeground,
    }),
  });
}

/** Plain anchor snippet — publishers style the link to match their site. */
export function buildSubscribeAnchorSnippet({
  did,
  rkey,
  name,
  baseUrl = getPublicUrlClient(),
}: {
  did: string;
  rkey: string;
  name: string;
  baseUrl?: string;
}): string {
  return buildEmbedAnchorSnippet({
    href: subscribePageUrl({ did, rkey, baseUrl }),
    label: `Subscribe to ${name}`,
  });
}

/** Post-login destination: auto-follow then success screen. */
export function subscribePageUrl({
  did,
  rkey,
  baseUrl = getPublicUrlClient(),
}: {
  did: string;
  rkey: string;
  baseUrl?: string;
}): string {
  return `${baseUrl.replace(/\/$/, "")}/subscribe/${did}/${rkey}`;
}

/** Opens Bluesky login with subscribe scope; returns to {@link subscribePageUrl}. */
export function subscribeLoginUrl({
  did,
  rkey,
  baseUrl = getPublicUrlClient(),
}: {
  did: string;
  rkey: string;
  baseUrl?: string;
}): string {
  const origin = baseUrl.replace(/\/$/, "");
  const params = new URLSearchParams({
    redirect: buildAuthRedirectPath(`/subscribe/${did}/${rkey}`),
    intent: "subscribe",
  });
  return `${origin}/login?${params}`;
}

/**
 * Themed subscribe-login page (`/subscribe-login/$did/$rkey`). Renders the
 * publication-branded login card — no Standard Reader chrome, no saved handles,
 * just the publication theme + "Subscribe to NAME".
 */
export function subscribeLoginPageUrl({
  did,
  rkey,
  baseUrl = getPublicUrlClient(),
}: {
  did: string;
  rkey: string;
  baseUrl?: string;
}): string {
  const origin = baseUrl.replace(/\/$/, "");
  return `${origin}/subscribe-login/${did}/${rkey}`;
}
