"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Avatar } from "@standard-reader/design-system/avatar";
import { Button } from "@standard-reader/design-system/button";
import { Form } from "@standard-reader/design-system/form";
import { Skeleton } from "@standard-reader/design-system/skeleton";
import { TextField } from "@standard-reader/design-system/text-field";
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
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import type {
  AllowlistAddError,
  BlockAllowlistRow,
} from "#/integrations/tanstack-query/api-blocks.functions";
import { blocksApi } from "#/integrations/tanstack-query/api-blocks.functions";
import type { BlockEdge } from "#/lib/blocks";
import {
  useAllowBlockedAccount,
  useDisallowBlockedAccount,
} from "#/lib/use-block-allowlist";

function rowLabel(row: BlockAllowlistRow): string {
  return row.displayName ?? row.handle ?? row.did;
}

function initials(label: string): string {
  return label
    .replace(/^did:\w+:/, "")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * What an exemption is overriding, in words. Said per row because three of the
 * four directions are blocks the reader never made themselves — without this, a
 * name on a moderation list they subscribe to would sit here unexplained.
 */
function BlockReason({ block }: { block: BlockEdge | null }) {
  if (!block) return <Trans>No block right now</Trans>;
  switch (block.direction) {
    case "blocking": {
      return <Trans>You block them</Trans>;
    }
    case "list-blocking": {
      return <Trans>On a block list you use</Trans>;
    }
    case "blocked-by": {
      return <Trans>They block you</Trans>;
    }
    case "list-blocked-by": {
      return <Trans>They block a list you're on</Trans>;
    }
  }
}

function AllowlistItem({
  row,
  onRemove,
  pending,
}: {
  row: BlockAllowlistRow;
  onRemove: (did: string) => void;
  pending: boolean;
}) {
  const label = rowLabel(row);
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
          <span {...stylex.props(styles.rowMeta)}>
            {row.handle ? <>@{row.handle} · </> : null}
            <BlockReason block={row.block} />
          </span>
        </span>
      </Link>
      <Button
        variant="secondary"
        size="sm"
        isPending={pending}
        onPress={() => onRemove(row.did)}
      >
        <Trans>Remove</Trans>
      </Button>
    </li>
  );
}

/**
 * Settings → Blocked accounts → "Shown despite blocks".
 *
 * The reader's allowlist: accounts whose writing they still want to read here
 * while the block stays in force on Bluesky. Added by handle (or DID) so it
 * covers accounts the reader can't reach a page for — that's the point of a
 * block — as well as from the blocked-page notice itself.
 */
export function BlockAllowlistSection() {
  const { t } = useLingui();
  const allowlist = useQuery(blocksApi.getBlockAllowlistQueryOptions());
  const onMutationError = () => {
    toasts.add({
      description: t`We couldn't save that change. Try again?`,
      title: t`Something went wrong`,
    });
  };
  const allow = useAllowBlockedAccount();
  const disallow = useDisallowBlockedAccount({ onError: onMutationError });

  const [actor, setActor] = useState("");
  const [error, setError] = useState<AllowlistAddError | null>(null);

  const errorMessage = (code: AllowlistAddError): string => {
    switch (code) {
      case "not-found": {
        return t`We couldn't find that account. Check the handle and try again.`;
      }
      case "self": {
        return t`That's your own account.`;
      }
      case "full": {
        return t`Your list is full. Remove someone to add another.`;
      }
    }
  };

  const submit = () => {
    const value = actor.trim();
    if (!value || allow.isPending) return;
    setError(null);
    allow.mutate(value, {
      onSuccess: (result) => {
        if (result.ok) {
          setActor("");
        } else {
          setError(result.error);
        }
      },
      onError: onMutationError,
    });
  };

  const rows = allowlist.data ?? [];

  return (
    <section {...stylex.props(styles.section)}>
      <h2 {...stylex.props(styles.sectionHeading)}>
        <Trans>Shown despite blocks</Trans>
      </h2>
      <p {...stylex.props(styles.note)}>
        <Trans>
          Accounts you still want to read in Standard Reader, whoever made the
          block — you, a block list, or them. Their writing shows in your feeds,
          search, and discussion again. The block itself stays on your account
          and keeps applying on Bluesky. Only you can see this list.
        </Trans>
      </p>

      <Form
        style={styles.form}
        // A single-input form submits natively on Enter; without this the
        // browser would navigate instead of adding the account.
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <TextField
          label={t`Handle or DID`}
          // An example handle, not prose — the same in every locale.
          placeholder="alice.bsky.social"
          value={actor}
          onChange={(value) => {
            setActor(value);
            if (error) setError(null);
          }}
          validationState={error ? "invalid" : undefined}
          errorMessage={error ? errorMessage(error) : undefined}
          disablePasswordManagers
          style={styles.field}
        />
        <Button
          type="submit"
          variant="secondary"
          isPending={allow.isPending}
          isDisabled={actor.trim().length === 0}
        >
          <Trans>Add</Trans>
        </Button>
      </Form>

      {allowlist.isLoading ? (
        <div aria-busy="true" aria-label={t`Loading accounts`}>
          <Skeleton variant="rectangle" height="3rem" width="100%" />
        </div>
      ) : rows.length === 0 ? (
        <p {...stylex.props(styles.note)}>
          <Trans>
            Everyone your blocks cover is hidden here. Add an account above, or
            choose Show here anyway on a blocked page.
          </Trans>
        </p>
      ) : (
        <ul {...stylex.props(styles.list)}>
          {rows.map((row) => (
            <AllowlistItem
              key={row.did}
              row={row}
              pending={disallow.isPending && disallow.variables === row.did}
              onRemove={(did) => disallow.mutate(did)}
            />
          ))}
        </ul>
      )}
    </section>
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
  note: {
    color: uiColor.text2,
    fontSize: fontSize.sm,
    marginBlock: verticalSpace.md,
  },
  form: {
    gap: gap.sm,
    alignItems: "flex-end",
    flexDirection: "row",
  },
  field: {
    flexGrow: 1,
    minWidth: spacing["0"],
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
});
