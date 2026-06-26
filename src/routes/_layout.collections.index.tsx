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
import { IconButtonLink } from "#/components/router-links";
import { collectionsApi } from "#/integrations/tanstack-query/api-collections.functions";
import { publicationApi } from "#/integrations/tanstack-query/api-publication.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { siteSocialMeta } from "#/lib/site-metadata";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";
import { Eye, Layers, Palette, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import {
  CollectionPublicationCreateDialog,
  CollectionPublicationEditor,
} from "../components/reader/collection-publication-editor";
import { CollectionThemeEditor } from "../components/reader/collection-theme-editor";
import {
  documentUriFromParams,
  formatMonthYear,
  formatReaders,
} from "../components/reader/format";
import {
  Kicker,
  Masthead,
  PublicationAvatar,
  ReaderContent,
} from "../components/reader/primitives";
import { ShareMenu } from "../components/reader/share-menu";
import { Button } from "../design-system/button";
import { Flex } from "../design-system/flex";
import { IconButton } from "../design-system/icon-button";
import { primaryColor, uiColor } from "../design-system/theme/color.stylex";
import { radius } from "../design-system/theme/radius.stylex";
import { primary } from "../design-system/theme/semantic-color.stylex";
import { gap } from "../design-system/theme/semantic-spacing.stylex";
import { shadow } from "../design-system/theme/shadow.stylex";
import { spacing } from "../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
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
    const { queryClient } = context;
    // The collections list and the publications list are independent — run
    // their server-fn round trips in parallel instead of sequentially so the
    // redundant session resolutions overlap.
    const [collections] = await Promise.all([
      queryClient.ensureQueryData(
        collectionsApi.getMyCollectionsQueryOptions(),
      ),
      queryClient.ensureQueryData(
        collectionsApi.listCollectionsPublicationsQueryOptions(),
      ),
    ]);
    // Kick off article-card prefetches in parallel (warms the cache for
    // potential navigation) but don't block the loader on them — the page
    // only suspends on collections + publications, not articles.
    void Promise.all(
      collections.map((card) =>
        queryClient.prefetchQuery(
          publicationApi.getArticleQueryOptions(
            documentUriFromParams(card.did, card.rkey),
          ),
        ),
      ),
    );
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

type CollectionIssue = CollectionCard & { issueNo: number };

const EMPTY_STEPS = [
  "Name your series & pick a theme",
  "Add collections as issues",
  "Publish & share the run",
] as const;

const styles = stylex.create({
  page: {
    marginLeft: "auto",
    marginRight: "auto",
    maxWidth: "73.75rem",
  },
  pageHeader: {
    paddingTop: {
      default: spacing["6"],
      "@media (min-width: 40rem)": spacing["10"],
    },
  },
  topbar: {
    alignItems: "center",
    columnGap: gap["3xl"],
    display: "flex",
    justifyContent: "space-between",
    rowGap: gap.md,
    minHeight: spacing["9"],
  },
  mastheadAfterTopbar: {
    paddingTop: spacing["4"],
  },
  inkButton: {
    borderColor: {
      default: uiColor.solid2,
      ":is([data-hovered])": primaryColor.solid2,
    },
    backgroundColor: {
      default: uiColor.solid2,
      ":is([data-hovered])": primaryColor.solid2,
    },
    color: uiColor.textContrast,
  },
  inkButtonIcon: {
    color: uiColor.textContrast,
  },
  seriesStack: {
    gap: gap["6xl"],
  },
  series: {
    display: "flex",
    flexDirection: "column",
  },
  seriesHead: {
    alignItems: {
      default: "stretch",
      "@media (min-width: 40rem)": "flex-start",
    },
    columnGap: gap["3xl"],
    display: "flex",
    flexDirection: {
      default: "column",
      "@media (min-width: 40rem)": "row",
    },
    justifyContent: "space-between",
    rowGap: gap["3xl"],
    borderBottomColor: uiColor.border2,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    marginBottom: spacing["2"],
    paddingBottom: spacing["5"],
  },
  seriesHeadMain: {
    minWidth: 0,
  },
  seriesHeadRow: {
    alignItems: "flex-start",
    columnGap: gap["2xl"],
    display: "flex",
    rowGap: gap.md,
  },
  seriesHeadText: {
    minWidth: 0,
  },
  seriesTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["3xl"],
    fontStyle: "italic",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
  seriesMeta: {
    alignItems: "center",
    color: uiColor.text1,
    columnGap: gap["lg"],
    display: "flex",
    flexWrap: "wrap",
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    rowGap: gap.sm,
    marginTop: spacing["4"],
  },
  seriesMetaStrong: {
    color: uiColor.text2,
    fontWeight: fontWeight.medium,
  },
  seriesMetaDot: {
    color: uiColor.text1,
  },
  seriesHeadActions: {
    flexShrink: 0,
    flexWrap: "wrap",
  },
  issueList: {
    display: "flex",
    flexDirection: "column",
  },
  issueRow: {
    alignItems: "center",
    columnGap: gap["3xl"],
    display: "grid",
    gridTemplateColumns: {
      default: "1fr auto",
      "@media (min-width: 40rem)": `${spacing["12"]} 1fr auto`,
    },
    rowGap: gap["2xl"],
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    paddingBottom: spacing["4"],
    paddingLeft: spacing["1.5"],
    paddingRight: spacing["1.5"],
    paddingTop: spacing["4"],
  },
  issueRowFirst: {
    borderTopWidth: 0,
  },
  issueIndex: {
    color: uiColor.border2,
    display: {
      default: "none",
      "@media (min-width: 40rem)": "block",
    },
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xl,
    fontStyle: "italic",
    fontWeight: fontWeight.normal,
    lineHeight: lineHeight.xs,
    textAlign: "center",
  },
  issueInfo: {
    minWidth: 0,
  },
  issueTitle: {
    textDecoration: { default: "none", ":hover": "underline" },
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
  },
  issueSub: {
    alignItems: "center",
    color: uiColor.text1,
    columnGap: gap.md,
    display: "flex",
    flexWrap: "wrap",
    fontFamily: fontFamily.mono,
    fontSize: fontSize.sm,
    rowGap: gap.sm,
    marginTop: spacing["1.5"],
  },
  issueSubDot: {
    color: uiColor.text1,
  },
  issueActs: {
    columnGap: spacing["1"],
    display: "flex",
    flexShrink: 0,
    rowGap: spacing["1"],
  },
  listAdd: {
    borderColor: {
      default: uiColor.border2,
      ":is([data-hovered])": primaryColor.border2,
    },
    borderStyle: "dashed",
    color: {
      default: uiColor.text1,
      ":is([data-hovered])": primaryColor.text2,
    },
    justifyContent: "flex-start",
    marginTop: spacing["3.5"],
    width: "100%",
  },
  seriesEmpty: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontStyle: "italic",
    paddingBottom: spacing["4"],
    paddingTop: spacing["2"],
  },
  emptyState: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    textAlign: "center",
    marginLeft: "auto",
    marginRight: "auto",
    maxWidth: "35rem",
    paddingBottom: spacing["10"],
    paddingLeft: spacing["6"],
    paddingRight: spacing["6"],
    paddingTop: spacing["20"],
  },
  emptyArt: {
    position: "relative",
    height: spacing["24"],
    marginBottom: spacing["8"],
    width: spacing["32"],
  },
  emptyCard: {
    borderColor: uiColor.border2,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    backgroundColor: uiColor.component1,
    boxShadow: shadow.sm,
    position: "absolute",
    bottom: spacing["0"],
    height: spacing["20"],
    width: spacing["16"],
  },
  emptyCardLeft: {
    backgroundColor: uiColor.bgSubtle,
    transform: "rotate(-9deg)",
    transformOrigin: "bottom center",
    left: spacing["1.5"],
  },
  emptyCardRight: {
    backgroundColor: uiColor.bgSubtle,
    transform: "rotate(9deg)",
    transformOrigin: "bottom center",
    right: spacing["1.5"],
  },
  emptyCardCenter: {
    borderColor: primaryColor.border2,
    alignItems: "center",
    backgroundColor: uiColor.component1,
    color: primaryColor.text2,
    display: "flex",
    justifyContent: "center",
    zIndex: 1,
    height: spacing["24"],
    left: "50%",
    marginLeft: `calc(${spacing["16"]} / -2)`,
  },
  emptyTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["3xl"],
    fontStyle: "italic",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
  emptyDescription: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.base,
    textWrap: "pretty",
    marginBottom: spacing["0"],
    marginTop: spacing["3.5"],
    maxWidth: "44ch",
  },
  emptyActions: {
    marginTop: spacing["6"],
  },
  emptySteps: {
    alignItems: "flex-start",
    columnGap: gap["3xl"],
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    rowGap: gap["lg"],
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginTop: spacing["11"],
    paddingTop: spacing["7"],
    width: "100%",
  },
  emptyStep: {
    alignItems: "center",
    color: uiColor.text2,
    columnGap: gap.md,
    display: "inline-flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    rowGap: gap.sm,
  },
  emptyStepNumber: {
    borderRadius: radius.full,
    alignItems: "center",
    backgroundColor: primaryColor.component1,
    color: primaryColor.text2,
    display: "grid",
    flexShrink: 0,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    justifyContent: "center",
    height: spacing["6"],
    width: spacing["6"],
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
    collections: orderIssues(byUri.get(publication.uri) ?? []),
  }));

  const orphans: Array<CollectionIssue> = [];
  for (const [uri, group] of byUri) {
    if (uri && !knownUris.has(uri)) orphans.push(...orderIssues(group));
    if (!uri) orphans.push(...orderIssues(group));
  }

  return { sections, orphans };
}

