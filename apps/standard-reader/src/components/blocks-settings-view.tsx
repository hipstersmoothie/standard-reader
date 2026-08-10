"use client";

import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Avatar } from "@standard-reader/design-system/avatar";
import { Badge } from "@standard-reader/design-system/badge";
import { Button } from "@standard-reader/design-system/button";
import { Skeleton } from "@standard-reader/design-system/skeleton";
import {
  uiColor,
  warningColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  gap,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontSize,
  fontWeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

import type {
  BlockListRow,
  BlockedAccountRow,
} from "#/integrations/tanstack-query/api-blocks.functions";
import { blocksApi } from "#/integrations/tanstack-query/api-blocks.functions";

import { Masthead, ReaderContent } from "./reader/primitives";

const MOBILE = "@media (max-width: 47.5rem)";

function accountLabel(row: BlockedAccountRow): string {
  return row.displayName ?? row.handle ?? row.did;
}

function initials(label: string): string {
  return label
    .replace(/^did:\w+:/, "")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * One blocked account, with the control to undo it.
 *
 * Only the reader's own direct blocks reach this list, so the button is always
 * honest: it removes a record in their repo. Blocks *against* them, and members
 * of blocklists they subscribe to, are not theirs to undo and are described in
 * the list section below rather than mixed in here with a button that would lie.
 */
function BlockedAccountItem({
  row,
  canWrite,
  onUnblock,
  pending,
}: {
  row: BlockedAccountRow;
  canWrite: boolean;
  onUnblock: (did: string) => void;
  pending: boolean;
}) {
  const label = accountLabel(row);
  return (
    <li {...stylex.props(styles.row)}>
      <Link
        to="/u/$did"
        params={{ did: row.handle ?? row.did }}
        {...stylex.props(styles.rowMain)}
      >
        <Avatar
          size="sm"
          src={row.avatarUrl ?? undefined}
          fallback={initials(label)}
          alt={label}
        />
        <span {...stylex.props(styles.rowText)}>
          <span {...stylex.props(styles.rowName)}>{label}</span>
          {row.handle ? (
            <span {...stylex.props(styles.rowMeta)}>@{row.handle}</span>
          ) : null}
        </span>
      </Link>
      {canWrite ? (
        <Button
          variant="secondary"
          size="sm"
          isPending={pending}
          onPress={() => onUnblock(row.did)}
        >
          <Trans>Unblock</Trans>
        </Button>
      ) : null}
    </li>
  );
}

/** One subscribed moderation list, with how much of it is actually mirrored. */
function BlockListItem({
  row,
  canWrite,
  onUnblock,
  pending,
}: {
  row: BlockListRow;
  canWrite: boolean;
  onUnblock: (listUri: string) => void;
  pending: boolean;
}) {
  const { t } = useLingui();
  return (
    <li {...stylex.props(styles.row)}>
      <span {...stylex.props(styles.rowMain)}>
        <span {...stylex.props(styles.rowText)}>
          <span {...stylex.props(styles.rowName)}>
            {row.name ?? t`Moderation list`}
          </span>
          <span {...stylex.props(styles.rowMeta)}>
            <Plural
              value={row.memberCount}
              one="# account"
              other="# accounts"
            />
          </span>
        </span>
      </span>
      <span {...stylex.props(styles.rowActions)}>
        {row.truncated ? (
          <Badge variant="warning" size="sm">
            <Trans>Partial</Trans>
          </Badge>
        ) : null}
        {canWrite ? (
          <Button
            variant="secondary"
            size="sm"
            isPending={pending}
            onPress={() => onUnblock(row.listUri)}
          >
            <Trans>Remove</Trans>
          </Button>
        ) : null}
      </span>
    </li>
  );
}

/**
 * Blocked accounts and block lists.
 *
 * Reads the reader's `app.bsky.graph.block` records — the same records Bluesky
 * writes — so this list is their blocks everywhere, not a Standard Reader copy
 * of them. Removing one here removes it everywhere too.
 */
export function BlocksSettingsView() {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const settings = useQuery(blocksApi.getBlocksSettingsQueryOptions());

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["blocks"] });
  };

  const unblockAccount = useMutation({
    mutationFn: async (did: string) =>
      blocksApi.unblockAccount({ data: { did } }),
    onSuccess: invalidate,
  });
  const unblockList = useMutation({
    mutationFn: async (listUri: string) =>
      blocksApi.unblockList({ data: { listUri } }),
    onSuccess: invalidate,
  });
  const refresh = useMutation({
    mutationFn: async () => blocksApi.refreshBlocks(),
    onSuccess: invalidate,
  });

  const data = settings.data ?? null;
  const accounts = data?.accounts ?? [];
  const lists = data?.lists ?? [];

  return (
    <ReaderContent>
      <Masthead
        kicker={t`Moderation`}
        title={t`Blocked accounts`}
        dek={t`Blocks live in your own repo as portable records, so the ones you made on Bluesky already apply here — and the ones you make here apply there. Blocked accounts disappear from your feeds, search, discussion, and their pages, and they can't see yours.`}
        metaLabel={t`Blocked`}
        metaValue={
          settings.isLoading ? (
            <Skeleton variant="rectangle" height="2rem" width="3.5rem" />
          ) : (
            String(data?.accountCount ?? 0)
          )
        }
      />

      {data && !data.canWrite ? (
        <p {...stylex.props(styles.note)}>
          <Trans>
            Your blocks are enforced here already. To add or remove one from
            Standard Reader, you'll be asked to authorize block access the first
            time you try.
          </Trans>
        </p>
      ) : null}

      {data?.syncError ? (
        <p {...stylex.props(styles.warnNote)}>
          <TriangleAlert size={16} aria-hidden="true" />
          <Trans>
            Some blocks couldn't be refreshed last time, so this list may be
            incomplete.
          </Trans>
        </p>
      ) : null}

      <section {...stylex.props(styles.section)}>
        <div {...stylex.props(styles.sectionHead)}>
          <h2 {...stylex.props(styles.sectionHeading)}>
            <Trans>Accounts you block</Trans>
          </h2>
          <Button
            variant="tertiary"
            size="sm"
            isPending={refresh.isPending}
            onPress={() => refresh.mutate()}
          >
            <Trans>Refresh</Trans>
          </Button>
        </div>

        {settings.isLoading ? (
          <div aria-busy="true" aria-label={t`Loading blocked accounts`}>
            <Skeleton variant="rectangle" height="3rem" width="100%" />
          </div>
        ) : accounts.length === 0 ? (
          <p {...stylex.props(styles.note)}>
            <Trans>You haven't blocked anyone.</Trans>
          </p>
        ) : (
          <ul {...stylex.props(styles.list)}>
            {accounts.map((row) => (
              <BlockedAccountItem
                key={row.did}
                row={row}
                canWrite={data?.canWrite ?? false}
                pending={
                  unblockAccount.isPending &&
                  unblockAccount.variables === row.did
                }
                onUnblock={(did) => unblockAccount.mutate(did)}
              />
            ))}
          </ul>
        )}
      </section>

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>Block lists</Trans>
        </h2>
        <p {...stylex.props(styles.note)}>
          <Trans>
            Moderation lists you subscribe to on Bluesky. Everyone on them is
            blocked here too, and the list stays live as its owner changes it.
          </Trans>
        </p>
        {lists.length === 0 ? (
          <p {...stylex.props(styles.note)}>
            <Trans>You don't subscribe to any block lists.</Trans>
          </p>
        ) : (
          <ul {...stylex.props(styles.list)}>
            {lists.map((row) => (
              <BlockListItem
                key={row.uri}
                row={row}
                canWrite={data?.canWrite ?? false}
                pending={
                  unblockList.isPending && unblockList.variables === row.listUri
                }
                onUnblock={(listUri) => unblockList.mutate(listUri)}
              />
            ))}
          </ul>
        )}
      </section>
    </ReaderContent>
  );
}

