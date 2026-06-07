"use client";

import * as stylex from "@stylexjs/stylex";

import { articleBodyStyles } from "../../body-styles";

const DEFAULT_ASPECT_RATIO = "16 / 9";

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
  if (!url.trim()) return null;

  const ratioWidth = parseDimension(aspectRatio?.width);
  const ratioHeight = parseDimension(aspectRatio?.height);
  const hasRatio = ratioWidth != null && ratioHeight != null;
  const fixedHeight = parseDimension(height);

  const aspectRatioCss =
    fixedHeight == null
      ? hasRatio
        ? `${ratioWidth} / ${ratioHeight}`
        : DEFAULT_ASPECT_RATIO
      : undefined;

  return (
    <figure {...stylex.props(articleBodyStyles.iframeFigure)}>
      <div
        {...stylex.props(articleBodyStyles.iframeFrame)}
        style={{
          aspectRatio: aspectRatioCss,
          height: fixedHeight == null ? undefined : `${fixedHeight}px`,
        }}
      >
        <iframe
          src={url}
          title="Embedded content"
          loading="lazy"
          referrerPolicy="no-referrer"
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
