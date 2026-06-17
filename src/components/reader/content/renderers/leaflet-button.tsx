"use client";

import type { LeafletButtonBlock } from "#/lib/leaflet/types";

import * as stylex from "@stylexjs/stylex";
import { ButtonLink } from "#/components/router-links";
import { Button } from "#/design-system/button";
import { parseInternalRoute } from "#/lib/internal-route";

import { articleBodyStyles } from "../body-styles";

export function LeafletButtonBlockView({
  block,
}: {
  block: LeafletButtonBlock;
}) {
  const url = block.url?.trim();
  if (!url) return null;

  const label = block.text?.trim() || url;
  const internal = parseInternalRoute(url);

  if (internal?.params) {
    return (
      <div {...stylex.props(articleBodyStyles.buttonRow)}>
        <ButtonLink
          to={internal.to}
          params={internal.params}
          variant="secondary"
        >
          {label}
        </ButtonLink>
      </div>
    );
  }

  if (internal) {
    return (
      <div {...stylex.props(articleBodyStyles.buttonRow)}>
        <ButtonLink to={internal.to} variant="secondary">
          {label}
        </ButtonLink>
      </div>
    );
  }

  return (
    <div {...stylex.props(articleBodyStyles.buttonRow)}>
      <a href={url} target="_blank" rel="noreferrer">
        <Button variant="secondary">{label}</Button>
      </a>
    </div>
  );
}
