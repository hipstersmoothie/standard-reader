"use client";

import { Plural, Trans } from "@lingui/react/macro";

import {
  AlertDialog,
  AlertDialogActionButton,
  AlertDialogCancelButton,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
} from "../../design-system/alert-dialog";
import { Button } from "../../design-system/button";

/**
 * The destructive action in the `/subscriptions` selection bar, and its
 * confirmation. The trigger lives here (rather than in the bar) so react-aria
 * owns the trigger↔dialog relationship and focus returns to the button on
 * dismiss.
 *
 * The selection can mix publications and people, and those are different graph
 * edges with different consequences (unfollowing a person also tears down the
 * subscriptions that follow created), so the copy names both counts rather than
 * flattening them into "N items".
 */
export function UnsubscribeConfirmDialog({
  isOpen,
  onOpenChange,
  publicationCount,
  peopleCount,
  isDisabled,
  isPending,
  onConfirm,
  size = "sm",
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  publicationCount: number;
  peopleCount: number;
  isDisabled: boolean;
  isPending: boolean;
  onConfirm: () => void;
  /** Size of the trigger button, so it matches the toolbar it sits in. */
  size?: "sm" | "md" | "lg";
}) {
  const mixed = publicationCount > 0 && peopleCount > 0;
  const actionLabel =
    peopleCount === 0 ? (
      <Trans>Unsubscribe</Trans>
    ) : publicationCount === 0 ? (
      <Trans>Unfollow</Trans>
    ) : (
      <Trans>Remove</Trans>
    );

  return (
    <AlertDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      trigger={
        <Button
          size={size}
          variant="critical-outline"
          isDisabled={isDisabled}
          onPress={() => onOpenChange(true)}
        >
          {actionLabel}
        </Button>
      }
    >
      {/* Short enough to stay on one line in the dialog — the counts are the
          description's job, not the header's. */}
      <AlertDialogHeader>
        {peopleCount === 0 ? (
          <Trans>Unsubscribe?</Trans>
        ) : publicationCount === 0 ? (
          <Trans>Unfollow?</Trans>
        ) : (
          <Trans>Remove these?</Trans>
        )}
      </AlertDialogHeader>
      <AlertDialogDescription>
        {mixed ? (
          <Trans>
            This unsubscribes from{" "}
            <Plural
              value={publicationCount}
              one="# publication"
              other="# publications"
            />{" "}
            and unfollows{" "}
            <Plural value={peopleCount} one="# person" other="# people" />.
            Their articles leave your feed, and unfollowing someone also drops
            the subscriptions that follow created. You can subscribe again at
            any time.
          </Trans>
        ) : peopleCount === 0 ? (
          <Trans>
            Unsubscribing from{" "}
            <Plural
              value={publicationCount}
              one="this publication"
              other="these # publications"
            />{" "}
            stops their articles appearing in your feed. Nothing you have saved,
            read, or recommended is affected, and you can subscribe again at any
            time.
          </Trans>
        ) : (
          <Trans>
            Unfollowing{" "}
            <Plural
              value={peopleCount}
              one="this person"
              other="these # people"
            />{" "}
            also drops the subscriptions that follow created, so their
            publications leave your feed. Nothing you have saved, read, or
            recommended is affected.
          </Trans>
        )}
      </AlertDialogDescription>
      <AlertDialogFooter>
        <AlertDialogCancelButton isDisabled={isPending}>
          <Trans>Cancel</Trans>
        </AlertDialogCancelButton>
        <AlertDialogActionButton
          variant="critical"
          closeOnPress={false}
          isPending={isPending}
          onPress={onConfirm}
        >
          {actionLabel}
        </AlertDialogActionButton>
      </AlertDialogFooter>
    </AlertDialog>
  );
}
