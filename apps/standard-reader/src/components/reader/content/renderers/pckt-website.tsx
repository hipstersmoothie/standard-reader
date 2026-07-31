"use client";

import * as stylex from "@stylexjs/stylex";

import { parseBskyClientUrl } from "#/lib/atproto/bsky-clients";
import { normalizeImageAlt } from "#/lib/document/structured-content/image";
import type { PcktWebsiteBlock } from "#/lib/pckt/types";

import { articleBodyStyles } from "../body-styles";
import { BskyClientEmbedView } from "./shared/bsky-client-embed";
import { WebsiteCardBody } from "./structured-views";

export function PcktWebsiteBlockView({ block }: { block: PcktWebsiteBlock }) {
  const src = block.src;
  if (!src) return null;

  const title = block.title?.trim();
  const description = block.description?.trim();
  const previewImage = block.previewImage?.trim();

  const card = (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      {...stylex.props(articleBodyStyles.websiteCard)}
    >
      {previewImage ? (
        <img
          src={previewImage}
          alt={normalizeImageAlt(title)}
          loading="lazy"
          referrerPolicy="no-referrer"
          {...stylex.props(articleBodyStyles.websiteCardImage)}
        />
      ) : null}
      <WebsiteCardBody title={title} description={description} />
    </a>
  );

  const clientRef = parseBskyClientUrl(src);
  if (clientRef) {
    return (
      <BskyClientEmbedView url={src} clientRef={clientRef} fallback={card} />
    );
  }

  return card;
}
