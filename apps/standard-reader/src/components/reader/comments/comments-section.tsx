"use client";

import { Plural, Trans, useLingui } from "@lingui/react/macro";
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
  const { data, isPending } = useQuery(
    commentsApi.getDocumentCommentsQueryOptions(article.uri),
  );
  const comments = data?.comments;
  const hiddenByBlocks = data?.hiddenByBlocks ?? 0;
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
          {hiddenByBlocks > 0 ? (
            // The card's comment count is deliberately not per-reader (see
            // `fetchDocumentComments`), so an all-blocked thread would show a
            // number above the words "No discussion yet" and read as a bug.
            <Plural
              value={hiddenByBlocks}
              one="The only reply here is from someone you're blocked from."
              other="The replies here are all from accounts you're blocked from."
            />
          ) : (
            <Trans>No discussion yet.</Trans>
          )}
        </p>
      ) : (
        <>
          <Flex direction="column" gap="lg" style={commentStyles.list}>
            {comments.map((comment) => (
              <CommentCard key={comment.postUri} comment={comment} />
            ))}
          </Flex>
          {hiddenByBlocks > 0 ? (
            <p {...stylex.props(commentStyles.empty)}>
              <Plural
                value={hiddenByBlocks}
                one="# more reply is hidden by your blocks."
                other="# more replies are hidden by your blocks."
              />
            </p>
          ) : null}
        </>
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
