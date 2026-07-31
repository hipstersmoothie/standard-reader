import { Trans, useLingui } from "@lingui/react/macro";
import { Flex } from "@standard-reader/design-system/flex";
import { Skeleton } from "@standard-reader/design-system/skeleton";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  size as boxSize,
  gap,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { authorApi } from "#/integrations/tanstack-query/api-author.functions";
import { notesApi } from "#/integrations/tanstack-query/api-notes.functions";
import { publicationApi } from "#/integrations/tanstack-query/api-publication.functions";
import type {
  PublicationEmbedMeta,
  PublicationHeader,
  PublicationSocialProof,
} from "#/integrations/tanstack-query/api-publication.functions";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import {
  publicationFeedUrl,
  publicationOgImageUrl,
  siteSocialMeta,
} from "#/lib/site-metadata";
import { useTrackReadingHistory } from "#/lib/use-track-reading-history";

import {
  ComicShelf,
  ComicShelfSkeleton,
} from "../components/comic/comic-shelf";
import { AccountLabelsForDid } from "../components/reader/account-labels";
import { ArticleRow, FeatureArticle } from "../components/reader/cards";
import { FeedLoadMore } from "../components/reader/feed-load-more";
import {
  formatReaders,
  publicationUriFromParams,
} from "../components/reader/format";
import { formatLastActive } from "../components/reader/format-i18n";
import {
  Handle,
  PublicationAvatar,
  ReaderContent,
} from "../components/reader/primitives";
import type { PublicationMarkAllRead } from "../components/reader/publication-actions";
import { PublicationActions } from "../components/reader/publication-actions";
import { PublicationLatestNote } from "../components/reader/publication-latest-note";
import { PublicationSocialProofLine } from "../components/reader/publication-social-proof";
import type { PublicationThemeColors } from "../components/reader/publication-theme-scale";
import { publicationPageCard } from "../components/reader/publication-theme-tokens";
import {
  applyMarkReadManyOptimisticUpdate,
  invalidateReadQueries,
  isArticleUnreadForReader,
} from "../components/reader/read-optimistic";
import { SerialStart } from "../components/reader/serial-start";
import type { ArticleCard } from "../integrations/tanstack-query/api-shapes";

/** Documents loaded with the profile (page 0) before infinite scroll kicks in. */
const PUBLICATION_RECENT_LIMIT = 12;
/** Page size for each subsequent infinite-scroll fetch. */
const PUBLICATION_PAGE_SIZE = 20;
const PUBLICATION_SKELETON_ROWS = 5;

const publicationSearch = z.object({
  /** Reader-scoped view filter over the archive. Kept in the URL so a filtered
   * view survives reload, back/forward, and sharing. */
  filter: z.enum(["all", "unread", "read", "recommended"]).default("all"),
});

