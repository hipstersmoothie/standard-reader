import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";

import { ButtonLink } from "#/components/router-links";
import { Button } from "#/design-system/button";
import type { FollowingUser } from "#/integrations/tanstack-query/api-feed.functions";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { useLoginSearch } from "#/utils/use-login-search";

import {
  applyUserFollowOptimisticUpdate,
  invalidateFollowQueries,
  rollbackUserFollowOptimisticUpdate,
} from "./follow-optimistic";

/**
 * Follow / Following toggle for a user (app.standard-reader.graph.follow).
 * Mirrors the publication {@link FollowButton}: reads status from React Query,
 * writes optimistically to the status + sidebar caches, and routes signed-out
 * readers to /login. Never rendered on the reader's own profile.
 */
export function FollowUserButton({
  did,
  signedIn,
  user,
  size = "md",
}: {
  did: string;
  signedIn: boolean;
  /** Byline for the optimistic sidebar "People" row (handle / name / avatar). */
  user?: FollowingUser;
  size?: "sm" | "md";
}) {
  const queryClient = useQueryClient();
  const loginSearch = useLoginSearch();
  const { data: followStatus } = useQuery({
    ...readerApi.getUserFollowStatusQueryOptions(did),
    enabled: signedIn,
  });
  const following = followStatus?.isFollowing ?? false;
  const followMutation = useMutation(readerApi.followUserMutationOptions());
  const unfollowMutation = useMutation(readerApi.unfollowUserMutationOptions());

  const iconSize = size === "md" ? 18 : 15;
  const icon = following ? (
    <Check size={iconSize} aria-hidden />
  ) : (
    <Plus size={iconSize} aria-hidden />
  );

  if (!signedIn) {
    return (
      <ButtonLink
        to="/login"
        search={loginSearch}
        variant="secondary"
        size={size}
      >
        {icon} Follow
      </ButtonLink>
    );
  }

  const onPress = () => {
    const next = !following;
    const mutation = next ? followMutation : unfollowMutation;
    const optimistic = applyUserFollowOptimisticUpdate(queryClient, {
      did,
      user,
      following: next,
    });
    mutation.mutate(did, {
      onError: () => {
        rollbackUserFollowOptimisticUpdate(queryClient, did, optimistic);
        // A reader whose OAuth session predates the graph.follow scope fails
        // here with a ScopeMissingError; the global mutation cache
        // (query-client.ts) surfaces the "reconnect your account" toast.
      },
      onSettled: () => invalidateFollowQueries(queryClient),
    });
  };

  return (
    <Button
      variant={following ? "secondary" : "primary"}
      size={size}
      onPress={onPress}
    >
      {icon}
      {following ? "Following" : "Follow"}
    </Button>
  );
}