function orderIssues(
  collections: Array<CollectionCard>,
): Array<CollectionIssue> {
  const sorted = [...collections].toSorted((a, b) => {
    const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    if (ta !== tb) return ta - tb;
    return a.title.localeCompare(b.title);
  });
  const numbered = sorted.map((collection, index) => ({
    ...collection,
    issueNo: index + 1,
  }));
  return numbered.toReversed();
}

function IssueRow({
  issue,
  baseUrl,
  onRemove,
  isDeleting,
  isFirst,
}: {
  issue: CollectionIssue;
  baseUrl: string;
  onRemove: (rkey: string) => void;
  isDeleting: boolean;
  isFirst: boolean;
}) {
  const monthYear = formatMonthYear(issue.updatedAt);

  return (
    <div {...stylex.props(styles.issueRow, isFirst && styles.issueRowFirst)}>
      <div {...stylex.props(styles.issueIndex)}>
        {String(issue.issueNo).padStart(2, "0")}
      </div>
      <div {...stylex.props(styles.issueInfo)}>
        <Link
          to="/collections/edit/$rkey"
          params={{ rkey: issue.rkey }}
          {...stylex.props(styles.issueTitle)}
        >
          {issue.title}
        </Link>
        <div {...stylex.props(styles.issueSub)}>
          <span>
            {issue.itemCount} {issue.itemCount === 1 ? "article" : "articles"}
          </span>
          {monthYear ? (
            <>
              <span {...stylex.props(styles.issueSubDot)} aria-hidden>
                ·
              </span>
              <span>{monthYear}</span>
            </>
          ) : null}
        </div>
      </div>
      <div {...stylex.props(styles.issueActs)}>
        <IconButtonLink
          to="/collection/$did/$rkey"
          params={{ did: issue.did, rkey: issue.rkey }}
          variant="secondary"
          size="md"
          label="View collection"
        >
          <Eye size={16} />
        </IconButtonLink>
        <ShareMenu
          pageUrl={`${baseUrl}/a/${issue.did}/${issue.rkey}`}
          variant="icon"
          size="md"
        />
        <IconButton
          variant="critical-outline"
          size="md"
          label="Delete collection"
          isDisabled={isDeleting}
          onPress={() => onRemove(issue.rkey)}
        >
          <Trash2 size={16} />
        </IconButton>
      </div>
    </div>
  );
}

