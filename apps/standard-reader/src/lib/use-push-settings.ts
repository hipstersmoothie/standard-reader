import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { pushApi } from "#/integrations/tanstack-query/api-push.functions";
import {
  currentPushSubscription,
  ensurePushDevice,
  notificationsBlocked,
  pushCapability,
  removePushDevice,
} from "#/pwa/push";
import type { PushCapability } from "#/pwa/push";

/**
 * State for the Notifications section of settings: whether *this* browser is
 * registered, how many sources the reader has turned the bell on for, and the
 * two actions (enable here / turn off everywhere).
 *
 * Capability and endpoint are resolved in an effect rather than during render —
 * both are browser-only, and reading them during SSR would either throw or
 * produce a hydration mismatch. Until the effect runs, capability is `null`,
 * which the UI shows as "still working it out" rather than "unsupported".
 */
export interface PushSettings {
  /** `null` until resolved on the client. */
  capability: PushCapability | null;
  /** The reader has blocked notifications at the browser level. */
  blocked: boolean;
  /** This browser has an active, registered subscription. */
  deviceRegistered: boolean;
  /** Publications + authors the reader gets notifications for. */
  topicCount: number;
  /** Registered browsers across all of the reader's devices. */
  deviceCount: number;
  isPending: boolean;
  /** Subscribe this browser. Must be called from a user gesture. */
  enableOnThisDevice: () => Promise<void>;
  /** Unsubscribe this browser, leaving the opt-ins alone. */
  disableOnThisDevice: () => Promise<void>;
  /** Drop every device and every opt-in. */
  disableEverywhere: () => Promise<void>;
}

export function usePushSettings(): PushSettings {
  const queryClient = useQueryClient();
  const [capability, setCapability] = useState<PushCapability | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    setCapability(pushCapability());
    setBlocked(notificationsBlocked());
    void currentPushSubscription().then((subscription) => {
      setEndpoint(subscription?.endpoint ?? null);
    });
  }, []);

  const { data: status } = useQuery({
    ...pushApi.getPushStatusQueryOptions(endpoint),
    // Wait for the effect above; querying with a null endpoint first would just
    // be thrown away a tick later.
    enabled: capability !== null,
  });

  const disableAll = useMutation(pushApi.disableAllPushMutationOptions());

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["push", "status"] });
  }, [queryClient]);

  const enableOnThisDevice = useCallback(async () => {
    setIsPending(true);
    try {
      const result = await ensurePushDevice();
      if (result.status === "ready") {
        setEndpoint(result.endpoint);
      }
      setBlocked(result.status === "denied");
      await refresh();
    } finally {
      setIsPending(false);
    }
  }, [refresh]);

  const disableOnThisDevice = useCallback(async () => {
    setIsPending(true);
    try {
      await removePushDevice();
      setEndpoint(null);
      await refresh();
    } finally {
      setIsPending(false);
    }
  }, [refresh]);

  const disableEverywhere = useCallback(async () => {
    setIsPending(true);
    try {
      // Drop the browser-side subscription too, not just the rows — otherwise
      // the browser still holds a live endpoint we've forgotten about, and
      // re-enabling later would look like nothing happened.
      await removePushDevice().catch(() => {});
      await disableAll.mutateAsync();
      setEndpoint(null);
      // Every bell in the app is now off.
      await queryClient.invalidateQueries({ queryKey: ["push"] });
    } finally {
      setIsPending(false);
    }
  }, [disableAll, queryClient]);

  return {
    blocked,
    capability,
    deviceCount: status?.deviceCount ?? 0,
    deviceRegistered: status?.deviceRegistered ?? false,
    disableEverywhere,
    disableOnThisDevice,
    enableOnThisDevice,
    isPending: isPending || disableAll.isPending,
    topicCount: status?.topicCount ?? 0,
  };
}
