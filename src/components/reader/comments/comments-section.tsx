"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";

import { Flex } from "@standard-reader/design-system/flex";
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
  const { t } = useLingui();
  const { data: comments, isPending } = useQuery(
    commentsApi.getDocumentCommentsQueryOptions(documentUri),
  );

  return (
    <section
      {...stylex.props(commentStyles.section)}
      aria-label={t`Discussion`}
    >
      <SectionHead
        kicker={<Trans>Across the Atmosphere</Trans>}
        title={<Trans>Discussions</Trans>}
      />
      {isPending || comments === undefined ? (
        <CommentsSkeleton />
      ) : comments.length === 0 ? (
        <p {...stylex.props(commentStyles.empty)}>
          <Trans>No discussion yet.</Trans>
        </p>
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