const styles = stylex.create({
  section: {
    marginBlockEnd: verticalSpace["2xl"],
  },
  sectionHead: {
    gap: gap.md,
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
  },
  sectionHeading: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginBlock: spacing["0"],
  },
  list: {
    gap: gap.xs,
    display: "flex",
    flexDirection: "column",
    listStyle: "none",
    marginBlock: verticalSpace.md,
    paddingInline: spacing["0"],
  },
  row: {
    gap: gap.md,
    alignItems: "center",
    borderRadius: radius.md,
    display: "flex",
    justifyContent: "space-between",
    paddingBlock: verticalSpace.sm,
    paddingInline: spacing["0"],
  },
  rowMain: {
    gap: gap.sm,
    alignItems: "center",
    color: "inherit",
    display: "flex",
    minWidth: spacing["0"],
    textDecoration: "none",
  },
  rowText: {
    gap: gap.xxs,
    display: "flex",
    flexDirection: "column",
    minWidth: spacing["0"],
  },
  rowName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowMeta: {
    color: uiColor.text2,
    fontSize: fontSize.xs,
  },
  rowActions: {
    gap: gap.sm,
    alignItems: "center",
    display: {
      [MOBILE]: "flex",
      default: "flex",
    },
  },
  note: {
    color: uiColor.text2,
    fontSize: fontSize.sm,
    marginBlock: verticalSpace.md,
  },
  warnNote: {
    gap: gap.xs,
    alignItems: "center",
    color: warningColor.text1,
    display: "flex",
    fontSize: fontSize.sm,
    marginBlock: verticalSpace.md,
  },
});
