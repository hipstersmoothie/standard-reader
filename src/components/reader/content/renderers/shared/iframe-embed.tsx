"use client";

import { useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";

import { articleBodyStyles } from "../../body-styles";
import { iframeReferrerPolicy, parseDimension } from "./iframe-embed.utils";

const DEFAULT_ASPECT_RATIO = "16 / 9";

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
          height:
            aspectRatioCss == null && fixedHeight != null
              ? `${fixedHeight}px`
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
