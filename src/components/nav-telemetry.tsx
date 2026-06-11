"use client";

import { useRouterState } from "@tanstack/react-router";
import { telemetryApi } from "#/integrations/tanstack-query/api-telemetry.functions";
import { useEffect, useRef } from "react";

/**
 * Emits client-side navigation timing to Honeycomb (via `recordClientEvent`).
 * Complements server-fn `observe()` spans — measures perceived route transitions.
 */
export function NavTelemetry() {
  const isLoading = useRouterState({ select: (s) => s.isLoading });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pendingRef = useRef<{ pathname: string; start: number } | null>(null);

  useEffect(() => {
    if (isLoading) {
      if (!pendingRef.current) {
        pendingRef.current = {
          pathname,
          start: performance.now(),
        };
      }
      return;
    }

    const pending = pendingRef.current;
    if (!pending) {
      return;
    }

    pendingRef.current = null;
    const ms = Math.round(performance.now() - pending.start);
    if (ms < 0) {
      return;
    }

    void telemetryApi
      .recordClientEvent({
        data: {
          name: "nav.transition",
          attrs: {
            ms,
            pathname: pending.pathname,
            ok: true,
          },
        },
      })
      .catch(() => {
        // Telemetry must never break navigation.
      });
  }, [isLoading, pathname]);

  return null;
}
