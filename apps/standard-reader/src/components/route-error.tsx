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
import * as stylex from "@stylexjs/stylex";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";
import { CloudOff, Home, RotateCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useOnlineStatus } from "#/lib/use-online-status";

const styles = stylex.create({
  viewportCenter: {
    // The error replaces a whole page, so it reads as the page — pinned to the
    // top of the content column it looked like a banner above missing content.
    // Short of the full viewport so the top bar doesn't push it into a scroll.
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
    minBlockSize: stylex.firstThatWorks("80dvh", "80vh"),
  },
});

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
 * There is always a way out, though — offline this rendered no actions at all,
 * which is defensible per-button and a dead end taken together. "Go home" is
 * unconditional, and reaches for a document load in the one case a client-side
 * navigation cannot help (see {@link RouteError} body).
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

  const goHome = useCallback(() => {
    // A client-side navigation to `/` is a no-op when `/` is *itself* the route
    // that failed, which is exactly the dead end this button exists for. A
    // document load isn't a fallback there, it's the better path: the `pages`
    // cache holds `/` with its data dehydrated into the HTML, so it renders
    // offline without needing anything from the data cache.
    if (router.state.location.pathname === "/") {
      globalThis.location.assign("/");
      return;
    }
    void router.navigate({ to: "/" }).catch(() => {
      globalThis.location.assign("/");
    });
  }, [router]);

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
    <div {...stylex.props(styles.viewportCenter)}>
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
              It’ll load on its own when you’re back online — your unread
              articles are already here.
            </Trans>
          )}
        </EmptyStateDescription>
        <EmptyStateActions>
          {/* Always a way out. Offline this used to render no actions at all —
              correct in the narrow sense that retrying a page with no
              connection is pointless, and a dead end in practice: a reader who
              landed here had nothing to press and no route back to the
              articles that *are* on the device. */}
          <Button variant="primary" size="sm" onPress={goHome}>
            <Home size={14} strokeWidth={2} aria-hidden />{" "}
            <Trans>Go home</Trans>
          </Button>
          {/* No retry offline: nothing changes until the connection returns,
              and the effect above loads the page the moment it does. */}
          {online ? (
            <Button
              variant="secondary"
              size="sm"
              isDisabled={retrying}
              onPress={retry}
            >
              <RotateCw size={14} strokeWidth={2} aria-hidden />{" "}
              <Trans>Try again</Trans>
            </Button>
          ) : null}
        </EmptyStateActions>
        {/* The message is for us, not the reader — but hiding it entirely makes
          a bug report a guessing game, so keep it out of the way. */}
        {online && error instanceof Error && error.message ? (
          <EmptyStateDescription>
            <small>{error.message}</small>
          </EmptyStateDescription>
        ) : null}
      </EmptyState>
    </div>
  );
}
