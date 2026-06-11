"use client";

import * as stylex from "@stylexjs/stylex";
import { AppLink } from "#/components/reader/app-link";
import { primaryColor } from "#/design-system/theme/color.stylex";
import { authorProfilePath } from "#/lib/author-profile";
import { Fragment } from "react";

/** Autolink http(s) and www. URLs in plain text (e.g. profile bios). */
const URL_RE =
  /(?:https?:\/\/|www\.)[a-z0-9][-a-z0-9+&@#/%?=~_|!:,.;]*[-a-z0-9+&@#/%=~_|]/gi;

/** Domain-style handles: `@alice.bsky.social`. */
const MENTION_RE =
  /@([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)/gi;

const TRAILING_PUNCT_RE = /[),.!?;:'"\]]+$/;

type LinkifiedSegment =
  | { kind: "text"; value: string }
  | { kind: "link"; value: string; href: string };

type TextToken = {
  start: number;
  end: number;
  display: string;
  href: string;
};

function linkHref(raw: string): string {
  const trimmed = raw.replace(TRAILING_PUNCT_RE, "");
  return trimmed.startsWith("www.") ? `https://${trimmed}` : trimmed;
}

function mentionHref(handle: string): string {
  return authorProfilePath(handle);
}

function findTextTokens(text: string): Array<TextToken> {
  const tokens: Array<TextToken> = [];

  for (const match of text.matchAll(URL_RE)) {
    const raw = match[0];
    const start = match.index ?? 0;
    tokens.push({
      start,
      end: start + raw.length,
      display: raw.replace(TRAILING_PUNCT_RE, ""),
      href: linkHref(raw),
    });
  }

  for (const match of text.matchAll(MENTION_RE)) {
    const raw = match[0];
    const handle = match[1] ?? "";
    const start = match.index ?? 0;
    const end = start + raw.length;
    if (tokens.some((token) => start >= token.start && start < token.end)) {
      continue;
    }
    const displayHandle = handle.replace(TRAILING_PUNCT_RE, "");
    tokens.push({
      start,
      end,
      display: `@${displayHandle}`,
      href: mentionHref(handle),
    });
  }

  tokens.sort((a, b) => a.start - b.start);

  const merged: Array<TextToken> = [];
  let lastEnd = 0;
  for (const token of tokens) {
    if (token.start < lastEnd) continue;
    merged.push(token);
    lastEnd = token.end;
  }
  return merged;
}

function linkifyPlainText(text: string): Array<LinkifiedSegment> {
  const tokens = findTextTokens(text);
  if (tokens.length === 0) {
    return [{ kind: "text", value: text }];
  }

  const segments: Array<LinkifiedSegment> = [];
  let lastIndex = 0;

  for (const token of tokens) {
    if (token.start > lastIndex) {
      segments.push({
        kind: "text",
        value: text.slice(lastIndex, token.start),
      });
    }
    segments.push({
      kind: "link",
      value: token.display,
      href: token.href,
    });
    lastIndex = token.end;
  }

  if (lastIndex < text.length) {
    segments.push({ kind: "text", value: text.slice(lastIndex) });
  }

  return segments;
}

const styles = stylex.create({
  root: {
    whiteSpace: "pre-line",
  },
  mentionLink: {
    textDecoration: { default: "none", ":hover": "underline" },
    color: "inherit",
    textDecorationColor: "currentColor",
    textUnderlineOffset: "2px",
  },
  urlLink: {
    textDecoration: { default: "underline", ":hover": "none" },
    color: primaryColor.text2,
    textUnderlineOffset: "2px",
  },
});

/** Plain text with autolinked URLs, @handles, and preserved line breaks. */
export function LinkifiedText({
  text,
  style,
}: {
  text: string;
  style?: stylex.StyleXStyles;
}) {
  const segments = linkifyPlainText(text);

  return (
    <span {...stylex.props(styles.root, style)}>
      {segments.map((segment, index) =>
        segment.kind === "link" ? (
          <AppLink
            key={index}
            href={segment.href}
            linkStyle={
              segment.href.startsWith("/u/")
                ? styles.mentionLink
                : styles.urlLink
            }
          >
            {segment.value}
          </AppLink>
        ) : (
          <Fragment key={index}>{segment.value}</Fragment>
        ),
      )}
    </span>
  );
}
