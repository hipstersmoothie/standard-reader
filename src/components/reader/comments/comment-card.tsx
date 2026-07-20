"use client";

import { Plural, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { MessageCircle } from "lucide-react";
import { Fragment } from "react";

import { AppLink } from "#/components/reader/app-link";
import { AuthorProfileLink } from "#/components/reader/author-profile-link";
import { Avatar } from "#/design-system/avatar";
import { Flex } from "#/design-system/flex";
import type { DocumentComment } from "#/integrations/tanstack-query/api-comments.functions";
import type { JsonValue } from "#/integrations/tanstack-query/api-shapes";
import { authorProfilePath } from "#/lib/author-profile";
import { segmentFacetedText, shiftFacets } from "#/lib/leaflet/facets";
import { utf8ByteLength } from "#/lib/leaflet/utf8";
import { useFormatters } from "#/lib/use-formatters";

import type { FacetFeature } from "../content/renderers/shared/facets";
import {
  findFacetFeature,
  hasFacetKind,
} from "../content/renderers/shared/facets";
import { initials } from "../format";
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
      <AppLink
        href={link.uri}
        linkStyle={commentStyles.facetLink}
        onClick={(event) => event.stopPropagation()}
      >
        {text}
      </AppLink>
    );
  } else if (didMention?.did) {
    node = (
      <AppLink
        href={authorProfilePath(didMention.did)}
        linkStyle={commentStyles.facetMentionLink}
        onClick={(event) => event.stopPropagation()}
      >
        {text}
      </AppLink>
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
  return shiftFacets(facets, byteOffset) as unknown as Array<JsonValue>;
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
    // Comment text is user content in an unknown language — resolve direction
    // from the text itself rather than inheriting the UI direction.
    <p dir="auto" {...stylex.props(commentStyles.commentaryParagraph)}>
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
  const { t } = useLingui();
  const fmt = useFormatters();
  const name = authorLabel(comment);
  const handle = comment.author.handle ? `@${comment.author.handle}` : null;
  const replyContext =
    comment.source === "margin"
      ? t`on Margin`
      : comment.source === "semble"
        ? t`on Semble`
        : comment.source === "note"
          ? t`on pckt`
          : comment.source === "leaflet"
            ? t`on Leaflet`
            : t`on Bluesky`;
  const hasLink = comment.postUrl.trim().length > 0;

  const body = (
    <>
      {comment.kind === "quote" && comment.quote ? (
        <blockquote dir="auto" {...stylex.props(commentStyles.blockquote)}>
          {comment.quote}
        </blockquote>
      ) : null}

      <CommentFacetedText
        text={comment.commentary}
        facets={comment.commentaryFacets}
      />

      <Flex align="center" gap="sm" style={commentStyles.footer}>
        <MessageCircle size={16} aria-hidden />
        <span>
          <span {...stylex.props(commentStyles.bidiIsolate)}>
            <Plural
              value={comment.replyCount}
              one="# reply"
              other="# replies"
            />
          </span>{" "}
          <span {...stylex.props(commentStyles.bidiIsolate)}>
            {replyContext}
          </span>
        </span>
      </Flex>
    </>
  );

  return (
    <div
      {...stylex.props(commentStyles.card, hasLink && commentStyles.cardLinked)}
    >
      {hasLink ? (
        // Stretched overlay link — a sibling of the header and facet links,
        // not their ancestor, so no nested <a>. Covers the whole card so the
        // hover highlight (`cardLinked`, above) matches the click target.
        <a
          href={comment.postUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={t`Open this reply on Bluesky`}
          {...stylex.props(commentStyles.cardBodyOverlay)}
        />
      ) : null}
      <div {...stylex.props(commentStyles.cardHeader)}>
        <AuthorProfileLink
          authorRef={comment.author.did}
          linkStyle={commentStyles.authorLink}
        >
          <Avatar
            size="md"
            src={comment.author.avatarUrl ?? undefined}
            fallback={initials(name)}
            alt={name}
          />
          <div {...stylex.props(commentStyles.authorMeta)}>
            <span {...stylex.props(commentStyles.authorName)}>{name}</span>
            {handle ? (
              <span {...stylex.props(commentStyles.authorHandle)}>
                {handle}
              </span>
            ) : null}
          </div>
        </AuthorProfileLink>
        <time
          dateTime={comment.indexedAt}
          {...stylex.props(commentStyles.timestamp)}
        >
          {fmt.relativeTime(comment.indexedAt)}
        </time>
      </div>

      <div {...stylex.props(commentStyles.cardBody)}>{body}</div>
    </div>
  );
}
