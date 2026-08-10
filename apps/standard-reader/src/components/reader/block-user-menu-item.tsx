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
import { useState } from "react";

import { auth } from "#/integrations/tanstack-query/api-auth.functions";
import {
  NEEDS_BLOCK_SCOPE,
  blocksApi,
} from "#/integrations/tanstack-query/api-blocks.functions";

/**
 * "Block" in the author overflow menu.
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
 */
export function BlockUserMenuItem({
  did,
  name,
  iconSize = 14,
}: {
  did: string;
  name?: string | null;
  iconSize?: number;
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

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
      setConfirming(false);
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
    // the menu closes, the spinner stops, and the account is still there.
    onError: () => {
      setConfirming(false);
      toasts.add({
        description: t`We couldn't write the block to your account. Try again?`,
        title: t`Something went wrong`,
      });
    },
  });

  return (
    <>
      <MenuItem
        onPress={() => setConfirming(true)}
        suffix={<Ban size={iconSize} />}
        textValue={name ? t`Block ${name}` : t`Block account`}
      >
        <Trans>Block</Trans>
      </MenuItem>
      {/*
        Confirmed, not immediate. Blocking is one press away from Share and Copy
        link in the same menu, but unlike them it writes a public record to the
        reader's repo that every AT Protocol app honours — and this menu offers
        no way back, because the profile it lives on turns into a block notice.
        A mis-tap should not be able to do that silently.
      */}
      <AlertDialog
        trigger={null}
        isOpen={confirming}
        onOpenChange={(open) => {
          if (!open && !block.isPending) setConfirming(false);
        }}
      >
        <AlertDialogHeader>
          {name ? <Trans>Block {name}?</Trans> : <Trans>Block account?</Trans>}
        </AlertDialogHeader>
        <AlertDialogDescription>
          <Trans>
            This writes a block to your Bluesky account, so it applies here and
            anywhere else you use it. Their writing disappears from your feeds,
            search and discussion, and they can't see yours. You can undo it in
            Settings → Blocked accounts.
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
    </>
  );
}
