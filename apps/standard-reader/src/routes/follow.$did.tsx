import { useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import type { FollowCardPhase } from "#/components/reader/follow-card";
import { FollowCard } from "#/components/reader/follow-card";
import { authorApi } from "#/integrations/tanstack-query/api-author.functions";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";

export const Route = createFileRoute("/follow/$did")({
  beforeLoad: async ({ context, params }) => {
    const session = await context.queryClient.ensureQueryData(
      user.getSessionQueryOptions,
    );
    if (!session?.user) {
      throw redirect({
        to: "/follow-login/$did",
        params: { did: params.did },
      });
    }
  },
  loader: async ({ context, params }) => {
    const [meta] = await Promise.all([
      context.queryClient.ensureQueryData(
        authorApi.getAuthorEmbedMetaQueryOptions(params.did),
      ),
      context.queryClient.ensureQueryData(user.getSessionQueryOptions),
    ]);
    if (!meta) {
      throw notFound();
    }
    return { meta };
  },
  head: ({ loaderData }) => {
    const meta = loaderData?.meta;
    const name = meta?.displayName ?? meta?.handle ?? null;
    return {
      meta: [
        { title: name ? `Follow ${name}` : "Follow" },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: FollowPage,
});

function FollowPage() {
  const { meta } = Route.useLoaderData();
  const authorDid = meta.did;

  useSuspenseQuery(authorApi.getAuthorEmbedMetaQueryOptions(authorDid));

  const { data: session } = useQuery(user.getSessionQueryOptions);
  const { data: followStatus, isFetched: followStatusReady } = useQuery(
    readerApi.getUserFollowStatusQueryOptions(authorDid),
  );

  const { mutate: followUser } = useMutation(
    readerApi.followUserMutationOptions(),
  );
  const followStarted = useRef(false);
  const [outcome, setOutcome] = useState<"idle" | "success">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Following yourself is rejected by the write path, so treat the author's own
  // visit as settled rather than firing a mutation that can only fail.
  const isSelf = session?.user?.did === authorDid;

  const phase: FollowCardPhase = isSelf
    ? "self"
    : followStatusReady
      ? followStatus?.isFollowing
        ? "already"
        : outcome === "success"
          ? "success"
          : "following"
      : "following";

  useEffect(() => {
    if (isSelf) return;
    if (!followStatusReady) return;
    if (followStatus?.isFollowing) return;
    if (followStarted.current) return;

    followStarted.current = true;
    followUser(authorDid, {
      onSuccess: () => {
        setOutcome("success");
      },
      onError: () => {
        followStarted.current = false;
        setErrorMessage("Couldn't follow. Try again from the profile.");
      },
    });
  }, [
    isSelf,
    followStatusReady,
    followStatus?.isFollowing,
    authorDid,
    followUser,
  ]);

  return (
    <FollowCard
      meta={meta}
      phase={phase}
      shell="page"
      errorMessage={errorMessage ?? undefined}
    />
  );
}
