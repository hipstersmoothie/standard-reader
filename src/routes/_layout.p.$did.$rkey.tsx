import * as stylex from "@stylexjs/stylex";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { authorApi } from "#/integrations/tanstack-query/api-author.functions";
import { publicationApi } from "#/integrations/tanstack-query/api-publication.functions";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { publicationOgImageUrl, siteSocialMeta } from "#/lib/site-metadata";
import { useTrackReadingHistory } from "#/lib/use-track-reading-history";
import { ExternalLink } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ArticleCard } from "../integrations/tanstack-query/api-shapes";

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
  Kicker,
  PublicationAvatar,
  ReaderContent,
  SectionHead,
  Topic,
} from "../components/reader/primitives";
import { PublicationSocialProofLine } from "../components/reader/publication-social-proof";
import {
  applyMarkReadManyOptimisticUpdate,
  invalidateReadQueries,
  isArticleUnreadForReader,
} from "../components/reader/read-optimistic";
import { ShareMenu } from "../components/reader/share-menu";
import { AuthorSifaResumeChip } from "../components/reader/sifa-resume-chip";
import { Button } from "../design-system/button";
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
      if (signedIn) void context.queryClient.prefetchQuery(socialProofOptions);
      return {
        publicationName: null,
        publicationDescription: null,
      };
    }

    // Await header + documents (+ social proof for signed-in readers) in
    // parallel so the page paints in one shot instead of stacking loading
    // states. All three are fast DB queries (P50 63-148ms on prod).
    const awaitables: Array<Promise<unknown>> = [
      context.queryClient.ensureQueryData(headerOptions),
      context.queryClient.ensureQueryData(recentDocumentsOptions),
    ];
    if (signedIn) {
      awaitables.push(context.queryClient.ensureQueryData(socialProofOptions));
    }
    const results = await Promise.all(awaitables);
    const header = results[0] as {
      publication: { name: string; description: string };
      owner: { did: string; handle: string };
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
      ],
    };
  },
  component: PublicationProfilePage,
  pendingComponent: PublicationPending,
});

