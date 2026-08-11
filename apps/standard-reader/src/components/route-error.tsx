"use client";

import { Trans } from "@lingui/react/macro";
import { Button } from "@standard-reader/design-system/button";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateImage,
  EmptyStateTitle,
} from "@standard-reader/design-system/empty-state";
import { size } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";
import { CloudOff, RotateCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useOnlineStatus } from "#/lib/use-online-status";

/**
 * What every route renders when its loader throws.
 *
 * Offline is the common case worth naming. The service worker keeps unread
 * articles on the device, so a reader offline in the app usually gets real
 * pages — but reaching for something that was never stored used to surface the
 * router's raw error text, which says nothing about why. Being explicit that
 * the page was never downloaded is the difference between "the app is broken"
 * and "this one wasn't saved".
 *
 * Retrying re-runs **only the failed route's loader**, and only when there is a
 * connection to retry with. A bare `router.invalidate()` re-runs every match
 * including the root and layout; offline those reject too, the error escapes
 * past this boundary to the root, and the whole app — navbar and all — is
 * replaced by an error screen that only quitting the app recovers from. So the
 * retry is scoped, and offline it is not offered at all: there is nothing to
 * retry until the connection is back, and the page reloads itself when it is.
 *
 * A full document reload is never used: inside an installed app that risks a
 * cold start with no network, which is strictly worse than staying put.
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const online = useOnlineStatus();
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);

  const retry = useCallback(() => {
    setRetrying(true);
    // The deepest match is the one that threw. Its parents — root and layout —
    // are what render the navbar, and re-running them offline is what replaced
    // the entire app with an error screen.
    const leafMatchId = router.state.matches.at(-1)?.id;
    void router
      .invalidate({
        filter: (match) => match.id === leafMatchId,
      })
      .catch(() => {})
      .finally(() => {
        setRetrying(false);
        reset();
      });
  }, [reset, router]);

  // Recover when the connection comes back. Only on the offline → online
  // transition, never on mount: an error that reproduces would otherwise retry,
  // re-throw, remount this component and retry again, forever.
  const wasOffline = useRef(false);
  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    retry();
  }, [online, retry]);

  return (
    <EmptyState>
      <EmptyStateImage>
        <CloudOff size={size["lg"]} strokeWidth={1.5} aria-hidden />
      </EmptyStateImage>
      <EmptyStateTitle>
        {online ? (
          <Trans>Something went wrong</Trans>
        ) : (
          <Trans>You’re offline</Trans>
        )}
      </EmptyStateTitle>
      <EmptyStateDescription>
        {online ? (
          <Trans>
            That page didn’t load. Try again — if it keeps happening, it’s on
            our side.
          </Trans>
        ) : (
          <Trans>
            This page wasn’t saved to your device, so it needs a connection.
            It’ll load on its own when you’re back online — your unread articles
            are already here.
          </Trans>
        )}
      </EmptyStateDescription>
      {/* No retry offered offline: there is nothing to retry until the
          connection returns, and the effect above loads the page the moment it
          does. */}
      {online ? (
        <EmptyStateActions>
          <Button
            variant="secondary"
            size="sm"
            isDisabled={retrying}
            onPress={retry}
          >
            <RotateCw size={14} strokeWidth={2} aria-hidden />{" "}
            <Trans>Try again</Trans>
          </Button>
        </EmptyStateActions>
      ) : null}
      {/* The message is for us, not the reader — but hiding it entirely makes
          a bug report a guessing game, so keep it out of the way. */}
      {online && error instanceof Error && error.message ? (
        <EmptyStateDescription>
          <small>{error.message}</small>
        </EmptyStateDescription>
      ) : null}
    </EmptyState>
  );
}
