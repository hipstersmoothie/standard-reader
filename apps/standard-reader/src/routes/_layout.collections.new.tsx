"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@standard-reader/design-system/button";
import { Flex } from "@standard-reader/design-system/flex";
import { TextField } from "@standard-reader/design-system/text-field";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Layers } from "lucide-react";
import { useMemo, useState } from "react";
import { z } from "zod";

import { hasCollectionsScope } from "#/integrations/auth/scope";
import { collectionsApi } from "#/integrations/tanstack-query/api-collections.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { siteSocialMeta } from "#/lib/site-metadata";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";

import { CollectionBuilder } from "../components/reader/collection-builder";
import { CollectionsUpgradeGate } from "../components/reader/collections-upgrade-gate";
import { Masthead, ReaderContent } from "../components/reader/primitives";

const newCollectionSearchSchema = z.object({
  publication: z.string().optional(),
});

export const Route = createFileRoute("/_layout/collections/new")({
  validateSearch: newCollectionSearchSchema,
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      user.getSessionQueryOptions,
    );
    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: { redirect: buildAuthRedirectPath("/collections/new") },
      });
    }
  },
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      collectionsApi.listCollectionsPublicationsQueryOptions(),
    );
  },
  head: () => ({
    meta: siteSocialMeta({
      title: "New collection · Standard Reader",
      description: "Assemble a new collection.",
      url: `${getPublicUrlClient()}/collections/new`,
    }),
  }),
  component: NewCollectionPage,
});

function NewCollectionPage() {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { publication: publicationRkey } = Route.useSearch();
  const { data: publications } = useSuspenseQuery(
    collectionsApi.listCollectionsPublicationsQueryOptions(),
  );
  const { data: session } = useSuspenseQuery(user.getSessionQueryOptions);

  const targetPublication = useMemo(() => {
    if (publicationRkey) {
      return publications.find((pub) => pub.rkey === publicationRkey) ?? null;
    }
    return publications.length === 1 ? publications[0] : null;
  }, [publicationRkey, publications]);

  const [pubUri, setPubUri] = useState<string | null>(
    targetPublication?.uri ?? null,
  );
  const [pubName, setPubName] = useState("");
  const ensureMutation = useMutation(
    collectionsApi.ensureCollectionsPublicationMutationOptions(),
  );

  // Gate collections authoring on the *granted* OAuth scope (`account.scope`),
  // not the opt-in flag — see `CollectionsUpgradeGate` for the rationale.
  const hasCollectionsTier = hasCollectionsScope(session?.grantedScope);

  const toCollections = () => void navigate({ to: "/collections" });

  const createPublication = () => {
    const name = pubName.trim();
    if (name.length === 0 || ensureMutation.isPending) return;
    ensureMutation.mutate(
      { name },
      {
        onSuccess: (result) => {
          setPubUri(result.uri);
          void queryClient.invalidateQueries({
            queryKey: ["reader", "collectionsPublications"],
          });
        },
      },
    );
  };

  const resolvedUri = pubUri ?? targetPublication?.uri ?? null;

  if (publications.length > 1 && !publicationRkey && !resolvedUri) {
    void navigate({ to: "/collections" });
    return null;
  }

  if (!hasCollectionsTier) {
    return (
      <CollectionsUpgradeGate
        redirect={buildAuthRedirectPath("/collections/new")}
      />
    );
  }

  if (!resolvedUri) {
    return (
      <ReaderContent>
        <Masthead
          kicker={t`Collections`}
          kickerIcon={<Layers size={14} aria-hidden />}
          title={t`Name your series`}
          dek={t`On your first collection we create one series to hold them — a special collection you can subscribe to, rename, and theme later.`}
        />
        <Flex direction="column" gap="2xl">
          <TextField
            label={t`Series name`}
            placeholder={t`e.g. Dispatches from the Atmosphere`}
            value={pubName}
            onChange={setPubName}
            isRequired
            size="lg"
          />
          <Flex align="center" gap="md">
            <Button variant="secondary" onPress={toCollections}>
              <Trans>Cancel</Trans>
            </Button>
            <Button
              variant="primary"
              isDisabled={
                pubName.trim().length === 0 || ensureMutation.isPending
              }
              onPress={createPublication}
            >
              <Trans>Continue</Trans>
            </Button>
          </Flex>
        </Flex>
      </ReaderContent>
    );
  }

  return (
    <CollectionBuilder
      publicationUri={resolvedUri}
      onSaved={toCollections}
      onCancel={toCollections}
    />
  );
}
