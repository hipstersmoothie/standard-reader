"use client";

import type {
  CollectionCard,
  CollectionsPublicationSummary,
} from "#/integrations/tanstack-query/api-collections.functions";

import * as stylex from "@stylexjs/stylex";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  Link,
  createFileRoute,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { collectionsApi } from "#/integrations/tanstack-query/api-collections.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { siteSocialMeta } from "#/lib/site-metadata";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";
import { BookOpen, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { CollectionThemeEditor } from "../components/reader/collection-theme-editor";
import {
  Masthead,
  ReaderContent,
  SectionHead,
} from "../components/reader/primitives";
import { ShareMenu } from "../components/reader/share-menu";
import { Button } from "../design-system/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "../design-system/dialog";
import { Flex } from "../design-system/flex";
import { IconButton } from "../design-system/icon-button";
import { TextField } from "../design-system/text-field";
import { uiColor } from "../design-system/theme/color.stylex";
import { radius } from "../design-system/theme/radius.stylex";
import { spacing } from "../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "../design-system/theme/typography.stylex";

const COLLECTIONS_QUERY_KEY = ["reader", "collections"] as const;

export const Route = createFileRoute("/_layout/collections/")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      user.getSessionQueryOptions,
    );
    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: { redirect: buildAuthRedirectPath("/collections") },
      });
    }
  },
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        collectionsApi.getMyCollectionsQueryOptions(),
      ),
      context.queryClient.ensureQueryData(
        collectionsApi.listCollectionsPublicationsQueryOptions(),
      ),
    ]);
  },
  head: () => ({
    meta: siteSocialMeta({
      title: "Collections · Standard Reader",
      description:
        "Curated, magazine-rendered editions grouped into followable series.",
      url: `${getPublicUrlClient()}/collections`,
    }),
  }),
  component: CollectionsPage,
});

const styles = stylex.create({
  section: {
    gap: spacing["4"],
    display: "flex",
    flexDirection: "column",
  },
  card: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    alignItems: "center",
    columnGap: spacing["4"],
    display: "flex",
    flexWrap: "wrap",
    rowGap: spacing["3"],
    paddingBottom: spacing["4"],
    paddingLeft: spacing["5"],
    paddingRight: spacing["5"],
    paddingTop: spacing["4"],
  },
  cardInfo: { flexGrow: 1, minWidth: "12rem" },
  cardTitle: {
    textDecoration: { default: "none", ":hover": "underline" },
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.xs,
  },
  cardMeta: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    marginTop: spacing["1"],
  },
  cardActs: {
    alignItems: "center",
    columnGap: spacing["1.5"],
    display: "flex",
  },
  empty: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontStyle: "italic",
    paddingBottom: spacing["4"],
    paddingTop: spacing["2"],
  },
  pageActions: {
    marginBottom: spacing["2"],
  },
  sectionActions: {
    flexWrap: "wrap",
  },
});

function groupCollectionsByPublication(
  collections: Array<CollectionCard>,
  publications: Array<CollectionsPublicationSummary>,
) {
  const byUri = new Map<string, Array<CollectionCard>>();
  for (const collection of collections) {
    const key = collection.publicationUri ?? "";
    const group = byUri.get(key) ?? [];
    group.push(collection);
    byUri.set(key, group);
  }

  const knownUris = new Set(publications.map((pub) => pub.uri));
  const sections = publications.map((publication) => ({
    publication,
    collections: byUri.get(publication.uri) ?? [],
  }));

  const orphans: Array<CollectionCard> = [];
  for (const [uri, group] of byUri) {
    if (uri && !knownUris.has(uri)) orphans.push(...group);
    if (!uri) orphans.push(...group);
  }

  return { sections, orphans };
}

function CollectionCardRow({
  collection,
  baseUrl,
  onRemove,
  isDeleting,
}: {
  collection: CollectionCard;
  baseUrl: string;
  onRemove: (rkey: string) => void;
  isDeleting: boolean;
}) {
  return (
    <div {...stylex.props(styles.card)}>
      <div {...stylex.props(styles.cardInfo)}>
        <Link
          to="/a/$did/$rkey"
          params={{ did: collection.did, rkey: collection.rkey }}
          {...stylex.props(styles.cardTitle)}
        >
          {collection.title}
        </Link>
        <div {...stylex.props(styles.cardMeta)}>
          {collection.itemCount}{" "}
          {collection.itemCount === 1 ? "article" : "articles"}
          {collection.hasEditorial ? " · editorial" : ""}
        </div>
      </div>
      <div {...stylex.props(styles.cardActs)}>
        <Link
          to="/magazine/$did/$rkey"
          params={{ did: collection.did, rkey: collection.rkey }}
        >
          <IconButton variant="secondary" label="Launch magazine">
            <BookOpen size={16} />
          </IconButton>
        </Link>
        <Link to="/collections/edit/$rkey" params={{ rkey: collection.rkey }}>
          <IconButton variant="secondary" label="Edit collection">
            <Pencil size={16} />
          </IconButton>
        </Link>
        <ShareMenu
          pageUrl={`${baseUrl}/a/${collection.did}/${collection.rkey}`}
          variant="icon"
        />
        <IconButton
          variant="critical-outline"
          label="Delete collection"
          isDisabled={isDeleting}
          onPress={() => onRemove(collection.rkey)}
        >
          <Trash2 size={16} />
        </IconButton>
      </div>
    </div>
  );
}

function CollectionsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: collections } = useSuspenseQuery(
    collectionsApi.getMyCollectionsQueryOptions(),
  );
  const { data: publications } = useSuspenseQuery(
    collectionsApi.listCollectionsPublicationsQueryOptions(),
  );

  const [themePublication, setThemePublication] =
    useState<CollectionsPublicationSummary | null>(null);
  const [createPubOpen, setCreatePubOpen] = useState(false);
  const [newPubName, setNewPubName] = useState("");

  const deleteMutation = useMutation(
    collectionsApi.deleteCollectionMutationOptions(),
  );
  const createPubMutation = useMutation(
    collectionsApi.createCollectionsPublicationMutationOptions(),
  );

  const baseUrl = getPublicUrlClient();
  const { sections, orphans } = useMemo(
    () => groupCollectionsByPublication(collections, publications),
    [collections, publications],
  );

  const remove = (rkey: string) => {
    deleteMutation.mutate(rkey, {
      onSettled: () =>
        queryClient.invalidateQueries({ queryKey: COLLECTIONS_QUERY_KEY }),
    });
  };

  const createPublication = () => {
    const name = newPubName.trim();
    if (name.length === 0 || createPubMutation.isPending) return;
    createPubMutation.mutate(
      { name },
      {
        onSuccess: () => {
          setNewPubName("");
          setCreatePubOpen(false);
          void queryClient.invalidateQueries({
            queryKey: ["reader", "collectionsPublications"],
          });
        },
      },
    );
  };

  const newCollectionFor = (publicationRkey: string) => {
    void navigate({
      to: "/collections/new",
      search: { publication: publicationRkey },
    });
  };

  return (
    <ReaderContent>
      <Masthead
        kicker="Your profile"
        kickerIcon={<Layers size={14} aria-hidden />}
        title="Collections"
        dek="Curated, magazine-rendered editions grouped into followable series — your special collections on the network."
        metaLabel="Collections"
        metaValue={String(collections.length)}
      />

      <Flex justify="end" gap="sm" style={styles.pageActions}>
        <Button variant="secondary" onPress={() => setCreatePubOpen(true)}>
          <Plus size={16} aria-hidden /> New series
        </Button>
      </Flex>

      {publications.length === 0 ? (
        <div {...stylex.props(styles.empty)}>
          No series yet — create one to start publishing collections.
        </div>
      ) : (
        <Flex direction="column" gap="6xl">
          {sections.map(({ publication, collections: pubCollections }) => (
            <section key={publication.uri} {...stylex.props(styles.section)}>
              <SectionHead
                kicker="Series"
                title={publication.name}
                action={
                  <Flex align="center" gap="sm" style={styles.sectionActions}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onPress={() => setThemePublication(publication)}
                    >
                      Theme &amp; fonts
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onPress={() => newCollectionFor(publication.rkey)}
                    >
                      New collection
                    </Button>
                  </Flex>
                }
              />
              {pubCollections.length === 0 ? (
                <div {...stylex.props(styles.empty)}>
                  No collections in this series yet.
                </div>
              ) : (
                pubCollections.map((collection) => (
                  <CollectionCardRow
                    key={collection.uri}
                    collection={collection}
                    baseUrl={baseUrl}
                    onRemove={remove}
                    isDeleting={deleteMutation.isPending}
                  />
                ))
              )}
            </section>
          ))}

          {orphans.length > 0 ? (
            <section {...stylex.props(styles.section)}>
              <SectionHead kicker="Series" title="Other collections" />
              {orphans.map((collection) => (
                <CollectionCardRow
                  key={collection.uri}
                  collection={collection}
                  baseUrl={baseUrl}
                  onRemove={remove}
                  isDeleting={deleteMutation.isPending}
                />
              ))}
            </section>
          ) : null}
        </Flex>
      )}

      {themePublication ? (
        <CollectionThemeEditor
          isOpen
          onOpenChange={(open) => {
            if (!open) setThemePublication(null);
          }}
          theme={themePublication.theme}
          publicationRkey={themePublication.rkey}
        />
      ) : null}

      <Dialog
        size="sm"
        isOpen={createPubOpen}
        onOpenChange={(open) => {
          setCreatePubOpen(open);
          if (!open) setNewPubName("");
        }}
        trigger={<span hidden aria-hidden />}
      >
        <DialogHeader>New series</DialogHeader>
        <DialogBody>
          <Flex direction="column" gap="md">
            <TextField
              label="Series name"
              placeholder="e.g. Dispatches from the Atmosphere"
              value={newPubName}
              onChange={setNewPubName}
              isRequired
              size="lg"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
            <span {...stylex.props(styles.empty)}>
              A series is a followable collection others can subscribe to. Theme
              it from the collections page once it exists.
            </span>
          </Flex>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="secondary"
            onPress={() => setCreatePubOpen(false)}
            isDisabled={createPubMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            isDisabled={
              newPubName.trim().length === 0 || createPubMutation.isPending
            }
            onPress={createPublication}
          >
            Create series
          </Button>
        </DialogFooter>
      </Dialog>
    </ReaderContent>
  );
}
