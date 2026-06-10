"use client";

import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { Button } from "#/design-system/button";
import { parseInternalRoute } from "#/lib/internal-route";

import { articleBodyStyles } from "../../body-styles";

function blockAlignmentStyle(alignment?: string) {
  switch (alignment) {
    case "center": {
      return articleBodyStyles.alignCenter;
    }
    case "right": {
      return articleBodyStyles.alignRight;
    }
    default: {
      return articleBodyStyles.alignLeft;
    }
  }
}

export function StructuredButtonBlockView({
  text,
  href,
  caption,
  alignment,
}: {
  text: string;
  href: string;
  caption?: string;
  alignment?: string;
}) {
  const url = href.trim();
  if (!url) return null;

  const label = text.trim() || url;
  const internal = parseInternalRoute(url);
  const alignmentStyle = blockAlignmentStyle(alignment);

  const button = internal?.params ? (
    <Link to={internal.to} params={internal.params}>
      <Button variant="secondary">{label}</Button>
    </Link>
  ) : internal ? (
    <Link to={internal.to}>
      <Button variant="secondary">{label}</Button>
    </Link>
  ) : (
    <a href={url} target="_blank" rel="noreferrer">
      <Button variant="secondary">{label}</Button>
    </a>
  );

  return (
    <div {...stylex.props(articleBodyStyles.buttonRow, alignmentStyle)}>
      {caption?.trim() ? (
        <p {...stylex.props(articleBodyStyles.buttonCaption)}>
          {caption.trim()}
        </p>
      ) : null}
      {button}
    </div>
  );
}
