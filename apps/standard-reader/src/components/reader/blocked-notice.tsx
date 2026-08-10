"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@standard-reader/design-system/button";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontSize,
  fontWeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import { toasts } from "@standard-reader/design-system/toast";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban } from "lucide-react";

import { ButtonLink } from "#/components/router-links";
import { blocksApi } from "#/integrations/tanstack-query/api-blocks.functions";
import type { BlockEdge } from "#/lib/blocks";
import { blockIsFromList, blockIsOutgoing } from "#/lib/blocks";

/**
 * Why a page is withheld, and what (if anything) the reader can do about it.
 *
 * The four block directions are not interchangeable here. A block the reader
 * made is theirs to undo, so it gets an Unblock button; one made against them
 * is somebody else's decision, and offering a button would be a lie. A block
 * that came from a moderation list is undone by leaving the list, not by
 * unblocking one account, so it points at settings instead.
 */
export function BlockedNotice({
  block,
  name,
  canWrite = false,
}: {
  block: BlockEdge;
  /** Display name or handle, when we have one. Falls back to "this account". */
  name?: string | null;
  /** Whether the reader has granted block-write access (enables Unblock). */
  canWrite?: boolean;
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const unblock = useMutation({
    mutationFn: async () =>
      blocksApi.unblockAccount({ data: { did: block.did } }),
    onSuccess: () => {
      // Blocks gate feeds, profiles, articles and discussion, so there is no
      // narrower key to invalidate than everything.
      void queryClient.invalidateQueries();
    },
    // A failed unblock leaves this panel exactly as it was, which reads as the
    // button doing nothing rather than as an error.
    onError: () => {
      toasts.add({
        description: t`We couldn't remove the block from your account. Try again?`,
        title: t`Something went wrong`,
      });
    },
  });

  const direct =
    blockIsOutgoing(block.direction) && !blockIsFromList(block.direction);
  // Translated rather than an inline English literal: a `??` fallback inside
  // `<Trans>` is an expression to Lingui, so the default would ship untranslated
  // into every locale.
  const who = name ?? t`this account`;
  const Who = name ?? t`This account`;

  return (
    <div {...stylex.props(styles.panel)}>
      <Ban size={24} aria-hidden="true" {...stylex.props(styles.icon)} />
      <p {...stylex.props(styles.heading)}>
        {block.direction === "blocking" ? (
          <Trans>You blocked this account</Trans>
        ) : block.direction === "list-blocking" ? (
          // Not "you blocked this account": the reader blocked a list, and may
          // never have heard of the person on it. Claiming the decision as
          // theirs sends them looking for an unblock button that isn't here.
          <Trans>Blocked by a list you use</Trans>
        ) : (
          <Trans>You're blocked</Trans>
        )}
      </p>
      <p {...stylex.props(styles.body)}>
        {block.direction === "blocking" ? (
          <Trans>
            You blocked {who}, so their writing is hidden everywhere you read.
          </Trans>
        ) : block.direction === "list-blocking" ? (
          <Trans>
            {Who} is on a moderation list you block. To see them again, leave
            that list.
          </Trans>
        ) : block.direction === "blocked-by" ? (
          <Trans>
            {Who} has blocked you, so you can't see their writing. Blocks are
            records in their repo — this isn't a Standard Reader decision, and
            it applies wherever you read them.
          </Trans>
        ) : (
          <Trans>
            {Who} blocks a moderation list you're on, so you can't see their
            writing.
          </Trans>
        )}
      </p>
      <div {...stylex.props(styles.actions)}>
        {direct && canWrite ? (
          <Button
            variant="secondary"
            size="sm"
            isPending={unblock.isPending}
            onPress={() => unblock.mutate()}
          >
            <Trans>Unblock</Trans>
          </Button>
        ) : null}
        <ButtonLink to="/settings/blocks" variant="tertiary" size="sm">
          <Trans>Manage blocks</Trans>
        </ButtonLink>
      </div>
    </div>
  );
}

const styles = stylex.create({
  panel: {
    gap: gap.sm,
    alignItems: "center",
    backgroundColor: uiColor.bgSubtle,
    borderRadius: radius.lg,
    display: "flex",
    flexDirection: "column",
    marginBlock: verticalSpace["2xl"],
    paddingBlock: verticalSpace["2xl"],
    paddingInline: horizontalSpace.xl,
    textAlign: "center",
  },
  icon: {
    color: uiColor.text2,
  },
  heading: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginBlock: spacing["0"],
  },
  body: {
    color: uiColor.text2,
    fontSize: fontSize.sm,
    marginBlock: spacing["0"],
    maxWidth: "34rem",
  },
  actions: {
    gap: gap.sm,
    display: "flex",
    marginBlockStart: verticalSpace.sm,
  },
});
