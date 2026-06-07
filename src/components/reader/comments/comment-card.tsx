"use client";

import type { DocumentComment } from "#/integrations/tanstack-query/api-comments.functions";
import type { JsonValue } from "#/integrations/tanstack-query/api-shapes";

import * as stylex from "@stylexjs/stylex";
import { Avatar } from "#/design-system/avatar";
import { Flex } from "#/design-system/flex";
import { segmentFacetedText, shiftFacets } from "#/lib/leaflet/facets";
import { utf8ByteLength } from "#/lib/leaflet/utf8";
import { MessageCircle } from "lucide-react";
import { Fragment } from "react";

import type { FacetFeature } from "../content/renderers/shared/facets";

import { findFacetFeature, hasFacetKind } from "../content/renderers/shared/facets";
import { formatRelativeTime, initials } from "../format";
import { commentStyles } from "./comments-styles";

function CommentFacetSegment({
  text,
  features,
}: {
  text: string;
  features: Array<FacetFeature>;
}) {
  if (features.length === 0) return <>{text}</>;

  const isBold = hasFacetKind(features, "bold");
  const isItalic = hasFacetKind(features, "italic");
  const isCode = hasFacetKind(features, "code");
  const link = findFacetFeature(features, "link");
  const didMention =
    findFacetFeature(features, "didMention") ??
    findFacetFeature(features, "mention");

  let node: React.ReactNode = text;

  if (isCode) {
    node = <code {...stylex.props(commentStyles.facetCode)}>{text}</code>;
  }

  if (link?.uri) {
    node = (
      <a
        href={link.uri}
        target="_blank"
        rel="noreferrer"
        {...stylex.props(commentStyles.facetLink)}
        onClick={(event) => event.stopPropagation()}
      >
        {text}
      </a>
    );
  } else if (didMention?.did) {
    node = (
      <a
        href={`https://bsky.app/profile/${didMention.did}`}
        target="_blank"
        rel="noreferrer"
        {...stylex.props(commentStyles.facetLink)}
        onClick={(event) => event.stopPropagation()}
      >
        {text}
      </a>
    );
  }

  if (isItalic) {
    node = <em {...stylex.props(commentStyles.facetItalic)}>{node}</em>;
  }

  if (isBold) {
    node = <strong {...stylex.props(commentStyles.facetBold)}>{node}</strong>;
  }

  return <>{node}</>;
}

function facetsForSlice(
  facets: Array<JsonValue> | null,
  text: string,
  sliceStart: number,
): Array<JsonValue> | null {
  if (!facets?.length || sliceStart <= 0) return facets;
  const byteOffset = utf8ByteLength(text.slice(0, sliceStart));
  return shiftFacets(facets, byteOffset) as Array<JsonValue>;
}

function commentParagraphSlices(
  text: string,
): Array<{ end: number; start: number; text: string }> {
  const slices: Array<{ end: number; start: number; text: string }> = [];
  const separator = /\n{2,}/g;
  let lastEnd = 0;
  let match: RegExpExecArray | null;

  const pushSlice = (from: number, to: number) => {
    const raw = text.slice(from, to);
    const trimmed = raw.trim();
    if (!trimmed) return;
    const start = text.indexOf(trimmed, from);
    slices.push({ text: trimmed, start, end: start + trimmed.length });
  };

  while ((match = separator.exec(text)) !== null) {
    pushSlice(lastEnd, match.index);
    lastEnd = match.index + match[0].length;
  }
  pushSlice(lastEnd, text.length);

  return slices.length > 0
    ? slices
    : [{ text: text.trim(), start: 0, end: text.length }];
}

function CommentFacetedParagraph({
  text,
  facets,
}: {
  text: string;
  facets: Array<JsonValue> | null;
}) {
  const segments = segmentFacetedText(text, facets ?? undefined);
  return (
    <p {...stylex.props(commentStyles.commentaryParagraph)}>
      {segments.map((segment, index) => (
        <Fragment key={index}>
          <CommentFacetSegment
            text={segment.text}
            features={segment.features}
          />
        </Fragment>
      ))}
    </p>
  );
}

function CommentFacetedText({
  text,
  facets,
}: {
  text: string;
  facets: Array<JsonValue> | null;
}) {
  if (!text.trim()) return null;

  const paragraphs = commentParagraphSlices(text);

  return (
    <div {...stylex.props(commentStyles.commentary)}>
      {paragraphs.map((paragraph) => (
        <CommentFacetedParagraph
          key={`${paragraph.start}-${paragraph.end}`}
          text={paragraph.text}
          facets={
            paragraphs.length === 1
              ? facets
              : facetsForSlice(facets, text, paragraph.start)
          }
        />
      ))}
    </div>
  );
}

function authorLabel(comment: DocumentComment): string {
  if (comment.author.displayName?.trim()) return comment.author.displayName;
  if (comment.author.handle?.trim()) return `@${comment.author.handle}`;
  return comment.author.did.slice(0, 16);
}

export function CommentCard({ comment }: { comment: DocumentComment }) {
  const name = authorLabel(comment);
  const handle = comment.author.handle ? `@${comment.author.handle}` : null;
  const replyLabel =
    comment.replyCount === 1 ? "1 reply" : `${comment.replyCount} replies`;

  return (
    <a
      href={comment.postUrl}
      target="_blank"
      rel="noreferrer"
      {...stylex.props(commentStyles.card)}
    >
      <div {...stylex.props(commentStyles.cardHeader)}>
        <Avatar
          size="md"
          src={comment.author.avatarUrl ?? undefined}
          fallback={initials(name)}
          alt={name}
        />
        <div {...stylex.props(commentStyles.authorMeta)}>
          <span {...stylex.props(commentStyles.authorName)}>{name}</span>
          {handle ? (
            <span {...stylex.props(commentStyles.authorHandle)}>{handle}</span>
          ) : null}
        </div>
        <time
          dateTime={comment.indexedAt}
          {...stylex.props(commentStyles.timestamp)}
        >
          {formatRelativeTime(comment.indexedAt)}
        </time>
      </div>

      {comment.kind === "quote" && comment.quote ? (
        <blockquote {...stylex.props(commentStyles.blockquote)}>
          {comment.quote}
        </blockquote>
      ) : null}

      <CommentFacetedText
        text={comment.commentary}
        facets={comment.commentaryFacets}
      />

      <Flex align="center" gap="sm" style={commentStyles.footer}>
        <MessageCircle size={16} aria-hidden />
        <span>{replyLabel}</span>
      </Flex>
    </a>
  );
}
