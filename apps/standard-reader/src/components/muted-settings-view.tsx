"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Avatar } from "@standard-reader/design-system/avatar";
import { Button } from "@standard-reader/design-system/button";
import { Skeleton } from "@standard-reader/design-system/skeleton";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
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
import { toasts } from "@standard-reader/design-system/toast";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import type {
  MutedPublicationItem,
  MutedUserRow,
} from "#/integrations/tanstack-query/api-mutes.functions";
import { mutesApi } from "#/integrations/tanstack-query/api-mutes.functions";

import { publicationLinkParams } from "./reader/format";
import { Masthead, ReaderContent } from "./reader/primitives";

function userLabel(row: MutedUserRow): string {
  return row.displayName ?? row.handle ?? row.did;
}

function initials(label: string): string {
  return label
    .replace(/^did:\w+:/, "")
    .slice(0, 2)
    .toUpperCase();
}

/** One muted user, with the control to undo it. */
function MutedUserItem({
  row,
  canWrite,
  onUnmute,
  pending,
}: {
  row: MutedUserRow;
  canWrite: boolean;
  onUnmute: (subject: string) => void;
  pending: boolean;
}) {
  const label = userLabel(row);
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
          onPress={() => onUnmute(row.did)}
        >
          <Trans>Unmute</Trans>
        </Button>
      ) : null}
    </li>
  );
}

/** One muted publication, with the control to undo it. */
function MutedPublicationItemRow({
  row,
  canWrite,
  onUnmute,
  pending,
}: {
  row: MutedPublicationItem;
  canWrite: boolean;
  onUnmute: (subject: string) => void;
  pending: boolean;
}) {
  const label = row.name ?? row.subjectUri;
  const params = publicationLinkParams(row.subjectUri);
  const main = (
    <>
      <Avatar
        size="sm"
        src={row.iconUrl ?? undefined}
        fallback={initials(label)}
        alt={label}
      />
      <span {...stylex.props(styles.rowText)}>
        <span {...stylex.props(styles.rowName)}>{label}</span>
        {row.url ? (
          <span {...stylex.props(styles.rowMeta)}>{row.url}</span>
        ) : null}
      </span>
    </>
  );
  return (
    <li {...stylex.props(styles.row)}>
      {params ? (
        <Link
          to="/p/$did/$rkey"
          params={params}
          {...stylex.props(styles.rowMain)}
        >
          {main}
        </Link>
      ) : (
        <span {...stylex.props(styles.rowMain)}>{main}</span>
      )}
      {canWrite ? (
        <Button
          variant="secondary"
          size="sm"
          isPending={pending}
          onPress={() => onUnmute(row.subjectUri)}
        >
          <Trans>Unmute</Trans>
        </Button>
      ) : null}
    </li>
  );
}

/**
 * Muted people and publications.
 *
 * Reads the reader's `app.standard-reader.graph.mute` records. Unlike blocks
 * these are one-directional and scoped: muted subjects disappear from feeds
 * and discovery only, subscriptions stay intact, and their pages stay
 * reachable — which is why every row here still links to the page it hides.
 */
export function MutedSettingsView() {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const settings = useQuery(mutesApi.getMutedSettingsQueryOptions());

  const onMutationError = () => {
    toasts.add({
      description: t`We couldn't reach your account to change that. Try again?`,
      title: t`Something went wrong`,
    });
  };
  const unmute = useMutation({
    mutationFn: async (subject: string) =>
      mutesApi.unmuteSubject({ data: { subject } }),
    // An unmute changes every feed and discovery surface, not just this list.
    onSuccess: () => void queryClient.invalidateQueries(),
    onError: onMutationError,
  });

  const data = settings.data ?? null;
  const users = data?.users ?? [];
  const publications = data?.publications ?? [];
  const canWrite = data?.canWrite ?? false;

  return (
    <ReaderContent>
      <Masthead
        kicker={t`Moderation`}
        title={t`Muted`}
        dek={t`Muted people and publications disappear from your feeds, search, and discovery — but only in Standard Reader. Mutes are public records in your repo, but unlike a block, Bluesky and other apps don't enforce them. Your subscriptions stay intact and direct links still work.`}
        metaLabel={t`Muted`}
        metaValue={
          settings.isLoading ? (
            <Skeleton variant="rectangle" height="2rem" width="3.5rem" />
          ) : (
            String(data?.count ?? 0)
          )
        }
      />

      {data && !canWrite ? (
        <p {...stylex.props(styles.note)}>
          <Trans>
            Your mutes are enforced here already. To add or remove one, you'll
            be asked to re-authorize the first time you try.
          </Trans>
        </p>
      ) : null}

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>Muted people</Trans>
        </h2>
        {settings.isLoading ? (
          <div aria-busy="true" aria-label={t`Loading muted people`}>
            <Skeleton variant="rectangle" height="3rem" width="100%" />
          </div>
        ) : users.length === 0 ? (
          <p {...stylex.props(styles.note)}>
            <Trans>
              You haven't muted anyone. Mute someone from the menu on their page
              to hide everything they write — and everything they recommend —
              without unfollowing.
            </Trans>
          </p>
        ) : (
          <ul {...stylex.props(styles.list)}>
            {users.map((row) => (
              <MutedUserItem
                key={row.did}
                row={row}
                canWrite={canWrite}
                pending={unmute.isPending && unmute.variables === row.did}
                onUnmute={(subject) => unmute.mutate(subject)}
              />
            ))}
          </ul>
        )}
      </section>

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>Muted publications</Trans>
        </h2>
        {settings.isLoading ? (
          <div aria-busy="true" aria-label={t`Loading muted publications`}>
            <Skeleton variant="rectangle" height="3rem" width="100%" />
          </div>
        ) : publications.length === 0 ? (
          <p {...stylex.props(styles.note)}>
            <Trans>
              You haven't muted any publications. Mute one from the menu on its
              page to hide its articles from your feeds while staying
              subscribed.
            </Trans>
          </p>
        ) : (
          <ul {...stylex.props(styles.list)}>
            {publications.map((row) => (
              <MutedPublicationItemRow
                key={row.subjectUri}
                row={row}
                canWrite={canWrite}
                pending={
                  unmute.isPending && unmute.variables === row.subjectUri
                }
                onUnmute={(subject) => unmute.mutate(subject)}
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
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  note: {
    color: uiColor.text2,
    fontSize: fontSize.sm,
    marginBlock: verticalSpace.md,
  },
});
