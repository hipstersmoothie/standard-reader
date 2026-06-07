"use client";

import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Flex } from "#/design-system/flex";
import { commentsApi } from "#/integrations/tanstack-query/api-comments.functions";
import { Suspense } from "react";

import { SectionHead } from "../primitives";
import { CommentCard } from "./comment-card";
import { commentStyles } from "./comments-styles";

function CommentsSkeleton() {
  return (
    <Flex direction="column" gap="lg" style={commentStyles.list}>
      <div {...stylex.props(commentStyles.skeleton)} aria-hidden />
      <div {...stylex.props(commentStyles.skeleton)} aria-hidden />
    </Flex>
  );
}

function CommentsContent({ documentUri }: { documentUri: string }) {
  const { data: comments } = useSuspenseQuery(
    commentsApi.getDocumentCommentsQueryOptions(documentUri),
  );

  if (comments.length === 0) {
    return <p {...stylex.props(commentStyles.empty)}>No discussion yet.</p>;
  }

  return (
    <Flex direction="column" gap="lg" style={commentStyles.list}>
      {comments.map((comment) => (
        <CommentCard key={comment.postUri} comment={comment} />
      ))}
    </Flex>
  );
}

export function CommentsSection({ documentUri }: { documentUri: string }) {
  return (
    <section {...stylex.props(commentStyles.section)} aria-label="Discussion">
      <SectionHead kicker="Bluesky" title="Discussion" />
      <Suspense fallback={<CommentsSkeleton />}>
        <CommentsContent documentUri={documentUri} />
      </Suspense>
    </section>
  );
}