export const Route = createFileRoute("/_layout/p/$did/$rkey")({
  validateSearch: publicationSearch,
  loaderDeps: ({ search }) => ({ filter: search.filter }),
  loader: async ({ context, params, preload, deps }) => {
    const uri = publicationUriFromParams(params.did, params.rkey);
    const session = await context.queryClient.ensureQueryData(
      user.getSessionQueryOptions,
    );
    const readerScope = user.readerQueryScope(session);
    const signedIn = Boolean(session?.user);
    const headerOptions = publicationApi.getPublicationHeaderQueryOptions(uri);
    const recentDocumentsOptions =
      publicationApi.getPublicationDocumentsQueryOptions(uri, {
        limit: PUBLICATION_RECENT_LIMIT,
        offset: 0,
        readerScope,
        filter: deps.filter,
      });
    const socialProofOptions =
      publicationApi.getPublicationSocialProofQueryOptions(uri);
    const latestNoteOptions =
      notesApi.getPublicationLatestNoteQueryOptions(uri);

    // Non-blocking: ShareMenu and FollowButton read these from React Query.
    void context.queryClient.prefetchQuery(
      publicationApi.getPublicationEmbedMetaQueryOptions(uri),
    );
    if (signedIn) {
      void context.queryClient.prefetchQuery(
        readerApi.getFollowStatusQueryOptions(uri),
      );
    }

    if (preload) {
      void context.queryClient.prefetchQuery(headerOptions);
      void context.queryClient.prefetchQuery(recentDocumentsOptions);
      void context.queryClient.prefetchQuery(latestNoteOptions);
      if (signedIn) void context.queryClient.prefetchQuery(socialProofOptions);
      return {
        publicationName: null,
        publicationDescription: null,
        publicationTheme: null,
        // Derivable from the params alone, so a preload pass carries it too.
        atMeta: { canonical: [uri], author: [params.did] },
      };
    }

    // Await header + documents (+ social proof for signed-in readers) in
    // parallel so the page paints in one shot instead of stacking loading
    // states. All three are fast DB queries (P50 63-148ms on prod).
    const awaitables: Array<Promise<unknown>> = [
      context.queryClient.ensureQueryData(headerOptions),
      context.queryClient.ensureQueryData(recentDocumentsOptions),
      context.queryClient.ensureQueryData(latestNoteOptions),
    ];
    if (signedIn) {
      awaitables.push(context.queryClient.ensureQueryData(socialProofOptions));
    }
    const results = await Promise.all(awaitables);
    const header = results[0] as {
      publication: {
        name: string;
        description: string;
        serial?: { kind: string } | null;
      };
      owner: { did: string; handle: string };
      theme: PublicationThemeColors;
    } | null;

    // A comic's archive is replaced by a shelf of covers, so the shelf is part
    // of the page's first paint rather than something that pops in after it.
    if (header?.publication.serial?.kind === "comic" && deps.filter === "all") {
      await context.queryClient
        .ensureQueryData(publicationApi.getComicShelfQueryOptions(uri))
        .catch(() => null);
    }

    if (header) {
      void context.queryClient.prefetchQuery(
        authorApi.getAuthorSifaProfileQueryOptions(
          header.owner.did,
          header.owner.handle,
        ),
      );
    }
    return {
      publicationName: header?.publication.name ?? null,
      publicationDescription: header?.publication.description ?? null,
      // Read by `PublicationThemeScope` in the app shell — see its doc comment.
      publicationTheme: header?.theme ?? null,
      // The records this page is built from — rendered by `AtRecordMeta`.
      // Nothing is claimed when the publication didn't resolve.
      atMeta: header ? { canonical: [uri], author: [header.owner.did] } : {},
    };
  },
  head: ({ loaderData, match }) => {
    const name = loaderData?.publicationName;
    if (!name) {
      return { meta: [{ title: "Standard Reader" }] };
    }
    const baseUrl = getPublicUrlClient();
    return {
      meta: siteSocialMeta({
        title: `${name} · Standard Reader`,
        description:
          loaderData?.publicationDescription?.trim() ||
          `Read ${name} on Standard Reader.`,
        url: `${baseUrl}${match.pathname}`,
        ogImage: publicationOgImageUrl(
          baseUrl,
          match.params.did,
          match.params.rkey,
        ),
      }),
      // standard.site discovery hint — the AT-URI of the rendered publication.
      // See https://standard.site/docs/verification/#discovery-hint
      links: [
        {
          rel: "site.standard.publication",
          href: publicationUriFromParams(match.params.did, match.params.rkey),
        },
        {
          rel: "alternate",
          type: "application/rss+xml",
          title: `${name} · Standard Reader`,
          href: publicationFeedUrl(
            baseUrl,
            match.params.did,
            match.params.rkey,
          ),
        },
      ],
    };
  },
  component: PublicationProfilePage,
  pendingComponent: PublicationPending,
});

const HERO_DESKTOP = "@media (min-width: 40rem)";

