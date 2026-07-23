import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import type { LocaleHintState } from "#/integrations/tanstack-query/api-user.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";

export interface LocaleHintContextValue {
  /**
   * Whether the one-time language indicator should be shown: the reader has
   * neither explicitly chosen a language nor already seen the indicator.
   * `undefined` until the seeded query resolves — treat as "don't show yet".
   */
  shouldShow: boolean;
  /** Persist that the indicator has been shown so it never appears again. */
  markSeen: () => void;
}

/**
 * Client access to the one-time language-indicator state. State is seeded into
 * the cache by `getShellBootstrap` (root loader), so the first render already
 * knows whether to show the indicator — no request waterfall.
 *
 * `markSeen` optimistically flips the cached state and best-effort persists it
 * (cookie for guests, `user.locale_hint_seen` when signed in). It's called as
 * soon as the indicator is shown, guaranteeing it only ever appears once.
 */
export function useLocaleHint(): LocaleHintContextValue {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    ...user.getLocaleHintQueryOptions,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const markSeenMutation = useMutation({
    mutationFn: async () => user.dismissLocaleHint(),
    onMutate: () => {
      queryClient.setQueryData<LocaleHintState>(
        user.getLocaleHintQueryOptions.queryKey,
        (current) => ({ explicit: current?.explicit ?? false, seen: true }),
      );
    },
  });

  const markSeen = useCallback(() => {
    if (data?.seen) return;
    markSeenMutation.mutate();
  }, [data?.seen, markSeenMutation]);

  return {
    shouldShow: data ? !data.seen && !data.explicit : false,
    markSeen,
  };
}
