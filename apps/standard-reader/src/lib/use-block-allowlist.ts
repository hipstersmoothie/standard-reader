import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { AllowlistAddResponse } from "#/integrations/tanstack-query/api-blocks.functions";
import { blocksApi } from "#/integrations/tanstack-query/api-blocks.functions";

/**
 * Add an account to the reader's block allowlist — "show them here anyway".
 *
 * `actor` is a handle or a DID. Resolves to the server's answer rather than
 * throwing for the expected refusals (unknown handle, yourself, list full), so
 * the caller can say which one in words.
 *
 * On success every query is invalidated: an exemption reaches feeds, search,
 * discussion, profiles and publication pages alike, exactly as a block does, so
 * there is no narrower key to drop.
 */
export function useAllowBlockedAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (actor: string): Promise<AllowlistAddResponse> =>
      blocksApi.allowBlockedAccount({ data: { actor } }),
    onSuccess: (result) => {
      if (result.ok) void queryClient.invalidateQueries();
    },
  });
}

/**
 * Take an account off the allowlist, so the reader's blocks apply to it again.
 *
 * Callbacks are hook-level rather than per-`mutate` on purpose: the menu item
 * that calls this unmounts the moment it is pressed (the menu closes), and
 * per-call callbacks don't fire for an unmounted caller — a failure would
 * vanish silently.
 */
export function useDisallowBlockedAccount({
  onSuccess,
  onError,
}: { onSuccess?: () => void; onError?: () => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (did: string) =>
      blocksApi.disallowBlockedAccount({ data: { did } }),
    onSuccess: () => {
      void queryClient.invalidateQueries();
      onSuccess?.();
    },
    onError: () => onError?.(),
  });
}