const styles = stylex.create({
  hero: {
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
  },
  heroInner: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    paddingInlineEnd: {
      [HERO_DESKTOP]: spacing["10"],
      default: spacing["5"],
    },
    paddingInlineStart: {
      [HERO_DESKTOP]: spacing["10"],
      default: spacing["5"],
    },
    rowGap: spacing["4"],
    maxWidth: "82.5rem",
    paddingBottom: spacing["6"],
    paddingTop: spacing["6"],
    width: "100%",
  },
  heroTop: {
    alignItems: "flex-start",
    columnGap: spacing["4"],
    display: "flex",
    flexWrap: "wrap",
    rowGap: spacing["3"],
  },
  avRing: {
    flexShrink: 0,
  },
  avatar: {
    height: boxSize["6xl"],
    width: boxSize["6xl"],
  },
  heroInfo: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: "12.5rem",
    paddingTop: spacing["0.5"],
  },
  heroName: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: { default: "1.85rem", "@media (min-width: 48rem)": "2rem" },
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.xs,
    // Isolate only: this is a single-line NAME, so it must keep the
    // surrounding UI alignment while still ordering its own characters
    // correctly. `dir="auto"` here would left-align it inside an RTL page.
    unicodeBidi: "isolate",
    marginBottom: spacing["0"],
    marginTop: spacing["2"],
  },
  heroHandle: {
    marginTop: spacing["1"],
  },
  heroDesc: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.sm,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
    maxWidth: "60ch",
  },
  handleLink: {
    textDecoration: { default: "none", ":hover": "underline" },
    color: "inherit",
    textDecorationColor: "currentColor",
    textUnderlineOffset: "2px",
  },
  statStrip: {
    alignItems: "stretch",
    color: uiColor.text1,
    display: "flex",
    flexWrap: "wrap",
    rowGap: spacing["2"],
  },
  statItem: {
    borderInlineEndColor: uiColor.border1,
    borderInlineEndStyle: "solid",
    borderInlineEndWidth: 1,
    display: "flex",
    flexDirection: "column",
    marginInlineEnd: spacing["4"],
    paddingInlineEnd: spacing["4"],
    rowGap: spacing["0.5"],
  },
  statItemLast: {
    borderInlineEndWidth: 0,
    marginInlineEnd: spacing["0"],
    paddingInlineEnd: spacing["0"],
  },
  statValue: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.xs,
  },
  statLabel: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: "0.7rem",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.wide,
    textTransform: "uppercase",
  },
  writing: {
    marginTop: spacing["8"],
  },
  heroSkeletonName: {
    height: spacing["10"],
    marginTop: spacing["2"],
    width: "42%",
  },
  heroSkeletonDesc: {
    height: spacing["5"],
    marginTop: spacing["2"],
    width: "68%",
  },
  heroSkeletonStats: {
    height: spacing["3.5"],
    marginTop: spacing["4"],
    width: "32%",
  },
  heroSkeletonActs: {
    height: spacing["8"],
    paddingTop: spacing["1"],
    width: spacing["32"],
  },
  emptyNote: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontStyle: "italic",
    textAlign: "center",
    paddingBottom: spacing["8"],
    paddingTop: spacing["8"],
  },
  endNote: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: spacing["6"],
  },
  featureSkeleton: {
    alignItems: "center",
    columnGap: spacing["9"],
    display: "grid",
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 48rem)": "1.05fr 1fr",
    },
    rowGap: spacing["9"],
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: spacing["9"],
  },
  featureMediaSkeleton: {
    borderRadius: radius.md,
    aspectRatio: "4 / 3",
    width: "100%",
  },
  articleSkeleton: {
    alignItems: "start",
    columnGap: gap["5xl"],
    display: "grid",
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 40rem)": "1fr 150px",
    },
    rowGap: gap["5xl"],
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: spacing["6"],
    paddingTop: spacing["6"],
  },
  articleSkeletonLast: {
    borderBottomWidth: 0,
  },
});

function Stat({
  value,
  label,
  isLast = false,
}: {
  value: string;
  label: string;
  isLast?: boolean;
}) {
  return (
    <div {...stylex.props(styles.statItem, isLast && styles.statItemLast)}>
      <span {...stylex.props(styles.statValue)}>{value}</span>
      <span {...stylex.props(styles.statLabel)}>{label}</span>
    </div>
  );
}

function PublicationFeatureSkeleton() {
  return (
    <div aria-hidden {...stylex.props(styles.featureSkeleton)}>
      <Skeleton
        variant="rectangle"
        height="auto"
        width="100%"
        style={styles.featureMediaSkeleton}
      />
      <Flex direction="column" gap="5xl">
        <Skeleton variant="rectangle" height={spacing["10"]} width="88%" />
        <Skeleton variant="rectangle" height={spacing["5"]} width="100%" />
        <Skeleton variant="rectangle" height={spacing["4"]} width="92%" />
        <Skeleton variant="rectangle" height={spacing["3.5"]} width="34%" />
      </Flex>
    </div>
  );
}

