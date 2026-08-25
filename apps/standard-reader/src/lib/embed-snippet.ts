import { subscribeCardBorderRadius } from "#/components/reader/subscribe-card.constants";

/**
 * The pieces every embeddable card shares — the publication *subscribe* embed
 * and the author *follow* embed. Only the subject-specific URLs and copy live
 * in `publication-embed.ts` / `author-embed.ts`; the iframe wrapper, the resize
 * protocol and the pasted markup are authored once, here.
 */

/**
 * `postMessage` type an embed page sends so the host page can resize its
 * iframe.
 *
 * The literal still says `subscribe` because the listener ships *inside* the
 * snippet publishers paste on their own sites: every embed already in the wild
 * listens for this exact string, so renaming it would break them all.
 */
export const EMBED_RESIZE_MESSAGE = "standard-reader-subscribe-resize";

/** iframe layouts an embed card offers. */
export type EmbedCardLayout = "landscape" | "portrait";

/** Embed dialog tabs — the iframe layouts, or a plain anchor to style by hand. */
export type EmbedCardTab = EmbedCardLayout | "link";

/** Paints the embed document with the card's own background. */
export function embedPageBackgroundCss(backgroundColor: string): string {
  return `
html, body, #app, #app > *, main {
  background-color: ${backgroundColor} !important;
  min-height: 0 !important;
  height: auto !important;
}
`.trim();
}

/** Escape user content that lands in the pasted snippet's markup. */
export function escapeEmbedHtmlText(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Stable iframe id for an embed card (used in the snippet + resize script).
 * `key` is the subject's rkey or DID, stripped to id-safe characters.
 */
export function embedIframeId(prefix: string, key: string): string {
  const safe = key.replaceAll(/[^a-zA-Z0-9_-]/g, "");
  return `sr-${prefix}-${safe || "embed"}`;
}

/** Inline style for the squircle clip wrapper around the iframe. */
export function embedFrameInlineStyle(backgroundColor: string): string {
  return `border-radius:${subscribeCardBorderRadius};corner-shape:squircle;overflow:hidden;max-width:100%;width:400px;background-color:${backgroundColor}`;
}

/** Host-page script that resizes the iframe from embed `postMessage` events. */
export function buildEmbedResizeScript(iframeId: string): string {
  return `window.addEventListener("message",function(e){if(e.data?.type!=="${EMBED_RESIZE_MESSAGE}"||typeof e.data.height!=="number")return;var f=document.getElementById("${iframeId}");if(f&&e.source===f.contentWindow){f.style.height=Math.ceil(e.data.height)+"px";}});`;
}

/** iframe snippet (wrapper + resize script) to paste on a site. */
export function buildEmbedIframeSnippet({
  src,
  iframeId,
  title,
  height,
  backgroundColor,
}: {
  src: string;
  iframeId: string;
  title: string;
  height: number;
  backgroundColor: string;
}): string {
  const frameStyle = embedFrameInlineStyle(backgroundColor);
  const iframeStyle = "border:0;color-scheme:normal;display:block;width:100%";

  return `<div style="${frameStyle}"><iframe id="${iframeId}" src="${src}" width="400" height="${height}" style="${iframeStyle}" title="${escapeEmbedHtmlText(title)}" loading="lazy"></iframe></div>
<script>
${buildEmbedResizeScript(iframeId)}
</script>`;
}

/** Plain anchor snippet — the site styles the link to match its own design. */
export function buildEmbedAnchorSnippet({
  href,
  label,
}: {
  href: string;
  label: string;
}): string {
  return `<a href="${href}">${escapeEmbedHtmlText(label)}</a>`;
}
