import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { CheckCheck, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

import { AddToListButton } from "../components/reader/add-to-list-modal";
import {
  ArticleRow,
  FeatureArticle,
  FollowButton,
} from "../components/reader/cards";
import {
  formatReaders,
  publicationUriFromParams,
} from "../components/reader/format";
import {
  Handle,
  PublicationAvatar,
  ReaderContent,
} from "../components/reader/primitives";
import { PublicationLatestNote } from "../components/reader/publication-latest-note";
import { PublicationSocialProofLine } from "../components/reader/publication-social-proof";
import type { PublicationThemeColors } from "../components/reader/publication-theme-scale";
import { publicationPageCard } from "../components/reader/publication-theme-tokens";
import {
  applyMarkReadManyOptimisticUpdate,
  invalidateReadQueries,
  isArticleUnreadForReader,
} from "../components/reader/read-optimistic";
import { RssFeedButton } from "../components/reader/rss-feed-button";
import { ShareMenu } from "../components/reader/share-menu";
import { useInfiniteScrollSentinel } from "../components/reader/use-infinite-scroll-sentinel";
import {
  AlertDialog,
  AlertDialogActionButton,
  AlertDialogCancelButton,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
} from "../design-system/alert-dialog";
import { Flex } from "../design-system/flex";
import { IconButton } from "../design-system/icon-button";
import { Skeleton } from "../design-system/skeleton";
import { uiColor } from "../design-system/theme/color.stylex";
import { radius } from "../design-system/theme/radius.stylex";
import {
  size as boxSize,
  gap,
} from "../design-system/theme/semantic-spacing.stylex";
import { spacing } from "../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "../design-system/theme/typography.stylex";
import type { ArticleCard } from "../integrations/tanstack-query/api-shapes";

/** Documents loaded with the profile (page 0) before infinite scroll kicks in. */
const PUBLICATION_RECENT_LIMIT = 12;
/** Page size for each subsequent infinite-scroll fetch. */
const PUBLICATION_PAGE_SIZE = 20;
const PUBLICATION_SKELETON_ROWS = 5;

export const Route = createFileRoute("/_layout/p/$did/$rkey")({
  loader: async ({ context, params, preload }) => {
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
      publication: { name: string; description: string };
      owner: { did: string; handle: string };
      theme: PublicationThemeColors;
    } | null;

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
    rowGap: spacing["4"],
    marginInlineStart: "auto",
    marginInlineEnd: "auto",
    maxWidth: "1320px",
    paddingBottom: spacing["6"],
    paddingInlineStart: {
      default: spacing["5"],
      [HERO_DESKTOP]: spacing["10"],
    },
    paddingInlineEnd: {
      default: spacing["5"],
      [HERO_DESKTOP]: spacing["10"],
    },
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
    minWidth: "200px",
    paddingTop: spacing["0.5"],
  },
  heroName: {
    // Isolate only: this is a single-line NAME, so it must keep the
    // surrounding UI alignment while still ordering its own characters
    // correctly. `dir="auto"` here would left-align it inside an RTL page.
    unicodeBidi: "isolate",
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: { default: "1.85rem", "@media (min-width: 48rem)": "2rem" },
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.xs,
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
  heroActsMobile: {
    display: { default: "flex", [HERO_DESKTOP]: "none" },
    flexDirection: "column",
    rowGap: spacing["2.5"],
  },
  heroActsMobilePrimary: {
    display: "flex",
  },
  heroFollowFull: {
    flexGrow: 1,
    width: "100%",
  },
  heroActsMobileSecondary: {
    alignItems: "center",
    columnGap: spacing["1.5"],
    display: "flex",
    flexWrap: "wrap",
    rowGap: spacing["1.5"],
  },
  heroActs: {
    alignItems: "center",
    columnGap: spacing["1.5"],
    display: { default: "none", [HERO_DESKTOP]: "flex" },
    flexShrink: 0,
    flexWrap: "wrap",
    justifyContent: "flex-end",
    rowGap: spacing["2.5"],
    paddingTop: spacing["1"],
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
  loadSentinel: {
    height: 1,
    marginTop: spacing["6"],
    width: "100%",
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

type TFunction = ReturnType<typeof useLingui>["t"];

function lastActive(iso: string | null, t: TFunction): string {
  if (!iso) return "—";
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "—";
  const days = Math.floor((Date.now() - parsed) / 86_400_000);
  if (days <= 0) return t`today`;
  if (days === 1) return t`yesterday`;
  if (days < 30) return t`${days}d ago`;
  const months = Math.floor(days / 30);
  if (days < 365) return t`${months}mo ago`;
  const years = Math.floor(days / 365);
  return t`${years}y ago`;
}

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
  const { t } = useLingui();
  const { publication: pub, owner } = header;
  const queryClient = useQueryClient();
  const { data: session } = useSuspenseQuery(user.getSessionQueryOptions);
  const readerScope = user.readerQueryScope(session);
  const { data: initialPage } = useSuspenseQuery(
    publicationApi.getPublicationDocumentsQueryOptions(uri, {
      limit: PUBLICATION_RECENT_LIMIT,
      offset: 0,
      readerScope,
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

  const showMarkAllRead = signedIn && unreadDocumentUris.length > 0;
  const markAllReadButton = showMarkAllRead ? (
    <MarkAllReadButton
      isPending={markingAllRead}
      closeSignal={markAllReadCloseSignal}
      onConfirm={() => markAllRead(uri)}
    />
  ) : null;

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
  }, [nextOffset, uri]);

  const loadMoreSentinelRef = useInfiniteScrollSentinel(
    loadMore,
    nextOffset != null,
    nextOffset ?? 0,
  );

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

            <div {...stylex.props(styles.heroActs)}>
              {markAllReadButton}
              <ShareMenu
                variant="icon"
                pageUrl={`${getPublicUrlClient()}/p/${did}/${rkey}`}
                embed={embedMeta ?? undefined}
              />
              <RssFeedButton
                name={pub.name}
                feedUrl={publicationFeedUrl(getPublicUrlClient(), did, rkey)}
                size="md"
              />
              {pub.url ? (
                <IconButton
                  variant="secondary"
                  size="md"
                  label={t`Open publication`}
                  onPress={() => {
                    window.open(pub.url, "_blank", "noopener,noreferrer");
                  }}
                >
                  <ExternalLink size={15} />
                </IconButton>
              ) : null}
              <AddToListButton
                publicationUri={pub.uri}
                signedIn={signedIn}
                size="md"
              />
              <FollowButton
                publicationUri={pub.uri}
                signedIn={signedIn}
                size="md"
                pub={pub}
              />
            </div>
          </div>

          {pub.description ? (
            <p dir="auto" {...stylex.props(styles.heroDesc)}>
              {pub.description}
            </p>
          ) : null}

          <div {...stylex.props(styles.statStrip)}>
            <Stat
              value={formatReaders(pub.subscriberCount)}
              label={t`Readers`}
            />
            <Stat value={String(pub.documentCount)} label={t`Posts`} />
            <Stat
              value={lastActive(pub.lastDocumentAt ?? null, t)}
              label={t`Last active`}
              isLast
            />
          </div>

          {signedIn && socialProof && socialProof.total > 0 ? (
            <PublicationSocialProofLine {...socialProof} />
          ) : null}

          <div {...stylex.props(styles.heroActsMobile)}>
            <div {...stylex.props(styles.heroActsMobilePrimary)}>
              <FollowButton
                publicationUri={pub.uri}
                signedIn={signedIn}
                size="md"
                pub={pub}
                responsive={false}
                style={styles.heroFollowFull}
              />
            </div>
            <div {...stylex.props(styles.heroActsMobileSecondary)}>
              {markAllReadButton}
              <AddToListButton
                publicationUri={pub.uri}
                signedIn={signedIn}
                size="md"
              />
              <RssFeedButton
                name={pub.name}
                feedUrl={publicationFeedUrl(getPublicUrlClient(), did, rkey)}
                size="md"
              />
              <ShareMenu
                variant="icon"
                size="md"
                pageUrl={`${getPublicUrlClient()}/p/${did}/${rkey}`}
                embed={embedMeta ?? undefined}
              />
              {pub.url ? (
                <IconButton
                  variant="secondary"
                  size="md"
                  label={t`Open publication`}
                  onPress={() => {
                    window.open(pub.url, "_blank", "noopener,noreferrer");
                  }}
                >
                  <ExternalLink size={15} />
                </IconButton>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <ReaderContent>
        <Flex direction="column" gap="6xl" style={styles.writing}>
          <PublicationLatestNote publicationUri={uri} />
          {documents.length === 0 ? (
            <div {...stylex.props(styles.emptyNote)}>
              <Trans>No posts indexed from this publication yet.</Trans>
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
          {documents.length > 0 ? (
            <div>
              <div
                ref={loadMoreSentinelRef}
                aria-hidden
                {...stylex.props(styles.loadSentinel)}
              />
              {loadingMore ? (
                <div {...stylex.props(styles.endNote)}>
                  <Trans>Loading more…</Trans>
                </div>
              ) : nextOffset == null ? (
                <div {...stylex.props(styles.endNote)}>
                  <Trans>You&apos;ve reached the end.</Trans>
                </div>
              ) : null}
            </div>
          ) : null}
        </Flex>
      </ReaderContent>
    </div>
  );
}

function MarkAllReadButton({
  isPending,
  closeSignal,
  onConfirm,
}: {
  isPending: boolean;
  /** Bumped by the parent when the mutation succeeds so the dialog closes. */
  closeSignal: number;
  onConfirm: () => void;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [closeSignal]);

  return (
    <AlertDialog
      isOpen={open}
      onOpenChange={setOpen}
      trigger={
        <IconButton variant="secondary" size="md" label={t`Mark all as read`}>
          <CheckCheck size={18} />
        </IconButton>
      }
    >
      <AlertDialogHeader>
        <Trans>Mark all as read?</Trans>
      </AlertDialogHeader>
      <AlertDialogDescription>
        <Trans>
          Every unread article from this publication will be marked read. This
          can’t be undone.
        </Trans>
      </AlertDialogDescription>
      <AlertDialogFooter>
        <AlertDialogCancelButton isDisabled={isPending} />
        <AlertDialogActionButton
          closeOnPress={false}
          isPending={isPending}
          onPress={onConfirm}
        >
          <Trans>Mark all as read</Trans>
        </AlertDialogActionButton>
      </AlertDialogFooter>
    </AlertDialog>
  );
}