function PublicationArticleRowSkeleton({
  isLast = false,
}: {
  isLast?: boolean;
}) {
  return (
    <div
      aria-hidden
      {...stylex.props(
        styles.articleSkeleton,
        isLast && styles.articleSkeletonLast,
      )}
    >
      <Flex direction="column" gap="2xl">
        <Skeleton variant="rectangle" height={spacing["6"]} width="72%" />
        <Skeleton variant="rectangle" height={spacing["4"]} width="88%" />
        <Skeleton variant="rectangle" height={spacing["3.5"]} width="34%" />
      </Flex>
      <Skeleton
        variant="rectangle"
        height={spacing["20"]}
        width={spacing["28"]}
      />
    </div>
  );
}

function PublicationPostsSkeleton() {
  const { t } = useLingui();
  return (
    <Flex
      direction="column"
      gap="6xl"
      style={styles.writing}
      aria-busy="true"
      aria-label={t`Loading recent writing`}
    >
      <div>
        <PublicationFeatureSkeleton />
        {Array.from({ length: PUBLICATION_SKELETON_ROWS - 1 }, (_, index) => (
          <PublicationArticleRowSkeleton
            key={index}
            isLast={index === PUBLICATION_SKELETON_ROWS - 2}
          />
        ))}
      </div>
    </Flex>
  );
}

/**
 * Route pending state — paints the hero skeleton + recent writing skeleton
 * together so the page has one unified loading state instead of two. Fires
 * while the route loader awaits header + documents + social proof.
 */
function PublicationPending() {
  const { t } = useLingui();
  return (
    <div aria-busy="true" aria-label={t`Loading publication`}>
      <div {...stylex.props(styles.hero)}>
        <div {...stylex.props(styles.heroInner)}>
          <div {...stylex.props(styles.heroTop)}>
            <div {...stylex.props(styles.avRing)}>
              <Skeleton variant="circle" size="lg" />
            </div>
            <div {...stylex.props(styles.heroInfo)}>
              <Skeleton variant="rectangle" style={styles.heroSkeletonName} />
            </div>
          </div>
          <Skeleton variant="rectangle" style={styles.heroSkeletonDesc} />
          <Skeleton variant="rectangle" style={styles.heroSkeletonStats} />
          <Skeleton variant="rectangle" style={styles.heroSkeletonActs} />
        </div>
      </div>
      <ReaderContent>
        <PublicationPostsSkeleton />
      </ReaderContent>
    </div>
  );
}

function PublicationProfilePage() {
  return <PublicationProfile />;
}

function PublicationProfile() {
  const { did, rkey } = Route.useParams();
  const uri = publicationUriFromParams(did, rkey);
  const { data: session } = useSuspenseQuery(user.getSessionQueryOptions);
  const { data: header } = useSuspenseQuery(
    publicationApi.getPublicationHeaderQueryOptions(uri),
  );
  // Non-blocking: prefetched by the loader, but never gates first paint.
  const { data: embedMeta } = useQuery(
    publicationApi.getPublicationEmbedMetaQueryOptions(uri),
  );
  const signedIn = Boolean(session?.user);

  const { data: socialProof } = useQuery({
    ...publicationApi.getPublicationSocialProofQueryOptions(uri),
    enabled: signedIn,
  });

  if (!header) {
    return (
      <ReaderContent>
        <div {...stylex.props(styles.emptyNote)}>
          <Trans>We couldn’t find that publication.</Trans>
        </div>
      </ReaderContent>
    );
  }

  return (
    <PublicationProfileContent
      header={header}
      uri={uri}
      did={did}
      rkey={rkey}
      signedIn={signedIn}
      embedMeta={embedMeta}
      socialProof={socialProof}
    />
  );
}