const styles = stylex.create({
  hero: {
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
  },
  heroInner: {
    alignItems: "flex-start",
    boxSizing: "border-box",
    columnGap: spacing["5"],
    display: "flex",
    flexWrap: "wrap",
    rowGap: spacing["4"],
    marginLeft: "auto",
    marginRight: "auto",
    maxWidth: "1320px",
    paddingBottom: spacing["6"],
    paddingLeft: {
      default: spacing["5"],
      "@media (min-width: 40rem)": spacing["10"],
    },
    paddingRight: {
      default: spacing["5"],
      "@media (min-width: 40rem)": spacing["10"],
    },
    paddingTop: spacing["6"],
    width: "100%",
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
    minWidth: "240px",
    paddingTop: spacing["0.5"],
  },
  heroName: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: { default: "1.85rem", "@media (min-width: 48rem)": "2rem" },
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.xs,
    marginBottom: spacing["0"],
    marginTop: spacing["2"],
  },
  heroDesc: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.sm,
    marginBottom: spacing["0"],
    marginTop: spacing["2"],
    maxWidth: "60ch",
  },
  handleLink: {
    textDecoration: { default: "none", ":hover": "underline" },
    color: "inherit",
    textDecorationColor: "currentColor",
    textUnderlineOffset: "2px",
  },
  stats: {
    alignItems: "baseline",
    color: uiColor.text1,
    columnGap: spacing["6"],
    display: "flex",
    flexWrap: "wrap",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    rowGap: spacing["2"],
    marginTop: spacing["4"],
  },
  statValue: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginRight: spacing["1"],
  },
  heroActs: {
    alignItems: "center",
    columnGap: spacing["1.5"],
    display: "flex",
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

function lastActive(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <span>
      <span {...stylex.props(styles.statValue)}>{value}</span>
      {label}
    </span>
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
  return (
    <Flex
      direction="column"
      gap="6xl"
      style={styles.writing}
      aria-busy="true"
      aria-label="Loading recent writing"
    >
      <SectionHead kicker="Latest" title="Recent writing" />
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
  return (
    <div aria-busy="true" aria-label="Loading publication">
      <div {...stylex.props(styles.hero)}>
        <div {...stylex.props(styles.heroInner)}>
          <div {...stylex.props(styles.avRing)}>
            <Skeleton variant="circle" size="lg" />
          </div>
          <div {...stylex.props(styles.heroInfo)}>
            <Skeleton variant="rectangle" style={styles.heroSkeletonName} />
            <Skeleton variant="rectangle" style={styles.heroSkeletonDesc} />
            <Skeleton variant="rectangle" style={styles.heroSkeletonStats} />
          </div>
          <div {...stylex.props(styles.heroActs)}>
            <Skeleton variant="rectangle" style={styles.heroSkeletonActs} />
          </div>
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
          We couldn’t find that publication.
        </div>
      </ReaderContent>
    );
  }

  const { publication: pub, owner } = header;

  return (
    <div>
      <div {...stylex.props(styles.hero)}>
        <div {...stylex.props(styles.heroInner)}>
          <div {...stylex.props(styles.avRing)}>
            <PublicationAvatar pub={pub} size="xl" style={styles.avatar} />
          </div>

          <div {...stylex.props(styles.heroInfo)}>
            {pub.topic ? (
              <Kicker>
                <Topic name={pub.topic} />
              </Kicker>
            ) : null}
            <h1 {...stylex.props(styles.heroName)}>{pub.name}</h1>
            {pub.description ? (
              <p {...stylex.props(styles.heroDesc)}>{pub.description}</p>
            ) : null}
            <div {...stylex.props(styles.stats)}>
              {owner.handle ? (
                <Link
                  to="/u/$did"
                  params={{ did: owner.did }}
                  {...stylex.props(styles.handleLink)}
                >
                  <Handle>@{owner.handle}</Handle>
                </Link>
              ) : null}
              <Stat
                value={formatReaders(pub.subscriberCount)}
                label="readers"
              />
              <Stat value={String(pub.documentCount)} label="posts" />
              <Stat value={lastActive(pub.lastDocumentAt ?? null)} label="" />
              <AuthorSifaResumeChip did={owner.did} handle={owner.handle} />
            </div>
            {signedIn && socialProof && socialProof.total > 0 ? (
              <PublicationSocialProofLine {...socialProof} />
            ) : null}
          </div>

          <div {...stylex.props(styles.heroActs)}>
            <ShareMenu
              variant="icon"
              pageUrl={`${getPublicUrlClient()}/p/${did}/${rkey}`}
              embed={embedMeta ?? undefined}
            />
            {pub.url ? (
              <IconButton
                variant="secondary"
                size="md"
                label="Open publication"
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
      </div>

      <ReaderContent>
        <PublicationRecentWriting uri={uri} signedIn={signedIn} />
      </ReaderContent>
    </div>
  );
}

function PublicationRecentWriting({
  uri,
  signedIn,
}: {
  uri: string;
  signedIn: boolean;
}) {
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
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

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
    onError: () => {
      invalidateReadQueries(queryClient);
    },
  });

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

  useEffect(() => {
    if (nextOffset == null) return;
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;

    const root = sentinel.closest("[data-app-scroller]");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { root, rootMargin: "1200px 0px", threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [nextOffset, loadMore]);

  const lead = documents[0];
  const rest = documents.slice(1);

  return (
    <Flex direction="column" gap="6xl" style={styles.writing}>
      <SectionHead
        kicker="Latest"
        title="Recent writing"
        action={
          signedIn && unreadDocumentUris.length > 0 ? (
            <Button
              variant="tertiary"
              size="sm"
              isPending={markingAllRead}
              onPress={() => markAllRead(uri)}
            >
              Mark all as read
            </Button>
          ) : undefined
        }
      />
      {documents.length === 0 ? (
        <div {...stylex.props(styles.emptyNote)}>
          No posts indexed from this publication yet.
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
            <div {...stylex.props(styles.endNote)}>Loading more…</div>
          ) : nextOffset == null ? (
            <div {...stylex.props(styles.endNote)}>
              You&apos;ve reached the end.
            </div>
          ) : null}
        </div>
      ) : null}
    </Flex>
  );
}
