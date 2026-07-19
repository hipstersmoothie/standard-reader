"use client";

import { useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";

import {
  articleBodyStyles,
  IFRAME_FRAME_BORDER_WIDTH,
} from "../../body-styles";

const DEFAULT_ASPECT_RATIO = "16 / 9";

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

function parseDimension(
  value: string | number | undefined,
): number | undefined {
  if (typeof value === "number" && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
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

  const ratioWidth = parseDimension(aspectRatio?.width);
  const ratioHeight = parseDimension(aspectRatio?.height);
  const hasRatio = ratioWidth != null && ratioHeight != null;
  const fixedHeight = parseDimension(height);

  // A declared aspect ratio means the embed should scale with the fluid
  // column width (e.g. a 16:9 video); a bare height with no ratio means the
  // embed has its own fixed pixel height regardless of width (e.g. an audio
  // player widget), so only fall back to a fixed height when no ratio is
  // available.
  const aspectRatioCss = hasRatio
    ? `${ratioWidth} / ${ratioHeight}`
    : fixedHeight == null
      ? DEFAULT_ASPECT_RATIO
      : undefined;

  return (
    <figure {...stylex.props(articleBodyStyles.iframeFigure)}>
      <div
        {...stylex.props(articleBodyStyles.iframeFrame)}
        style={{
          aspectRatio: aspectRatioCss,
          // The frame is `border-box`, so grow it by the border so the iframe
          // itself gets exactly the height the embed asked for.
          height:
            aspectRatioCss == null && fixedHeight != null
              ? `${fixedHeight + IFRAME_FRAME_BORDER_WIDTH * 2}px`
              : undefined,
        }}
      >
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
      </div>
    </figure>
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
  const embedWidth = parseDimension(width ?? undefined);
  const embedHeight = parseDimension(height ?? undefined);

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
