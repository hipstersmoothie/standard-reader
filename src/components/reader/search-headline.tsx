"use client";

import * as stylex from "@stylexjs/stylex";
import { Fragment } from "react";
import { primaryColor } from "#/design-system/theme/color.stylex";
import { fontWeight } from "#/design-system/theme/typography.stylex";
import { sanitizeTsHeadlineHtml } from "#/lib/search-headline";

import { articleBodyStyles } from "./content/body-styles";

const styles = stylex.create({
  /** Terracotta wash + explicit ink so marks stay legible on muted card deks. */
  mark: {
    color: primaryColor.text2,
    fontWeight: fontWeight.medium,
  },
});

const MARK_RE = /<mark>(.*?)<\/mark>/gi;

function parseHeadlineParts(
  html: string,
): Array<{ kind: "text" | "mark"; value: string }> {
  const parts: Array<{ kind: "text" | "mark"; value: string }> = [];
  let lastIndex = 0;

  for (const match of html.matchAll(MARK_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ kind: "text", value: html.slice(lastIndex, index) });
    }
    parts.push({ kind: "mark", value: match[1] ?? "" });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < html.length) {
    parts.push({ kind: "text", value: html.slice(lastIndex) });
  }

  return parts;
}

export function SearchHeadline({
  html,
  style,
}: {
  html: string;
  style?: stylex.StyleXStyles | Array<stylex.StyleXStyles | false | undefined>;
}) {
  const safe = sanitizeTsHeadlineHtml(html);
  if (!safe) return null;

  const parts = parseHeadlineParts(safe);
  if (parts.length === 0) return null;

  return (
    <span data-search-headline="" {...stylex.props(style)}>
      {parts.map((part, index) =>
        part.kind === "mark" ? (
          <mark
            key={index}
            {...stylex.props(articleBodyStyles.quoteShareMark, styles.mark)}
            dangerouslySetInnerHTML={{ __html: part.value }}
          />
        ) : (
          <Fragment key={index}>
            <span dangerouslySetInnerHTML={{ __html: part.value }} />
          </Fragment>
        ),
      )}
    </span>
  );
}
