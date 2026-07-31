"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { MenuItem } from "@standard-reader/design-system/menu";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban } from "lucide-react";

import { auth } from "#/integrations/tanstack-query/api-auth.functions";
import {
  NEEDS_BLOCK_SCOPE,
  blocksApi,
} from "#/integrations/tanstack-query/api-blocks.functions";

/**
 * "Block" in the author overflow menu.
 *
 * Writes an `app.bsky.graph.block` record to the reader's own repo — the same
 * record Bluesky writes — so the block travels with them rather than being a
 * Standard Reader setting. There is no unblock counterpart here: once blocked,
 * the profile renders as the block itself (see `BlockedNotice`), which is where
 * undoing it belongs.
 *
 * Writing needs an OAuth scope the reader hasn't necessarily granted. Rather
 * than gate the item on it — which would hide the feature from everyone who
 * signed in before it existed — the first press runs the progressive upgrade
 * and returns here. Their *existing* blocks are enforced either way.
 */
export function BlockUserMenuItem({
  did,
  name,
  iconSize = 14,
}: {
  did: string;
  name?: string | null;
  iconSize?: number;
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();

  const block = useMutation({
    mutationFn: async () => {
      try {
        await blocksApi.blockAccount({ data: { did } });
        return { blocked: true as const };
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes(NEEDS_BLOCK_SCOPE)
        ) {
          const here = new URL(globalThis.location.href);
          const result = await auth.upgradeToBlocking({
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
      // A block changes feeds, search, discussion and this very page, so there
      // is no narrower key worth invalidating than everything.
      void queryClient.invalidateQueries();
    },
  });

  return (
    <MenuItem
      onPress={() => block.mutate()}
      suffix={<Ban size={iconSize} />}
      textValue={name ? t`Block ${name}` : t`Block account`}
    >
      <Trans>Block</Trans>
    </MenuItem>
  );
}