function PublicationProfileContent({
  header,
  uri,
  did,
  rkey,
  signedIn,
  embedMeta,
  socialProof,
}: {
  header: PublicationHeader;
  uri: string;
  did: string;
  rkey: string;
  signedIn: boolean;
  embedMeta: PublicationEmbedMeta | null | undefined;
  socialProof: PublicationSocialProof | undefined;
}) {
  const { t, i18n } = useLingui();
  const { publication: pub, owner } = header;
  const queryClient = useQueryClient();
  const { filter } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: session } = useSuspenseQuery(user.getSessionQueryOptions);
  const readerScope = user.readerQueryScope(session);
  const { data: initialPage } = useSuspenseQuery(
    publicationApi.getPublicationDocumentsQueryOptions(uri, {
      limit: PUBLICATION_RECENT_LIMIT,
      offset: 0,
      readerScope,
      filter,
    }),
  );

  const [documents, setDocuments] = useState<Array<ArticleCard>>(
    () => initialPage.items,
  );
  const [nextOffset, setNextOffset] = useState<number | null>(
    () => initialPage.nextOffset,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const [markAllReadCloseSignal, setMarkAllReadCloseSignal] = useState(0);

  useEffect(() => {
    setDocuments(initialPage.items);
    setNextOffset(initialPage.nextOffset);
  }, [initialPage]);

  const { enabled: trackReading } = useTrackReadingHistory();
  const isUnread = (article: ArticleCard) =>
    isArticleUnreadForReader(queryClient, article, {
      trackReading,
      signedIn,
    });
  const unreadDocumentUris = useMemo(
    () =>
      documents
        .filter((doc) =>
          isArticleUnreadForReader(queryClient, doc, {
            trackReading,
            signedIn,
          }),
        )
        .map((doc) => doc.uri),
    [documents, queryClient, trackReading, signedIn],
  );

  const { mutate: markAllRead, isPending: markingAllRead } = useMutation({
    ...readerApi.markPublicationAllReadMutationOptions(),
    onMutate: () => {
      applyMarkReadManyOptimisticUpdate(queryClient, unreadDocumentUris, {
        publicationUri: uri,
      });
      setDocuments((prev) =>
        prev.map((doc) =>
          unreadDocumentUris.includes(doc.uri) ? { ...doc, isRead: true } : doc,
        ),
      );
    },
    onSuccess: () => {
      setMarkAllReadCloseSignal((count) => count + 1);
    },
    onError: () => {
      invalidateReadQueries(queryClient);
    },
  });

  const markAllReadAction: PublicationMarkAllRead | null =
    signedIn && unreadDocumentUris.length > 0
      ? {
          isPending: markingAllRead,
          closeSignal: markAllReadCloseSignal,
          onConfirm: () => markAllRead(uri),
        }
      : null;

  const loadMore = useCallback(async () => {
    if (nextOffset == null || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await publicationApi.getPublicationDocuments({
        data: {
          publicationUri: uri,
          limit: PUBLICATION_PAGE_SIZE,
          offset: nextOffset,
          filter,
        },
      });
      setDocuments((prev) => {
        const seen = new Set(prev.map((doc) => doc.uri));
        return [...prev, ...page.items.filter((doc) => !seen.has(doc.uri))];
      });
      setNextOffset(page.nextOffset);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [filter, nextOffset, uri]);

  // A comic posts one page per document, so its full archive is a long list of
  // near-identical rows. When the titles carry issue numbers, those pages are
  // collapsed back into issues and shown as covers instead. Only over the full
  // archive: the read/unread filters are per-page, and a shelf can't express
  // "half of issue 3".
  const shelfEnabled = pub.serial?.kind === "comic" && filter === "all";
  const { data: shelf, isPending: shelfPending } = useQuery({
    ...publicationApi.getComicShelfQueryOptions(uri),
    enabled: shelfEnabled,
  });
  // Until it resolves we don't know whether the titles group at all, and
  // painting the page list only to swap it for a shelf is the worse flicker.
  // The loader awaits this for comics, so it is normally already settled.
  const showShelf = shelfEnabled && (shelfPending || Boolean(shelf?.grouped));

  const lead = documents[0];
  const rest = documents.slice(1);

  return (
    // The publication's own header is page content, unlike an article's sticky
    // reading chrome, so the hero sits inside the card.
    <div {...stylex.props(publicationPageCard.card)}>
      <div {...stylex.props(styles.hero)}>
        <div {...stylex.props(styles.heroInner)}>
          <div {...stylex.props(styles.heroTop)}>
            <div {...stylex.props(styles.avRing)}>
              <PublicationAvatar pub={pub} size="xl" style={styles.avatar} />
            </div>

            <div {...stylex.props(styles.heroInfo)}>
              <h1 {...stylex.props(styles.heroName)}>{pub.name}</h1>
              {owner.handle ? (
                <Link
                  to="/u/$did"
                  params={{ did: owner.did }}
                  {...stylex.props(styles.handleLink)}
                >
                  <Handle style={styles.heroHandle}>@{owner.handle}</Handle>
                </Link>
              ) : null}
            </div>

            <PublicationActions
              pub={pub}
              pageUrl={`${getPublicUrlClient()}/p/${did}/${rkey}`}
              feedUrl={publicationFeedUrl(getPublicUrlClient(), did, rkey)}
              signedIn={signedIn}
              embed={embedMeta}
              markAllRead={markAllReadAction}
              filter={filter}
              trackReading={trackReading}
              onFilterChange={(next) => {
                void navigate({ search: { filter: next }, resetScroll: false });
              }}
            />
          </div>

          {pub.description ? (
            <p dir="auto" {...stylex.props(styles.heroDesc)}>
              {pub.description}
            </p>
          ) : null}

          {/* Below the description, matching the author profile: a label is a
              third party's statement about this account, so it reads after the
              publication's own words rather than interrupting its identity line. */}
          <AccountLabelsForDid did={pub.did} readerScope={readerScope} />

          <div {...stylex.props(styles.statStrip)}>
            <Stat
              value={formatReaders(pub.subscriberCount)}
              label={t`Readers`}
            />
            <Stat value={String(pub.documentCount)} label={t`Posts`} />
            <Stat
              value={formatLastActive(i18n, pub.lastDocumentAt ?? null)}
              label={t`Last active`}
              isLast
            />
          </div>

          {signedIn && socialProof && socialProof.total > 0 ? (
            <PublicationSocialProofLine {...socialProof} />
          ) : null}

          {/* A serial reads front-to-back, so its hero offers issue #1 rather
              than leaving the reader to scroll for it. */}
          {pub.serial ? (
            <SerialStart
              serial={pub.serial}
              first={documents[0]}
              isFullArchive={filter === "all"}
            />
          ) : null}
        </div>
      </div>

      <ReaderContent>
        <Flex direction="column" gap="6xl" style={styles.writing}>
          <PublicationLatestNote publicationUri={uri} />
          {showShelf ? (
            <Flex direction="column" gap="5xl">
              {shelf?.grouped ? (
                <ComicShelf issues={shelf.issues} />
              ) : (
                <ComicShelfSkeleton />
              )}
            </Flex>
          ) : documents.length === 0 ? (
            <div {...stylex.props(styles.emptyNote)}>
              {filter === "unread" ? (
                <Trans>You’ve read everything from this publication.</Trans>
              ) : filter === "read" ? (
                <Trans>You haven’t read anything here yet.</Trans>
              ) : filter === "recommended" ? (
                <Trans>You haven’t recommended anything here yet.</Trans>
              ) : (
                <Trans>No posts indexed from this publication yet.</Trans>
              )}
            </div>
          ) : (
            <div>
              {lead ? (
                <FeatureArticle
                  article={lead}
                  showByline={false}
                  unread={isUnread(lead)}
                />
              ) : null}
              {rest.map((article) => (
                <ArticleRow
                  key={article.uri}
                  article={article}
                  showByline={false}
                  showSaveButton={false}
                  unread={isUnread(article)}
                />
              ))}
            </div>
          )}
          {/* The shelf is complete on arrival — every issue, no paging. */}
          {!showShelf && documents.length > 0 ? (
            <div>
              <FeedLoadMore
                hasMore={nextOffset != null}
                isLoading={loadingMore}
                onLoadMore={() => void loadMore()}
                itemCount={documents.length}
              />
              {loadingMore ? (
                <div {...stylex.props(styles.endNote)}>
                  <Trans>Loading more…</Trans>
                </div>
              ) : nextOffset == null ? (
                <div {...stylex.props(styles.endNote)}>
                  {pub.serial ? (
                    <Trans>That&apos;s every issue published so far.</Trans>
                  ) : (
                    <Trans>You&apos;ve reached the end.</Trans>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </Flex>
      </ReaderContent>
    </div>
  );
}
