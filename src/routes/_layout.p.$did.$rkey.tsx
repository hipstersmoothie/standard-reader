import * as stylex from "@stylexjs/stylex";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { publicationApi } from "#/integrations/tanstack-query/api-publication.functions";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { publicationOgImageUrl, siteSocialMeta } from "#/lib/site-metadata";
import { ExternalLink } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ArticleCard } from "../integrations/tanstack-query/api-shapes";

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
} from "../components/reader/primitives";
import {
  applyMarkReadManyOptimisticUpdate,
  invalidateReadQueries,
} from "../components/reader/read-optimistic";
import { Button } from "../design-system/button";
import { Flex } from "../design-system/flex";
import { IconButton } from "../design-system/icon-button";
import { uiColor } from "../design-system/theme/color.stylex";
import { size as boxSize } from "../design-system/theme/semantic-spacing.stylex";
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

export const Route = createFileRoute("/_layout/p/$did/$rkey")({
  loader: async ({ context, params }) => {
    const uri = publicationUriFromParams(params.did, params.rkey);
    const profile = await context.queryClient.ensureQueryData(
      publicationApi.getPublicationProfileQueryOptions(uri, {
        recentLimit: PUBLICATION_RECENT_LIMIT,
      }),
    );
    await context.queryClient.ensureQueryData(
      readerApi.getFollowStatusQueryOptions(uri),
    );
    if (profile?.recentDocuments.length) {
      await context.queryClient.ensureQueryData(
        readerApi.getReadDocumentsQueryOptions(
          profile.recentDocuments.map((doc) => doc.uri),
        ),
      );
    }
    return {
      publicationName: profile?.publication.name ?? null,
      publicationDescription: profile?.publication.description ?? null,
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
    };
  },
  component: PublicationProfile,
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

function PublicationProfile() {
  const { did, rkey } = Route.useParams();
  const uri = publicationUriFromParams(did, rkey);
  const queryClient = useQueryClient();
  const { data: profile } = useSuspenseQuery(
    publicationApi.getPublicationProfileQueryOptions(uri, {
      recentLimit: PUBLICATION_RECENT_LIMIT,
    }),
  );
  const { data: follow } = useSuspenseQuery(
    readerApi.getFollowStatusQueryOptions(uri),
  );
  const { data: session } = useSuspenseQuery(user.getSessionQueryOptions);
  const signedIn = Boolean(session?.user);

  const [documents, setDocuments] = useState<Array<ArticleCard>>(
    () => profile?.recentDocuments ?? [],
  );
  const [nextOffset, setNextOffset] = useState<number | null>(() =>
    (profile?.recentDocuments.length ?? 0) === PUBLICATION_RECENT_LIMIT
      ? PUBLICATION_RECENT_LIMIT
      : null,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

  // Reset accumulated documents when navigating to a different publication.
  useEffect(() => {
    const recent = profile?.recentDocuments ?? [];
    setDocuments(recent);
    setNextOffset(
      recent.length === PUBLICATION_RECENT_LIMIT
        ? PUBLICATION_RECENT_LIMIT
        : null,
    );
  }, [profile]);

  const documentUris = useMemo(
    () => documents.map((doc) => doc.uri),
    [documents],
  );
  const { data: readUris } = useQuery({
    ...readerApi.getReadDocumentsQueryOptions(documentUris),
    enabled: signedIn && documentUris.length > 0,
    placeholderData: keepPreviousData,
  });
  const readSet = useMemo(() => new Set(readUris ?? []), [readUris]);
  const isUnread = (documentUri: string) =>
    signedIn && !readSet.has(documentUri);
  const unreadDocumentUris = useMemo(
    () =>
      documents
        .filter((doc) => signedIn && !readSet.has(doc.uri))
        .map((doc) => doc.uri),
    [documents, readSet, signedIn],
  );

  const { mutate: markAllRead, isPending: markingAllRead } = useMutation({
    ...readerApi.markPublicationAllReadMutationOptions(),
    onMutate: () => {
      applyMarkReadManyOptimisticUpdate(queryClient, unreadDocumentUris, {
        publicationUri: uri,
      });
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

  if (!profile) {
    return (
      <ReaderContent>
        <div {...stylex.props(styles.emptyNote)}>
          We couldn’t find that publication.
        </div>
      </ReaderContent>
    );
  }

  const { publication: pub, owner } = profile;
  const lead = documents[0];
  const rest = documents.slice(1);

  return (
    <div>
      <div {...stylex.props(styles.hero)}>
        <div {...stylex.props(styles.heroInner)}>
          <div {...stylex.props(styles.avRing)}>
            <PublicationAvatar pub={pub} size="xl" style={styles.avatar} />
          </div>

          <div {...stylex.props(styles.heroInfo)}>
            {pub.topic ? <Kicker>{pub.topic}</Kicker> : null}
            <h1 {...stylex.props(styles.heroName)}>{pub.name}</h1>
            {pub.description ? (
              <p {...stylex.props(styles.heroDesc)}>{pub.description}</p>
            ) : null}
            <div {...stylex.props(styles.stats)}>
              {owner.handle ? (
                <a
                  href={`https://bsky.app/profile/${owner.handle}`}
                  target="_blank"
                  rel="noreferrer"
                  {...stylex.props(styles.handleLink)}
                >
                  <Handle>@{owner.handle}</Handle>
                </a>
              ) : null}
              <Stat
                value={formatReaders(pub.subscriberCount)}
                label="readers"
              />
              <Stat value={String(pub.documentCount)} label="posts" />
              <Stat
                value={lastActive(
                  pub.lastDocumentAt ?? lead?.publishedAt ?? null,
                )}
                label=""
              />
            </div>
          </div>

          <div {...stylex.props(styles.heroActs)}>
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
            <FollowButton
              publicationUri={pub.uri}
              signedIn={signedIn}
              size="md"
              pub={pub}
              initialFollowing={follow.isFollowing}
            />
          </div>
        </div>
      </div>

      <ReaderContent>
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
                  unread={isUnread(lead.uri)}
                />
              ) : null}
              {rest.map((article) => (
                <ArticleRow
                  key={article.uri}
                  article={article}
                  showByline={false}
                  unread={isUnread(article.uri)}
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
      </ReaderContent>
    </div>
  );
}
