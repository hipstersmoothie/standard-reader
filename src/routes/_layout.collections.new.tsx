"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { auth } from "#/integrations/tanstack-query/api-auth.functions";
import { collectionsApi } from "#/integrations/tanstack-query/api-collections.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { siteSocialMeta } from "#/lib/site-metadata";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";
import { Layers } from "lucide-react";
import { useMemo, useState } from "react";
import { z } from "zod";

import { CollectionBuilder } from "../components/reader/collection-builder";
import { Masthead, ReaderContent } from "../components/reader/primitives";
import {
  AlertDialog,
  AlertDialogActionButton,
  AlertDialogCancelButton,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
} from "../design-system/alert-dialog";
import { Button } from "../design-system/button";
import { Flex } from "../design-system/flex";
import { TextField } from "../design-system/text-field";

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

  // Progressive scope upgrade: collections authoring needs the collections
  // OAuth scope tier. If the user hasn't opted in yet (flag falsy on their
  // `user` row), prompt them before showing the builder. The upgrade fn sets
  // the flag, revokes the current session, and returns a fresh authorize URL
  // with the collections tier; the callback returns here.
  const upgradeMutation = useMutation({
    mutationFn: async () => {
      const result = await auth.upgradeToCollections({
        data: { redirect: buildAuthRedirectPath("/collections/new") },
      });
      globalThis.location.href = result.authorizationUrl;
    },
  });

  const collectionsAuthoringEnabled =
    session?.collectionsAuthoringEnabled === true;

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

  // Upgrade gate: block the builder until the user has the collections scope.
  if (!collectionsAuthoringEnabled) {
    return (
      <ReaderContent>
        <Masthead
          kicker="Collections"
          kickerIcon={<Layers size={14} aria-hidden />}
          title="Upgrade to author Collections"
          dek="Authoring Collections needs additional permissions to publish collections and documents on your behalf. You can revoke this any time from your account settings."
        />
        <AlertDialog trigger={null} isOpen>
          <AlertDialogHeader>Upgrade permissions</AlertDialogHeader>
          <AlertDialogDescription>
            Standard Reader needs write access to your site.standard
            publications and documents, plus your collection records, to author
            Collections. You'll be asked to approve this on your PDS login.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancelButton>Not now</AlertDialogCancelButton>
            <AlertDialogActionButton
              closeOnPress={false}
              isPending={upgradeMutation.isPending}
              onPress={() => upgradeMutation.mutate()}
            >
              Upgrade permissions
            </AlertDialogActionButton>
          </AlertDialogFooter>
        </AlertDialog>
      </ReaderContent>
    );
  }

  if (!resolvedUri) {
    return (
      <ReaderContent>
        <Masthead
          kicker="Collections"
          kickerIcon={<Layers size={14} aria-hidden />}
          title="Name your series"
          dek="On your first collection we create one series to hold them — a followable special collection you can rename and theme later."
        />
        <Flex direction="column" gap="2xl">
          <TextField
            label="Series name"
            placeholder="e.g. Dispatches from the Atmosphere"
            value={pubName}
            onChange={setPubName}
            isRequired
            size="lg"
          />
          <Flex align="center" gap="md">
            <Button variant="secondary" onPress={toCollections}>
              Cancel
            </Button>
            <Button
              variant="primary"
              isDisabled={
                pubName.trim().length === 0 || ensureMutation.isPending
              }
              onPress={createPublication}
            >
              Continue
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
