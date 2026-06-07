import type { QueryClient } from "@tanstack/react-query";

import type { SidebarData } from "../../integrations/tanstack-query/api-feed.functions";
import type { FollowStatus } from "../../integrations/tanstack-query/api-reader.functions";
import type { PublicationCard } from "../../integrations/tanstack-query/api-shapes";

function sortFollowing(pubs: Array<PublicationCard>): Array<PublicationCard> {
  return pubs.toSorted((a, b) => a.name.localeCompare(b.name));
}

export interface FollowOptimisticContext {
  prevFollow: FollowStatus | undefined;
  prevSidebar: SidebarData | undefined;
}

/** Optimistically flip follow state in the React Query cache (sidebar + status). */
export function applyFollowOptimisticUpdate(
  queryClient: QueryClient,
  {
    publicationUri,
    pub,
    following,
  }: {
    publicationUri: string;
    pub?: PublicationCard;
    following: boolean;
  },
): FollowOptimisticContext {
  const followKey = ["reader", "followStatus", publicationUri] as const;
  const sidebarKey = ["feed", "sidebar"] as const;

  const prevFollow = queryClient.getQueryData<FollowStatus>(followKey);
  const prevSidebar = queryClient.getQueryData<SidebarData>(sidebarKey);

  queryClient.setQueryData<FollowStatus>(followKey, { isFollowing: following });

  if (prevSidebar) {
    const current = prevSidebar.following ?? [];
    const nextFollowing = following
      ? sortFollowing([
          ...current.filter((item) => item.uri !== publicationUri),
          ...(pub ? [pub] : []),
        ])
      : current.filter((item) => item.uri !== publicationUri);

    queryClient.setQueryData<SidebarData>(sidebarKey, {
      ...prevSidebar,
      following: nextFollowing,
    });
  }

  return { prevFollow, prevSidebar };
}

export function rollbackFollowOptimisticUpdate(
  queryClient: QueryClient,
  publicationUri: string,
  context: FollowOptimisticContext,
) {
  const followKey = ["reader", "followStatus", publicationUri] as const;
  const sidebarKey = ["feed", "sidebar"] as const;

  if (context.prevFollow) {
    queryClient.setQueryData(followKey, context.prevFollow);
  } else {
    queryClient.removeQueries({ queryKey: followKey });
  }

  if (context.prevSidebar) {
    queryClient.setQueryData(sidebarKey, context.prevSidebar);
  }
}

export function invalidateFollowQueries(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ["feed"] });
  void queryClient.invalidateQueries({ queryKey: ["discover"] });
}
