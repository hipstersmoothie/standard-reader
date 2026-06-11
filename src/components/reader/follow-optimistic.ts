import type { QueryClient } from "@tanstack/react-query";

import type {
  FollowingPublication,
  SidebarData,
} from "../../integrations/tanstack-query/api-feed.functions";
import type { FollowStatus } from "../../integrations/tanstack-query/api-reader.functions";
import type { PublicationCard } from "../../integrations/tanstack-query/api-shapes";

import { sortFollowingPublications } from "../../integrations/tanstack-query/api-shapes";

export interface FollowOptimisticContext {
  prevFollow: FollowStatus | undefined;
  /** Optimistic direction applied to the sidebar for this publication. */
  following: boolean;
  /** Captured when unfollowing so rollback can restore the removed row. */
  removedPub?: FollowingPublication;
}

function updateSidebarFollowing(
  sidebar: SidebarData,
  publicationUri: string,
  following: boolean,
  pub?: PublicationCard,
): { sidebar: SidebarData; removedPub?: FollowingPublication } {
  const current = sidebar.following ?? [];

  if (following) {
    return {
      sidebar: {
        ...sidebar,
        following: sortFollowingPublications([
          ...current.filter((item) => item.uri !== publicationUri),
          ...(pub ? [{ ...pub, unreadCount: 0 }] : []),
        ]),
      },
    };
  }

  const removedPub = current.find((item) => item.uri === publicationUri);
  return {
    sidebar: {
      ...sidebar,
      following: current.filter((item) => item.uri !== publicationUri),
    },
    removedPub,
  };
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
  let removedPub: FollowingPublication | undefined;

  queryClient.setQueryData<FollowStatus>(followKey, { isFollowing: following });

  queryClient.setQueryData<SidebarData>(sidebarKey, (prevSidebar) => {
    if (!prevSidebar) return prevSidebar;
    const next = updateSidebarFollowing(
      prevSidebar,
      publicationUri,
      following,
      pub,
    );
    removedPub = next.removedPub;
    return next.sidebar;
  });

  return { prevFollow, following, removedPub };
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

  queryClient.setQueryData<SidebarData>(sidebarKey, (sidebar) => {
    if (!sidebar) return sidebar;

    if (context.following) {
      return {
        ...sidebar,
        following: sidebar.following.filter(
          (item) => item.uri !== publicationUri,
        ),
      };
    }

    if (!context.removedPub) return sidebar;
    if (sidebar.following.some((item) => item.uri === publicationUri)) {
      return sidebar;
    }

    return {
      ...sidebar,
      following: sortFollowingPublications([
        ...sidebar.following,
        context.removedPub,
      ]),
    };
  });
}

export function invalidateFollowQueries(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ["feed"] });
  void queryClient.invalidateQueries({ queryKey: ["discover"] });
}

export interface BulkFollowOptimisticContext {
  entries: Array<{
    publicationUri: string;
    prevFollow: FollowStatus | undefined;
  }>;
}

/** Optimistically mark many publications as followed (e.g. tag "follow all"). */
export function applyBulkFollowOptimisticUpdate(
  queryClient: QueryClient,
  publications: Array<PublicationCard>,
): BulkFollowOptimisticContext {
  const sidebarKey = ["feed", "sidebar"] as const;
  const entries: BulkFollowOptimisticContext["entries"] = [];

  for (const pub of publications) {
    const followKey = ["reader", "followStatus", pub.uri] as const;
    entries.push({
      publicationUri: pub.uri,
      prevFollow: queryClient.getQueryData<FollowStatus>(followKey),
    });
    queryClient.setQueryData<FollowStatus>(followKey, { isFollowing: true });
  }

  if (publications.length > 0) {
    queryClient.setQueryData<SidebarData>(sidebarKey, (prevSidebar) => {
      if (!prevSidebar) return prevSidebar;

      const current = prevSidebar.following ?? [];
      const byUri = new Map(current.map((item) => [item.uri, item]));
      for (const pub of publications) {
        byUri.set(pub.uri, {
          ...pub,
          unreadCount: byUri.get(pub.uri)?.unreadCount ?? 0,
        });
      }

      return {
        ...prevSidebar,
        following: sortFollowingPublications([...byUri.values()]),
      };
    });
  }

  return { entries };
}

export function rollbackBulkFollowOptimisticUpdate(
  queryClient: QueryClient,
  context: BulkFollowOptimisticContext,
) {
  const sidebarKey = ["feed", "sidebar"] as const;
  const uris = new Set(context.entries.map((entry) => entry.publicationUri));

  for (const { publicationUri, prevFollow } of context.entries) {
    const followKey = ["reader", "followStatus", publicationUri] as const;
    if (prevFollow) {
      queryClient.setQueryData(followKey, prevFollow);
    } else {
      queryClient.removeQueries({ queryKey: followKey });
    }
  }

  queryClient.setQueryData<SidebarData>(sidebarKey, (sidebar) => {
    if (!sidebar) return sidebar;
    return {
      ...sidebar,
      following: sidebar.following.filter((item) => !uris.has(item.uri)),
    };
  });
}
