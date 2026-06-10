import { subscribeCardBorderRadius } from "#/components/reader/subscribe-card.stylex";
import { getPublicUrlClient } from "#/lib/public-url";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";

/** `postMessage` type the embed page sends so the host page can resize its iframe. */
export const SUBSCRIBE_EMBED_RESIZE_MESSAGE =
  "standard-reader-subscribe-resize";

/**
 * Forces iframe chrome transparent (beats StyleX / theme body backgrounds).
 * Injected in the embed route head script, route head, and client render — same
 * pattern as graze-social/ui feeds embed.
 */
export const SUBSCRIBE_EMBED_TRANSPARENT_CSS = `
html, body, #app, #app > *, main {
  background: transparent !important;
  background-color: transparent !important;
  min-height: 0 !important;
  height: auto !important;
}
`.trim();

export type SubscribeEmbedLayout = "landscape" | "portrait";

/** Embed dialog tabs — iframe layouts or a plain anchor for custom styling. */
export type SubscribeEmbedTab = SubscribeEmbedLayout | "link";

function escapeHtmlText(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Stable iframe id for a publication embed (used in the snippet + resize script). */
export function subscribeEmbedIframeId(rkey: string): string {
  const safe = rkey.replaceAll(/[^a-zA-Z0-9_-]/g, "");
  return `sr-subscribe-${safe || "embed"}`;
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
export function subscribeEmbedFrameInlineStyle(): string {
  return `border-radius:${subscribeCardBorderRadius};corner-shape:squircle;overflow:hidden;max-width:100%;width:400px`;
}

/** Host-page script that resizes the iframe from embed `postMessage` events. */
export function buildSubscribeEmbedResizeScript(iframeId: string): string {
  return `window.addEventListener("message",function(e){if(e.data?.type!=="${SUBSCRIBE_EMBED_RESIZE_MESSAGE}"||typeof e.data.height!=="number")return;var f=document.getElementById("${iframeId}");if(f&&e.source===f.contentWindow){f.style.height=Math.ceil(e.data.height)+"px";}});`;
}

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
  baseUrl?: string;
}): string {
  const src = subscribeEmbedUrl({ did, rkey, layout, baseUrl });
  const title = `Subscribe to ${name}`;
  const iframeId = subscribeEmbedIframeId(rkey);
  const height = estimateSubscribeEmbedHeight(
    {
      name,
      topic,
      ownerDisplayName,
      ownerHandle,
      description,
    },
    layout,
  );

  const frameStyle = subscribeEmbedFrameInlineStyle();
  const iframeStyle = "border:0;color-scheme:normal;display:block;width:100%";

  return `<div style="${frameStyle}"><iframe id="${iframeId}" src="${src}" width="400" height="${height}" style="${iframeStyle}" title="${title}" loading="lazy"></iframe></div>
<script>
${buildSubscribeEmbedResizeScript(iframeId)}
</script>`;
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
  const href = subscribePageUrl({ did, rkey, baseUrl });
  const label = escapeHtmlText(`Subscribe to ${name}`);
  return `<a href="${href}">${label}</a>`;
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
