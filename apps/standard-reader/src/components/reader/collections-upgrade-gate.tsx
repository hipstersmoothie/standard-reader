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
import { useMutation } from "@tanstack/react-query";
import { Layers } from "lucide-react";

import { auth } from "#/integrations/tanstack-query/api-auth.functions";

import { Masthead, ReaderContent } from "./primitives";

/**
 * Upgrade gate for collections authoring. Renders when the signed-in reader
 * has not actually accepted the collections-authoring OAuth scope (as recorded
 * in `account.scope` on the last callback). The gate checks the *granted* scope,
 * not the `collectionsAuthoringEnabled` opt-in flag, because the flag is set
 * optimistically in `upgradeToCollections` before the re-auth completes — the
 * granted scope is the source of truth for "the PDS has authorized this".
 *
 * Readers who already have collections but a missing/stale grant (e.g. consent
 * revoked on the PDS, or the flag was set but re-auth never finished) are
 * re-prompted here instead of being sent to a builder whose writes will fail.
 */

function useUpgradeMutation(redirect: string) {
  return useMutation({
    mutationFn: async () => {
      const result = await auth.upgradeToCollections({ data: { redirect } });
      globalThis.location.href = result.authorizationUrl;
    },
  });
}

/**
 * The upgrade AlertDialog body — header, description, and footer with the
 * "Not now" / "Upgrade permissions" actions. Used by both the full-page gate
 * and the modal overlay.
 */
export function CollectionsUpgradeDialogBody({
  redirect,
}: {
  redirect: string;
}) {
  const upgradeMutation = useUpgradeMutation(redirect);
  return (
    <>
      <AlertDialogHeader>
        <Trans>Upgrade permissions</Trans>
      </AlertDialogHeader>
      <AlertDialogDescription>
        <Trans>
          Standard Reader needs write access to your site.standard publications
          and documents, plus your collection records, to author Collections.
          You'll be asked to approve this on your PDS login.
        </Trans>
      </AlertDialogDescription>
      <AlertDialogFooter>
        <AlertDialogCancelButton>
          <Trans>Not now</Trans>
        </AlertDialogCancelButton>
        <AlertDialogActionButton
          closeOnPress={false}
          isPending={upgradeMutation.isPending}
          onPress={() => upgradeMutation.mutate()}
        >
          <Trans>Upgrade permissions</Trans>
        </AlertDialogActionButton>
      </AlertDialogFooter>
    </>
  );
}

/**
 * Full-page upgrade gate — replaces the route's content with a masthead + an
 * always-open AlertDialog. Used by `/collections/new` and
 * `/collections/edit/$rkey`, where there is no useful content to show behind
 * the dialog (the builder would just fail on every write).
 */
export function CollectionsUpgradeGate({ redirect }: { redirect: string }) {
  const { t } = useLingui();
  return (
    <ReaderContent>
      <Masthead
        kicker={t`Collections`}
        kickerIcon={<Layers size={14} aria-hidden />}
        title={t`Upgrade to author Collections`}
        dek={t`Authoring Collections needs additional permissions to publish collections and documents on your behalf. You can revoke this any time from your account settings.`}
      />
      <AlertDialog trigger={null} isOpen>
        <CollectionsUpgradeDialogBody redirect={redirect} />
      </AlertDialog>
    </ReaderContent>
  );
}

/**
 * Modal-only upgrade overlay — renders just the AlertDialog (no masthead, no
 * ReaderContent wrapper) so it can layer over an existing page. Used by the
 * collections index (`/collections`) where readers with existing collections
 * should still see their list behind the prompt. The dialog is dismissible so
 * readers who only want to browse their collections can dismiss it; authoring
 * actions (new series, edit) re-trigger it via `CollectionsUpgradeGate`.
 */
export function CollectionsUpgradeOverlay({
  redirect,
  isOpen,
  onOpenChange,
}: {
  redirect: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AlertDialog trigger={null} isOpen={isOpen} onOpenChange={onOpenChange}>
      <CollectionsUpgradeDialogBody redirect={redirect} />
    </AlertDialog>
  );
}
