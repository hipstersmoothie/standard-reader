import { useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { publicationUriFromParams } from "#/components/reader/format";
import type { SubscribeCardPhase } from "#/components/reader/subscribe-card";
import { SubscribeCard } from "#/components/reader/subscribe-card";
import { publicationApi } from "#/integrations/tanstack-query/api-publication.functions";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/subscribe/$did/$rkey")({
  beforeLoad: async ({ context, params }) => {
    const session = await context.queryClient.ensureQueryData(
      user.getSessionQueryOptions,
    );
    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: {
          redirect: buildAuthRedirectPath(
            `/subscribe/${params.did}/${params.rkey}`,
          ),
          intent: "subscribe",
        },
      });
    }
  },
  loader: async ({ context, params }) => {
    const uri = publicationUriFromParams(params.did, params.rkey);
    const [meta] = await Promise.all([
      context.queryClient.ensureQueryData(
        publicationApi.getPublicationEmbedMetaQueryOptions(uri),
      ),
      context.queryClient.ensureQueryData(user.getSessionQueryOptions),
    ]);
    if (!meta) {
      throw notFound();
    }
    return { meta, publicationUri: uri };
  },
  head: ({ loaderData }) => {
    const name = loaderData?.meta.name;
    return {
      meta: [
        { title: name ? `Subscribe to ${name}` : "Subscribe" },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: SubscribePage,
});

function SubscribePage() {
  const { meta, publicationUri } = Route.useLoaderData();

  useSuspenseQuery(
    publicationApi.getPublicationEmbedMetaQueryOptions(publicationUri),
  );

  const { data: followStatus, isFetched: followStatusReady } = useQuery(
    readerApi.getFollowStatusQueryOptions(publicationUri),
  );

  const { mutate: followPublication } = useMutation(
    readerApi.followPublicationMutationOptions(),
  );
  const subscribeStarted = useRef(false);
  const [phase, setPhase] = useState<SubscribeCardPhase>("subscribing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!followStatusReady) {
      setPhase("subscribing");
      return;
    }

    if (followStatus?.isFollowing) {
      setPhase("already");
      return;
    }

    if (subscribeStarted.current) {
      setPhase("subscribing");
      return;
    }

    subscribeStarted.current = true;
    setErrorMessage(null);
    setPhase("subscribing");
    followPublication(publicationUri, {
      onSuccess: () => {
        setPhase("success");
      },
      onError: () => {
        subscribeStarted.current = false;
        setPhase("subscribing");
        setErrorMessage("Couldn't subscribe. Try again from the publication.");
      },
    });
  }, [
    followStatusReady,
    followStatus?.isFollowing,
    publicationUri,
    followPublication,
  ]);

  return (
    <SubscribeCard
      meta={meta}
      phase={phase}
      shell="page"
      errorMessage={errorMessage ?? undefined}
    />
  );
}
