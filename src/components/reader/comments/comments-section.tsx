"use client";

import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { Flex } from "#/design-system/flex";
import { commentsApi } from "#/integrations/tanstack-query/api-comments.functions";

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

export function CommentsSection({ documentUri }: { documentUri: string }) {
  const { data: comments, isPending } = useQuery(
    commentsApi.getDocumentCommentsQueryOptions(documentUri),
  );

  return (
    <section {...stylex.props(commentStyles.section)} aria-label="Discussion">
      <SectionHead kicker="Across the Atmosphere" title="Discussions" />
      {isPending || comments === undefined ? (
        <CommentsSkeleton />
      ) : comments.length === 0 ? (
        <p {...stylex.props(commentStyles.empty)}>No discussion yet.</p>
      ) : (
        <Flex direction="column" gap="lg" style={commentStyles.list}>
          {comments.map((comment) => (
            <CommentCard key={comment.postUri} comment={comment} />
          ))}
        </Flex>
      )}
    </section>
  );
}
