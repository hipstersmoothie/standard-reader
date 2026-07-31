"use client";

import { useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";

import { articleBodyStyles } from "../../body-styles";
import { EmbedFrame } from "./embed-frame";

/**
 * An author-supplied HTML document (Leaflet's `pub.leaflet.blocks.html`).
 *
 * The markup is handed to the iframe's `srcdoc` rather than injected into the
 * reading page, which is what the lexicon specifies and the only way arbitrary
 * author markup can be shown at all. The sandbox deliberately grants **only**
 * `allow-scripts`: adding `allow-same-origin` to a `srcdoc` frame would run the
 * document in the reader's own origin, handing it our DOM, storage and session.
 */
export function HtmlEmbedView({
  html,
  height,
  aspectRatio,
}: {
  html: string;
  height?: number;
  aspectRatio?: { width?: number; height?: number };
}) {
  const { t } = useLingui();

  if (!html.trim()) return null;

  return (
    <EmbedFrame height={height} aspectRatio={aspectRatio}>
      {/* oxlint-disable-next-line iframe-has-title */}
      <iframe
        srcDoc={html}
        title={t`Embedded content`}
        loading="lazy"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts"
        {...stylex.props(articleBodyStyles.iframeEmbed)}
      />
    </EmbedFrame>
  );
}