function SeriesBlock({
  publication,
  issues,
  baseUrl,
  onRemove,
  isDeleting,
  onTheme,
  onEdit,
  onAddCollection,
}: {
  publication: CollectionsPublicationSummary;
  issues: Array<CollectionIssue>;
  baseUrl: string;
  onRemove: (rkey: string) => void;
  isDeleting: boolean;
  onTheme: () => void;
  onEdit: () => void;
  onAddCollection: () => void;
}) {
  return (
    <section {...stylex.props(styles.series)}>
      <div {...stylex.props(styles.seriesHead)}>
        <div {...stylex.props(styles.seriesHeadMain)}>
          <div {...stylex.props(styles.seriesHeadRow)}>
            {publication.iconUrl ? (
              <PublicationAvatar
                pub={{ name: publication.name, iconUrl: publication.iconUrl }}
                size="xl"
              />
            ) : null}
            <div {...stylex.props(styles.seriesHeadText)}>
              <h2 {...stylex.props(styles.seriesTitle)}>{publication.name}</h2>
              <div {...stylex.props(styles.seriesMeta)}>
                {publication.subscriberCount > 0 ? (
                  <>
                    <span>
                      <span {...stylex.props(styles.seriesMetaStrong)}>
                        {formatReaders(publication.subscriberCount)}
                      </span>{" "}
                      followers
                    </span>
                    <span {...stylex.props(styles.seriesMetaDot)} aria-hidden>
                      ·
                    </span>
                  </>
                ) : null}
                <span>
                  <span {...stylex.props(styles.seriesMetaStrong)}>
                    {issues.length}
                  </span>{" "}
                  {issues.length === 1 ? "issue" : "issues"}
                </span>
              </div>
            </div>
          </div>
        </div>
        <Flex align="center" gap="sm" style={styles.seriesHeadActions}>
          <IconButton
            variant="secondary"
            size="lg"
            label="Edit series"
            onPress={onEdit}
          >
            <Pencil size={16} aria-hidden />
          </IconButton>
          <IconButton
            variant="secondary"
            size="lg"
            label="Theme & fonts"
            onPress={onTheme}
          >
            <Palette size={16} aria-hidden />
          </IconButton>
        </Flex>
      </div>

      {issues.length === 0 ? (
        <div {...stylex.props(styles.seriesEmpty)}>
          No collections in this series yet.
        </div>
      ) : (
        <div {...stylex.props(styles.issueList)}>
          {issues.map((issue, index) => (
            <IssueRow
              key={issue.uri}
              issue={issue}
              baseUrl={baseUrl}
              onRemove={onRemove}
              isDeleting={isDeleting}
              isFirst={index === 0}
            />
          ))}
        </div>
      )}

      <Button
        variant="tertiary"
        size="lg"
        onPress={onAddCollection}
        style={styles.listAdd}
      >
        <Plus size={16} aria-hidden />
        Add a collection to this series
      </Button>
    </section>
  );
}

