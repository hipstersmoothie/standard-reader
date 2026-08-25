"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import {
  AlertDialog,
  AlertDialogActionButton,
  AlertDialogCancelButton,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@standard-reader/design-system/alert-dialog";
import { MenuItem } from "@standard-reader/design-system/menu";
import { toasts } from "@standard-reader/design-system/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban } from "lucide-react";

import { auth } from "#/integrations/tanstack-query/api-auth.functions";
import {
  NEEDS_BLOCK_SCOPE,
  blocksApi,
} from "#/integrations/tanstack-query/api-blocks.functions";

/**
 * "Block" in the author overflow menu, and the confirmation it opens.
 *
 * Writes an `app.bsky.graph.block` record to the reader's own repo — the same
 * record Bluesky writes — so the block travels with them rather than being a
 * Standard Reader setting. There is no unblock counterpart here: once blocked,
 * the profile renders as the block itself (see `BlockedNotice`), which is where
 * undoing it belongs.
 *
 * Writing needs an OAuth scope the reader hasn't necessarily granted. Rather
 * than gate the item on it — which would hide the feature from everyone who
 * signed in before it existed — the first press runs the progressive upgrade
 * and returns here. Their *existing* blocks are enforced either way.
 *
 * **The item and the dialog are two components on purpose.** `Menu` renders its
 * children inside the trigger's `Popover`, so a dialog returned alongside the
 * `MenuItem` mounts *inside* the menu — and pressing the item closes the menu,
 * which unmounts the dialog in the same frame. It opens and vanishes. The dialog
 * has to be a sibling of `<Menu>`, not a descendant, which is the shape
 * `RssFeedDialog` already uses from this same menu.
 */
export function BlockUserMenuItem({
  name,
  iconSize = 14,
  onPress,
}: {
  name?: string | null;
  iconSize?: number;
  /** Opens {@link BlockUserDialog}, which the menu's parent renders. */
  onPress: () => void;
}) {
  const { t } = useLingui();
  return (
    <MenuItem
      onPress={onPress}
      suffix={<Ban size={iconSize} />}
      textValue={name ? t`Block ${name}` : t`Block account`}
    >
      <Trans>Block</Trans>
    </MenuItem>
  );
}

/**
 * The confirmation for {@link BlockUserMenuItem}. Render outside `<Menu>`.
 *
 * Confirmed, not immediate: blocking sits one press away from Share and Copy
 * link in the same menu, but unlike them it writes a public record to the
 * reader's repo that every AT Protocol app honours — and this menu offers no way
 * back, because the profile it lives on turns into a block notice. A mis-tap
 * should not be able to do that silently.
 */
export function BlockUserDialog({
  did,
  name,
  isOpen,
  onOpenChange,
}: {
  did: string;
  name?: string | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();

  const block = useMutation({
    mutationFn: async () => {
      try {
        await blocksApi.blockAccount({ data: { did } });
        return { blocked: true as const };
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes(NEEDS_BLOCK_SCOPE)
        ) {
          const here = new URL(globalThis.location.href);
          const result = await auth.upgradeToBlocking({
            data: {
              redirect: `${here.pathname}${here.search}${here.hash}`,
            },
          });
          return { authorizationUrl: result.authorizationUrl };
        }
        throw error;
      }
    },
    onSuccess: (result) => {
      if ("authorizationUrl" in result && result.authorizationUrl) {
        globalThis.location.href = result.authorizationUrl;
        return;
      }
      onOpenChange(false);
      // The write went to the reader's repo, not to a setting here — say so, and
      // point at where it can be undone, because this menu has no unblock and
      // the profile they are standing on is about to become a notice.
      toasts.add({
        description: name
          ? t`${name} is hidden everywhere you read, and on Bluesky. You can undo this in Settings → Blocked accounts.`
          : t`They're hidden everywhere you read, and on Bluesky. You can undo this in Settings → Blocked accounts.`,
        title: t`Blocked`,
      });
      // A block changes feeds, search, discussion and this very page, so there
      // is no narrower key worth invalidating than everything.
      void queryClient.invalidateQueries();
    },
    // Without this a failed write is indistinguishable from a successful one:
    // the dialog closes, the spinner stops, and the account is still there.
    onError: () => {
      onOpenChange(false);
      toasts.add({
        description: t`We couldn't write the block to your account. Try again?`,
        title: t`Something went wrong`,
      });
    },
  });

  return (
    <AlertDialog
      trigger={null}
      isOpen={isOpen}
      onOpenChange={(open) => {
        // Never yank the dialog out from under a write already in flight.
        if (!open && block.isPending) return;
        onOpenChange(open);
      }}
    >
      <AlertDialogHeader>
        {name ? <Trans>Block {name}?</Trans> : <Trans>Block account?</Trans>}
      </AlertDialogHeader>
      <AlertDialogDescription>
        <Trans>
          This writes a public block record to your atproto account, so it
          applies everywhere that respects blocks — Standard Reader, Bluesky,
          and other apps. Their writing and replies are hidden from your feeds
          and search, and they can't see your writing. Undo in Settings →
          Blocked accounts.
        </Trans>
      </AlertDialogDescription>
      <AlertDialogFooter>
        <AlertDialogCancelButton>
          <Trans>Cancel</Trans>
        </AlertDialogCancelButton>
        <AlertDialogActionButton
          closeOnPress={false}
          isPending={block.isPending}
          onPress={() => block.mutate()}
        >
          <Trans>Block</Trans>
        </AlertDialogActionButton>
      </AlertDialogFooter>
    </AlertDialog>
  );
}
