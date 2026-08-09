"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Flex } from "@standard-reader/design-system/flex";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { commentsApi } from "#/integrations/tanstack-query/api-comments.functions";
import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";

import { SectionHead } from "../primitives";
import { AddCommentDialog, AddCommentTrigger } from "./add-comment-dialog";
import { canAddComment } from "./article-comment-destinations";
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

export function CommentsSection({ article }: { article: ArticleDetail }) {
  const { t } = useLingui();
  const [addOpen, setAddOpen] = useState(false);
  const { data: comments, isPending } = useQuery(
    commentsApi.getDocumentCommentsQueryOptions(article.uri),
  );
  // Resolved from the article alone (no query), so the head's action is there
  // from first paint rather than popping in when the comment list resolves.
  const canComment = canAddComment(article);

  return (
    <section
      {...stylex.props(commentStyles.section)}
      aria-label={t`Discussion`}
    >
      <SectionHead
        kicker={<Trans>Across the Atmosphere</Trans>}
        title={<Trans>Discussions</Trans>}
        stackOnMobile={false}
        action={
          canComment ? (
            <AddCommentTrigger onPress={() => setAddOpen(true)} />
          ) : undefined
        }
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
      {canComment ? (
        <AddCommentDialog
          article={article}
          isOpen={addOpen}
          onOpenChange={setAddOpen}
        />
      ) : null}
    </section>
  );
}
