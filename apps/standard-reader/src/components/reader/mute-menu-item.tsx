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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Volume2, VolumeX } from "lucide-react";

import { auth } from "#/integrations/tanstack-query/api-auth.functions";
import {
  NEEDS_MUTE_SCOPE,
  mutesApi,
} from "#/integrations/tanstack-query/api-mutes.functions";

/** What kind of subject the mute targets — labels and copy differ. */
export type MuteSubjectKind = "user" | "publication";

/**
 * "Mute" / "Unmute" in the author and publication overflow menus, and the
 * confirmation the mute direction opens.
 *
 * Writes an `app.standard-reader.graph.mute` record to the reader's own repo.
 * A mute hides the subject from the reader's feeds and discovery only — direct
 * navigation still works and subscriptions are untouched — which is why, unlike
 * blocking, the same menu can offer the undo: the page it lives on stays
 * reachable.
 *
 * Muting confirms first (it's one press away from Share in the same menu and
 * quietly rewrites every feed); unmuting is a pure restore, so it runs
 * immediately.
 *
 * Writing may need a re-auth for sessions that predate the mute collection in
 * the `authBasicFeatures` permission set. Rather than gate the item, the first
 * press runs the progressive upgrade and returns here (the `BlockUserMenuItem`
 * pattern).
 *
 * **The item and the dialog are two components on purpose.** `Menu` renders its
 * children inside the trigger's `Popover`, so a dialog returned alongside the
 * `MenuItem` mounts *inside* the menu — and pressing the item closes the menu,
 * which unmounts the dialog in the same frame. The dialog has to be a sibling
 * of `<Menu>` (see `BlockUserDialog`).
 */
export function MuteMenuItem({
  subject,
  name,
  iconSize = 14,
  onOpenDialog,
}: {
  /** A user DID or a publication AT-URI — the mute record's subject. */
  subject: string;
  name?: string | null;
  iconSize?: number;
  /** Opens {@link MuteDialog}, which the menu's parent renders as a sibling. */
  onOpenDialog: () => void;
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const { data: state } = useQuery(mutesApi.getMuteStateQueryOptions(subject));
  const isMuted = state?.muted ?? false;

  const unmute = useMutation({
    mutationFn: async () => mutesApi.unmuteSubject({ data: { subject } }),
    onSuccess: () => {
      toasts.add({
        description: name
          ? t`${name} will show up in your feeds again.`
          : t`They'll show up in your feeds again.`,
        title: t`Unmuted`,
      });
      // A mute changes every feed and discovery surface — no narrower key.
      void queryClient.invalidateQueries();
    },
    onError: () => {
      toasts.add({
        description: t`We couldn't remove the mute from your account. Try again?`,
        title: t`Something went wrong`,
      });
    },
  });

  if (isMuted) {
    return (
      <MenuItem
        onPress={() => unmute.mutate()}
        suffix={<Volume2 size={iconSize} />}
        textValue={name ? t`Unmute ${name}` : t`Unmute`}
      >
        <Trans>Unmute</Trans>
      </MenuItem>
    );
  }
  return (
    <MenuItem
      onPress={onOpenDialog}
      suffix={<VolumeX size={iconSize} />}
      textValue={name ? t`Mute ${name}` : t`Mute`}
    >
      <Trans>Mute</Trans>
    </MenuItem>
  );
}

/**
 * The confirmation for {@link MuteMenuItem}'s mute direction. Render outside
 * `<Menu>`.
 */
export function MuteDialog({
  subject,
  kind,
  name,
  isOpen,
  onOpenChange,
}: {
  subject: string;
  kind: MuteSubjectKind;
  name?: string | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();

  const mute = useMutation({
    mutationFn: async () => {
      try {
        await mutesApi.muteSubject({ data: { subject } });
        return { muted: true as const };
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes(NEEDS_MUTE_SCOPE)
        ) {
          const here = new URL(globalThis.location.href);
          const result = await auth.upgradeToMuting({
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
      // Muting is scoped, and the copy must say so: subscriptions and direct
      // links keep working, and the undo lives in Settings → Muted.
      toasts.add({
        description: name
          ? t`${name} is hidden from your feeds and discovery. Subscriptions and direct links still work. Undo in Settings → Muted.`
          : t`It's hidden from your feeds and discovery. Subscriptions and direct links still work. Undo in Settings → Muted.`,
        title: t`Muted`,
      });
      // A mute changes every feed and discovery surface — no narrower key.
      void queryClient.invalidateQueries();
    },
    // Without this a failed write is indistinguishable from a successful one.
    onError: () => {
      onOpenChange(false);
      toasts.add({
        description: t`We couldn't write the mute to your account. Try again?`,
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
        if (!open && mute.isPending) return;
        onOpenChange(open);
      }}
    >
      <AlertDialogHeader>
        {name ? <Trans>Mute {name}?</Trans> : <Trans>Mute?</Trans>}
      </AlertDialogHeader>
      <AlertDialogDescription>
        {kind === "publication" ? (
          <Trans>
            This publication's articles are hidden from your feeds, search and
            discovery — but only in Standard Reader. This writes a public record
            to your atproto account, but unlike a block, Bluesky and other apps
            don't enforce it. Your subscription is untouched and you can still
            visit the publication directly. Undo in Settings → Muted.
          </Trans>
        ) : (
          <Trans>
            Their articles, publications and recommendations are hidden from
            your feeds, search and discovery — but only in Standard Reader. This
            writes a public record to your atproto account, but unlike a block,
            Bluesky and other apps don't enforce it. Your subscriptions are
            untouched and you can still visit their pages directly. Undo in
            Settings → Muted.
          </Trans>
        )}
      </AlertDialogDescription>
      <AlertDialogFooter>
        <AlertDialogCancelButton>
          <Trans>Cancel</Trans>
        </AlertDialogCancelButton>
        <AlertDialogActionButton
          closeOnPress={false}
          isPending={mute.isPending}
          onPress={() => mute.mutate()}
        >
          <Trans>Mute</Trans>
        </AlertDialogActionButton>
      </AlertDialogFooter>
    </AlertDialog>
  );
}