function NewSeriesButton({
  size = "md",
  onPress,
}: {
  size?: "md" | "lg";
  onPress: () => void;
}) {
  return (
    <Button
      variant="primary"
      size={size}
      onPress={onPress}
      style={[styles.inkButton, primary.textContrast]}
    >
      <Plus size={15} aria-hidden {...stylex.props(styles.inkButtonIcon)} /> New
      series
    </Button>
  );
}

function CollectionsEmptyState({
  onCreateSeries,
}: {
  onCreateSeries: () => void;
}) {
  return (
    <div {...stylex.props(styles.emptyState)}>
      <div aria-hidden {...stylex.props(styles.emptyArt)}>
        <span {...stylex.props(styles.emptyCard, styles.emptyCardLeft)} />
        <span {...stylex.props(styles.emptyCard, styles.emptyCardRight)} />
        <span {...stylex.props(styles.emptyCard, styles.emptyCardCenter)}>
          <Layers size={26} aria-hidden />
        </span>
      </div>
      <h2 {...stylex.props(styles.emptyTitle)}>Start your first series</h2>
      <p {...stylex.props(styles.emptyDescription)}>
        A series is a collection of collections — like a magazine and its
        issues. Group related editions under one masthead, give it a theme, and
        let readers follow the whole run.
      </p>
      <div {...stylex.props(styles.emptyActions)}>
        <NewSeriesButton size="lg" onPress={onCreateSeries} />
      </div>
      <div {...stylex.props(styles.emptySteps)}>
        {EMPTY_STEPS.map((step, index) => (
          <div key={step} {...stylex.props(styles.emptyStep)}>
            <span {...stylex.props(styles.emptyStepNumber)}>{index + 1}</span>
            <span>{step}</span>
          </div>
        ))}
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
  const [editPublication, setEditPublication] =
    useState<CollectionsPublicationSummary | null>(null);
  const [createPubOpen, setCreatePubOpen] = useState(false);

  const deleteMutation = useMutation(
    collectionsApi.deleteCollectionMutationOptions(),
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

  const newCollectionFor = (publicationRkey: string) => {
    void navigate({
      to: "/collections/new",
      search: { publication: publicationRkey },
    });
  };

  const isFullyEmpty = publications.length === 0 && collections.length === 0;

  return (
    <ReaderContent>
      <div {...stylex.props(styles.page)}>
        <div {...stylex.props(styles.pageHeader)}>
          <div {...stylex.props(styles.topbar)}>
            <Kicker icon={<Layers size={14} aria-hidden />}>
              Your profile
            </Kicker>
            {isFullyEmpty ? null : (
              <NewSeriesButton onPress={() => setCreatePubOpen(true)} />
            )}
          </div>

          <Masthead
            title="Collections"
            dek="Curated, magazine-rendered editions grouped into followable series — your special collections on the network."
            metaLabel="Series"
            metaValue={String(publications.length)}
            style={styles.mastheadAfterTopbar}
          />
        </div>

        {isFullyEmpty ? (
          <CollectionsEmptyState
            onCreateSeries={() => setCreatePubOpen(true)}
          />
        ) : (
          <Flex direction="column" style={styles.seriesStack}>
            {sections.map(({ publication, collections: pubCollections }) => (
              <SeriesBlock
                key={publication.uri}
                publication={publication}
                issues={pubCollections}
                baseUrl={baseUrl}
                onRemove={remove}
                isDeleting={deleteMutation.isPending}
                onTheme={() => setThemePublication(publication)}
                onEdit={() => setEditPublication(publication)}
                onAddCollection={() => newCollectionFor(publication.rkey)}
              />
            ))}

            {orphans.length > 0 ? (
              <section {...stylex.props(styles.series)}>
                <div {...stylex.props(styles.seriesHead)}>
                  <div {...stylex.props(styles.seriesHeadMain)}>
                    <h2 {...stylex.props(styles.seriesTitle)}>
                      {publications.length === 0
                        ? "Collections"
                        : "Other collections"}
                    </h2>
                    {publications.length === 0 ? (
                      <div {...stylex.props(styles.seriesMeta)}>
                        <span>
                          <span {...stylex.props(styles.seriesMetaStrong)}>
                            {orphans.length}
                          </span>{" "}
                          {orphans.length === 1 ? "issue" : "issues"}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div {...stylex.props(styles.issueList)}>
                  {orphans.map((issue, index) => (
                    <IssueRow
                      key={issue.uri}
                      issue={issue}
                      baseUrl={baseUrl}
                      onRemove={remove}
                      isDeleting={deleteMutation.isPending}
                      isFirst={index === 0}
                    />
                  ))}
                </div>
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

        {editPublication ? (
          <CollectionPublicationEditor
            isOpen
            onOpenChange={(open) => {
              if (!open) setEditPublication(null);
            }}
            publication={editPublication}
          />
        ) : null}

        <CollectionPublicationCreateDialog
          isOpen={createPubOpen}
          onOpenChange={setCreatePubOpen}
        />
      </div>
    </ReaderContent>
  );
}
