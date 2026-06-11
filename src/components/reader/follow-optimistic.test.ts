import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import type { SidebarData } from "#/integrations/tanstack-query/api-feed.functions";
import type { PublicationCard } from "#/integrations/tanstack-query/api-shapes";

import {
  applyFollowOptimisticUpdate,
  rollbackFollowOptimisticUpdate,
} from "./follow-optimistic";

function makePub(uri: string, name: string): PublicationCard {
  return {
    uri,
    did: `did:plc:${name}`,
    name,
    url: `https://example.com/${name}`,
    description: null,
    iconUrl: null,
    ownerAvatarUrl: null,
    ownerHandle: null,
    topic: null,
    verified: false,
    subscriberCount: 0,
    documentCount: 0,
    lastDocumentAt: null,
  };
}

const emptySidebar: SidebarData = {
  signedIn: true,
  hasFollows: false,
  following: [],
  unreadCount: 0,
  savedCount: 0,
};

describe("follow optimistic sidebar updates", () => {
  it("composes concurrent follow updates", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["feed", "sidebar"], emptySidebar);

    const pubA = makePub("at://a", "Alpha");
    const pubB = makePub("at://b", "Beta");

    applyFollowOptimisticUpdate(queryClient, {
      publicationUri: pubA.uri,
      pub: pubA,
      following: true,
    });
    applyFollowOptimisticUpdate(queryClient, {
      publicationUri: pubB.uri,
      pub: pubB,
      following: true,
    });

    const sidebar = queryClient.getQueryData<SidebarData>(["feed", "sidebar"]);
    expect(sidebar?.following.map((item) => item.uri).toSorted()).toEqual([
      pubA.uri,
      pubB.uri,
    ]);
  });

  it("rolls back one failed follow without clobbering others", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["feed", "sidebar"], emptySidebar);

    const pubA = makePub("at://a", "Alpha");
    const pubB = makePub("at://b", "Beta");

    const contextA = applyFollowOptimisticUpdate(queryClient, {
      publicationUri: pubA.uri,
      pub: pubA,
      following: true,
    });
    applyFollowOptimisticUpdate(queryClient, {
      publicationUri: pubB.uri,
      pub: pubB,
      following: true,
    });

    rollbackFollowOptimisticUpdate(queryClient, pubA.uri, contextA);

    const sidebar = queryClient.getQueryData<SidebarData>(["feed", "sidebar"]);
    expect(sidebar?.following.map((item) => item.uri)).toEqual([pubB.uri]);
  });
});
