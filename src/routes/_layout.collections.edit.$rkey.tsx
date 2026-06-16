"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { collectionsApi } from "#/integrations/tanstack-query/api-collections.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { siteSocialMeta } from "#/lib/site-metadata";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";
import { Layers } from "lucide-react";

import { CollectionBuilder } from "../components/reader/collection-builder";
import { Masthead, ReaderContent } from "../components/reader/primitives";

export const Route = createFileRoute("/_layout/collections/edit/$rkey")({
  beforeLoad: async ({ context, params }) => {
    const session = await context.queryClient.ensureQueryData(
      user.getSessionQueryOptions,
    );
    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: {
          redirect: buildAuthRedirectPath(`/collections/edit/${params.rkey}`),
        },
      });
    }
  },
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      collectionsApi.getCollectionForEditQueryOptions(params.rkey),
    );
  },
  head: () => ({
    meta: siteSocialMeta({
      title: "Edit collection · Standard Reader",
      description: "Edit a collection.",
      url: getPublicUrlClient(),
    }),
  }),
  component: EditCollectionPage,
});

function EditCollectionPage() {
  const { rkey } = Route.useParams();
  const navigate = useNavigate();
  const { data: initial } = useSuspenseQuery(
    collectionsApi.getCollectionForEditQueryOptions(rkey),
  );

  const toCollections = () => void navigate({ to: "/collections" });

  if (!initial) {
    return (
      <ReaderContent>
        <Masthead
          kicker="Collections"
          kickerIcon={<Layers size={14} aria-hidden />}
          title="Collection not found"
          dek="We couldn’t load that collection to edit."
        />
      </ReaderContent>
    );
  }

  return (
    <CollectionBuilder
      publicationUri={initial.publicationUri ?? ""}
      initial={initial}
      onSaved={toCollections}
      onCancel={toCollections}
    />
  );
}
