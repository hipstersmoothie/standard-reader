"use client";

import { useLingui } from "@lingui/react/macro";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Layers } from "lucide-react";

import { hasCollectionsScope } from "#/integrations/auth/scope";
import { collectionsApi } from "#/integrations/tanstack-query/api-collections.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { siteSocialMeta } from "#/lib/site-metadata";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";

import { CollectionBuilder } from "../components/reader/collection-builder";
import { CollectionsUpgradeGate } from "../components/reader/collections-upgrade-gate";
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
  const { t } = useLingui();
  const { rkey } = Route.useParams();
  const navigate = useNavigate();
  const { data: initial } = useSuspenseQuery(
    collectionsApi.getCollectionForEditQueryOptions(rkey),
  );
  const { data: session } = useSuspenseQuery(user.getSessionQueryOptions);

  const toCollections = () => void navigate({ to: "/collections" });

  // Gate edits on the granted collections scope too — a reader whose consent
  // was revoked on the PDS (or who never completed the upgrade) would otherwise
  // reach the builder and have every save fail. See CollectionsUpgradeGate.
  if (!hasCollectionsScope(session?.grantedScope)) {
    return (
      <CollectionsUpgradeGate
        redirect={buildAuthRedirectPath(`/collections/edit/${rkey}`)}
      />
    );
  }

  if (!initial) {
    return (
      <ReaderContent>
        <Masthead
          kicker={t`Collections`}
          kickerIcon={<Layers size={14} aria-hidden />}
          title={t`Collection not found`}
          dek={t`We couldn’t load that collection to edit.`}
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
