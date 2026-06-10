"use client";

import type { PcktWebsiteBlock } from "#/lib/pckt/types";

import * as stylex from "@stylexjs/stylex";
import { normalizeImageAlt } from "#/lib/document/structured-content/image";

import { articleBodyStyles } from "../body-styles";

export function PcktWebsiteBlockView({ block }: { block: PcktWebsiteBlock }) {
  if (!block.src) return null;

  const title = block.title?.trim();
  const description = block.description?.trim();
  const previewImage = block.previewImage?.trim();

  return (
    <a
      href={block.src}
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
      <div {...stylex.props(articleBodyStyles.websiteCardBody)}>
        {title ? (
          <p {...stylex.props(articleBodyStyles.websiteCardTitle)}>{title}</p>
        ) : null}
        {description ? (
          <p {...stylex.props(articleBodyStyles.websiteCardDescription)}>
            {description}
          </p>
        ) : null}
      </div>
    </a>
  );
}
