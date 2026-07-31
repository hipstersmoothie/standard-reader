"use client";

import { useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";

import { articleBodyStyles } from "../../body-styles";
import { EmbedFrame } from "./embed-frame";
import { parsePixelDimension } from "./iframe-dimensions";

/** YouTube (and some other players) reject embeds without a cross-origin Referer. */
function iframeReferrerPolicy(url: string): React.HTMLAttributeReferrerPolicy {
  const normalized = url.toLowerCase();
  const needsReferrer =
    normalized.includes("youtube.com") ||
    normalized.includes("youtube-nocookie.com") ||
    normalized.includes("youtu.be") ||
    normalized.includes("player.vimeo.com") ||
    normalized.includes("vimeo.com") ||
    normalized.includes("fast.wistia.com") ||
    normalized.includes("wistia.com") ||
    normalized.includes("wistia.net");

  return needsReferrer ? "strict-origin-when-cross-origin" : "no-referrer";
}

export function IframeEmbedView({
  url,
  height,
  aspectRatio,
}: {
  url: string;
  height?: number;
  aspectRatio?: { width?: number; height?: number };
}) {
  const { t } = useLingui();

  if (!url.trim()) return null;

  return (
    <EmbedFrame height={height} aspectRatio={aspectRatio}>
      {/* oxlint-disable-next-line iframe-has-title */}
      <iframe
        src={url}
        title={t`Embedded content`}
        loading="lazy"
        referrerPolicy={iframeReferrerPolicy(url)}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        {...stylex.props(articleBodyStyles.iframeEmbed)}
      />
    </EmbedFrame>
  );
}

/** Map markdown/HTML iframe attributes to `IframeEmbedView`. */
export function MarkdownIframeEmbed({
  src,
  width,
  height,
}: {
  src?: string | null;
  width?: string | number | null;
  height?: string | number | null;
}) {
  // Only a pixel width pairs with the height to form a real aspect ratio.
  // `width="100%"` is a fluid-width hint, not a ratio numerator — treating it
  // as one renders e.g. `width="100%" height="200"` at 2x the column width.
  const embedWidth = parsePixelDimension(width);
  const embedHeight = parsePixelDimension(height);

  return (
    <IframeEmbedView
      url={src ?? ""}
      height={embedHeight}
      aspectRatio={
        embedWidth != null && embedHeight != null
          ? { width: embedWidth, height: embedHeight }
          : undefined
      }
    />
  );
}
