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
import { useRouter } from "@tanstack/react-router";
import { CloudOff, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Whether the browser currently reports a connection.
 *
 * Deliberately starts `true` and corrects after mount: reading `navigator` while
 * rendering on the server would be a hydration mismatch, and an error boundary
 * claiming "you're offline" on a server-rendered page would be wrong anyway.
 */
function useIsOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(globalThis.navigator?.onLine !== false);
    sync();
    globalThis.addEventListener?.("online", sync);
    globalThis.addEventListener?.("offline", sync);
    return () => {
      globalThis.removeEventListener?.("online", sync);
      globalThis.removeEventListener?.("offline", sync);
    };
  }, []);

  return online;
}

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
 * The button re-runs the failed loader rather than reloading the document: a
 * full reload inside an installed app risks a cold start with no network at
 * all, which is strictly worse than staying where you are.
 */
export function RouteError({ error }: { error: unknown }) {
  const online = useIsOnline();
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);

  const retry = () => {
    setRetrying(true);
    void router.invalidate().finally(() => setRetrying(false));
  };

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
            This page hasn’t been saved to your device, so it needs a
            connection. Articles you haven’t read yet are downloaded
            automatically and stay available offline.
          </Trans>
        )}
      </EmptyStateDescription>
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
