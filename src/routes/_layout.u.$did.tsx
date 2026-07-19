import { Plural, Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  createFileRoute,
  createLink,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { ExternalLink, ListPlus, Settings } from "lucide-react";
import type { RefObject } from "react";
import { useCallback, useRef, useState } from "react";
import { Link as AriaLink } from "react-aria-components";
import { z } from "zod";

import { formatReaders, initials } from "#/components/reader/format";
import { ButtonLink } from "#/components/router-links";
import type {
  AuthorProfile,
  AuthorReader,
} from "#/integrations/tanstack-query/api-author.functions";
import {
  AUTHOR_ACTIVITY_PAGE_SIZE,
  authorApi,
} from "#/integrations/tanstack-query/api-author.functions";
import { listApi } from "#/integrations/tanstack-query/api-lists.functions";
import type { SubscriptionList } from "#/integrations/tanstack-query/api-lists.functions";
import type {
  ArticleCard,
  PublicationCard,
} from "#/integrations/tanstack-query/api-shapes";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import type { HideableTabId, ProfileTabId } from "#/lib/profile-tabs";
import { getPublicUrlClient } from "#/lib/public-url";
import {
  authorFeedUrl,
  profileOgImageUrl,
  siteSocialMeta,
} from "#/lib/site-metadata";

import { AddToListButton } from "../components/reader/add-to-list-button";
import { AuthorProfileLink } from "../components/reader/author-profile-link";
import { ArticleRow, PubDirectoryRow } from "../components/reader/cards";
import { FollowUserButton } from "../components/reader/follow-user-button";
import { LinkifiedText } from "../components/reader/linkified-text";
import {
  Handle,
  Kicker,
  ReaderContent,
  SectionHead,
} from "../components/reader/primitives";
import { ProfileTabsSettingsModal } from "../components/reader/profile-tabs-settings-modal";
import { RssFeedButton } from "../components/reader/rss-feed-button";
import { ShareMenu } from "../components/reader/share-menu";
import { AuthorSifaResumeChip } from "../components/reader/sifa-resume-chip";
import { useInfiniteScrollSentinel } from "../components/reader/use-infinite-scroll-sentinel";
import { Avatar } from "../design-system/avatar";
import { Badge } from "../design-system/badge";
import { Button } from "../design-system/button";
import { IconButton } from "../design-system/icon-button";
import { Tab, TabList, TabPanel, Tabs } from "../design-system/tabs";
import { uiColor } from "../design-system/theme/color.stylex";
import { radius } from "../design-system/theme/radius.stylex";
import { ui } from "../design-system/theme/semantic-color.stylex";
import { size as boxSize } from "../design-system/theme/semantic-spacing.stylex";
import { spacing } from "../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "../design-system/theme/typography.stylex";

const AUTHOR_PAGE_SIZE = 24;

const authorSearchSchema = z.object({
  tab: z
    .enum([
      "posts",
      "publications",
      "subscriptions",
      "readers",
      "lists",
      "likes",
    ])
    .default("posts"),
});

type AuthorSearch = z.infer<typeof authorSearchSchema>;
type AuthorTab = AuthorSearch["tab"];

export const Route = createFileRoute("/_layout/u/$did")({
  validateSearch: authorSearchSchema,
  loader: async ({ context, params }) => {
    const page = await context.queryClient.ensureQueryData(
      authorApi.getAuthorProfileQueryOptions(params.did, {
        limit: AUTHOR_PAGE_SIZE,
      }),
    );
    const profile = page?.profile;
    // `$did` accepts a handle too — canonicalize to the resolved DID so
    // handle-based links (e.g. `@mentions` in a bio) redirect to a stable URL.
    if (profile?.did && profile.did !== params.did) {
      throw redirect({
        to: "/u/$did",
        params: { did: profile.did },
        search: (prev) => prev,
      });
    }
    if (page) {
      void context.queryClient.prefetchQuery(
        authorApi.getAuthorSifaProfileQueryOptions(
          params.did,
          profile?.handle ?? null,
        ),
      );
    }
    const displayName =
      profile?.displayName?.trim() ||
      (profile?.handle ? `@${profile.handle}` : null);
    return {
      displayName,
      description: profile?.description ?? null,
      handle: profile?.handle ?? null,
    };
  },
  head: ({ loaderData, match }) => {
    const name = loaderData?.displayName;
    if (!name) {
      return { meta: [{ title: "Standard Reader" }] };
    }
    const baseUrl = getPublicUrlClient();
    const handle = loaderData?.handle;
    return {
      meta: siteSocialMeta({
        title: `${name} · Standard Reader`,
        description:
          loaderData?.description?.trim() ||
          `Publications by ${handle ? `@${handle}` : name} on Standard Reader.`,
        url: `${baseUrl}${match.pathname}`,
        ogImage: profileOgImageUrl(baseUrl, match.params.did),
      }),
      links: [
        {
          rel: "alternate",
          type: "application/rss+xml",
          title: `${name} · Standard Reader`,
          href: authorFeedUrl(baseUrl, match.params.did),
        },
      ],
    };
  },
  component: AuthorProfilePage,
});

const HERO_DESKTOP = "@media (min-width: 40rem)";

const styles = stylex.create({
  hero: {
    display: "flex",
    flexDirection: "column",
  },
  heroInner: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    rowGap: spacing["4"],
    marginInlineStart: "auto",
    marginInlineEnd: "auto",
    maxWidth: "1320px",
    paddingBottom: spacing["4"],
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
  avatarWrap: {
    flexShrink: 0,
    alignSelf: "center",
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
  heroActsMobile: {
    columnGap: spacing["1.5"],
    display: { default: "flex", [HERO_DESKTOP]: "none" },
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
  tabs: {
    paddingBottom: spacing["10"],
  },
  tabBar: {
    width: "100%",
  },
  tabBarInner: {
    boxSizing: "border-box",
    marginInlineStart: "auto",
    marginInlineEnd: "auto",
    maxWidth: "1320px",
    paddingInlineStart: {
      default: spacing["5"],
      [HERO_DESKTOP]: spacing["10"],
    },
    paddingInlineEnd: {
      default: spacing["5"],
      [HERO_DESKTOP]: spacing["10"],
    },
    paddingTop: spacing["2"],
    width: "100%",
  },
  tabList: {
    borderBottomStyle: "none",
    borderBottomWidth: 0,
  },
  tabCount: {
    marginInlineStart: spacing["2"],
  },
  tabRule: {
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    width: "100%",
  },
  tabPanel: {
    paddingInlineStart: spacing["0"],
    paddingInlineEnd: spacing["0"],
    paddingTop: spacing["6"],
  },
  listRow: {
    borderRadius: spacing["2"],
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    marginTop: spacing["2"],
    paddingBottom: spacing["5"],
    paddingInlineStart: spacing["3"],
    paddingInlineEnd: spacing["3"],
    paddingTop: spacing["6"],
    rowGap: spacing["1"],
    textDecoration: "none",
    width: "100%",
  },
  listRowFirst: {
    borderTopWidth: 0,
    marginTop: spacing["0"],
    paddingTop: spacing["4"],
  },
  listRowLink: {
    alignItems: "center",
    color: uiColor.text2,
    columnGap: spacing["1.5"],
    display: "inline-flex",
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    width: "fit-content",
  },
  listRowDesc: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  listRowMeta: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
  },
  readerRow: {
    alignItems: "center",
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    columnGap: spacing["3"],
    display: "flex",
    paddingBottom: spacing["3"],
    paddingTop: spacing["3"],
  },
  readerRowFirst: {
    borderTopWidth: 0,
  },
  readerAvatar: {
    flexShrink: 0,
  },
  readerLink: {
    color: "inherit",
    textDecoration: { default: "none", ":hover": "underline" },
  },
  readerName: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  readerHandle: {
    marginTop: spacing["0.5"],
  },
  // Generous separation between the author's own publications and the ones
  // they're only featured in; `SectionHead` supplies the tighter space below
  // its title, so the rhythm reads as one break, not two.
  featuredSection: {
    marginTop: spacing["10"],
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
  profileEmptyCard: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    marginTop: spacing["8"],
    maxWidth: "100%",
    paddingBottom: spacing["10"],
    paddingInlineStart: {
      default: spacing["6"],
      [HERO_DESKTOP]: spacing["8"],
    },
    paddingInlineEnd: {
      default: spacing["6"],
      [HERO_DESKTOP]: spacing["8"],
    },
    paddingTop: spacing["10"],
    rowGap: spacing["4"],
    width: "100%",
  },
  profileEmptyTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
  profileEmptyDek: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.sm,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
    maxWidth: "52ch",
  },
  profileEmptyActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: spacing["2"],
    marginTop: spacing["2"],
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

function authorDisplayName(profile: {
  displayName: string | null;
  handle: string | null;
}): string | null {
  if (profile.displayName?.trim()) return profile.displayName.trim();
  if (profile.handle) return `@${profile.handle}`;
  return null;
}

function useInfiniteScroll(
  nextOffset: number | null,
  loadMore: () => Promise<void>,
) {
  const loadingMoreRef = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    if (nextOffset == null || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      await loadMore();
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [loadMore, nextOffset]);

  const sentinelRef = useInfiniteScrollSentinel(
    load,
    nextOffset != null,
    nextOffset ?? 0,
  );

  return { loadingMore, sentinelRef };
}

function LoadMoreFooter({
  nextOffset,
  loadingMore,
  sentinelRef,
  showEndNote = false,
}: {
  nextOffset: number | null;
  loadingMore: boolean;
  sentinelRef: RefObject<HTMLDivElement | null>;
  showEndNote?: boolean;
}) {
  if (nextOffset == null) {
    return showEndNote ? (
      <div {...stylex.props(styles.endNote)}>
        <Trans>You&apos;ve reached the end.</Trans>
      </div>
    ) : null;
  }

  return (
    <div>
      <div
        ref={sentinelRef}
        aria-hidden
        {...stylex.props(styles.loadSentinel)}
      />
      {loadingMore ? (
        <div {...stylex.props(styles.endNote)}>
          <Trans>Loading more…</Trans>
        </div>
      ) : null}
    </div>
  );
}

function AuthorProfilePage() {
  const { did } = Route.useParams();
  const { data: initialPage } = useSuspenseQuery(
    authorApi.getAuthorProfileQueryOptions(did, {
      limit: AUTHOR_PAGE_SIZE,
      activityLimit: AUTHOR_ACTIVITY_PAGE_SIZE,
    }),
  );

  if (initialPage == null) {
    return null;
  }

  return <AuthorProfileContent key={did} did={did} initialPage={initialPage} />;
}

function AuthorProfileContent({
  did,
  initialPage,
}: {
  did: string;
  initialPage: AuthorProfile;
}) {
  const { t } = useLingui();
  const { data: lists } = useQuery(listApi.getAuthorListsQueryOptions(did));

  const { data: session } = useQuery(user.getSessionQueryOptions);
  const isOwnProfile = session?.user?.did != null && session.user.did === did;

  const queryClient = useQueryClient();
  const [hiddenTabs, setHiddenTabs] = useState<Array<HideableTabId>>(
    initialPage.hiddenTabs,
  );
  const [showLikes, setShowLikes] = useState<boolean>(initialPage.showLikes);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const saveTabSettings = useMutation({
    mutationFn: (next: {
      hiddenTabs: Array<HideableTabId>;
      showLikes: boolean;
    }) => user.setProfileTabSettings({ data: next }),
    onSuccess: (result) => {
      // Keep every cached page of this profile in sync so a remount reflects
      // the saved visibility without a refetch.
      queryClient.setQueriesData<AuthorProfile | null>(
        { queryKey: ["author", "profile", did] },
        (prev) =>
          prev
            ? {
                ...prev,
                hiddenTabs: result.hiddenTabs,
                showLikes: result.showLikes,
              }
            : prev,
      );
    },
  });

  const onToggleTab = (tabId: ProfileTabId, visible: boolean) => {
    const prevHidden = hiddenTabs;
    const prevShowLikes = showLikes;
    let nextHidden = hiddenTabs;
    let nextShowLikes = showLikes;
    if (tabId === "likes") {
      // The "Recommendations" tab (id "likes") is opt-in, tracked separately
      // from the opt-out hidden list.
      nextShowLikes = visible;
      setShowLikes(visible);
    } else {
      nextHidden = visible
        ? hiddenTabs.filter((id) => id !== tabId)
        : [...hiddenTabs.filter((id) => id !== tabId), tabId];
      setHiddenTabs(nextHidden);
    }
    saveTabSettings.mutate(
      { hiddenTabs: nextHidden, showLikes: nextShowLikes },
      {
        onError: () => {
          setHiddenTabs(prevHidden);
          setShowLikes(prevShowLikes);
        },
      },
    );
  };

  const { tab: requestedTab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const onTabChange = (key: React.Key) => {
    const next = key as AuthorTab;
    void navigate({ search: (prev: AuthorSearch) => ({ ...prev, tab: next }) });
  };

  if (!initialPage) {
    return (
      <ReaderContent>
        <div {...stylex.props(styles.emptyNote)}>
          <Trans>We couldn&apos;t find that author.</Trans>
        </div>
      </ReaderContent>
    );
  }

  const { profile, stats } = initialPage;
  const name = authorDisplayName(profile) ?? t`Author`;
  const pageUrl = `${getPublicUrlClient()}/u/${did}`;
  // Three profile kinds drive the hero label and empty state:
  //  - "author": has published work of their own (posts or publications).
  //  - "reader": no authored work, but some reading footprint (follows,
  //    followers, lists, or recommendations).
  //  - "empty": no footprint at all — someone pulled in from the network who
  //    hasn't done anything on Standard Reader yet. Not a reader; point them
  //    at their Bluesky profile instead.
  const hasAuthored = stats.documentCount > 0 || stats.publicationCount > 0;
  const hasReaderActivity =
    stats.subscriptionCount > 0 ||
    stats.subscriberCount > 0 ||
    stats.recommendationCount > 0 ||
    (lists?.length ?? 0) > 0;
  const profileKind: "author" | "reader" | "empty" = hasAuthored
    ? "author"
    : hasReaderActivity
      ? "reader"
      : "empty";

  // Tabs that have content to show. The owner can hide any of these from their
  // public profile via the settings modal; `hiddenTabs` is applied for everyone.
  const candidateTabs: Array<AuthorTab> = [
    stats.documentCount > 0 && ("posts" as const),
    stats.publicationCount > 0 && ("publications" as const),
    stats.subscriptionCount > 0 && ("subscriptions" as const),
    stats.subscriberCount > 0 && ("readers" as const),
    lists && lists.length > 0 && ("lists" as const),
    stats.recommendationCount > 0 && ("likes" as const),
  ].filter((id): id is AuthorTab => id !== false);
  const visibleTabs = candidateTabs.filter((id) => {
    // "Recommendations" (id "likes") is opt-in (default off); the rest are
    // opt-out (default on).
    if (id === "likes") return showLikes;
    return !hiddenTabs.includes(id);
  });
  const tab = visibleTabs.includes(requestedTab)
    ? requestedTab
    : (visibleTabs[0] ?? requestedTab);

  return (
    <div>
      <div {...stylex.props(styles.hero)}>
        <div {...stylex.props(styles.heroInner)}>
          <div {...stylex.props(styles.heroTop)}>
            <div {...stylex.props(styles.avatarWrap)}>
              <Avatar
                size="xl"
                src={profile.avatarUrl ?? undefined}
                fallback={initials(name)}
                alt={name}
                style={styles.avatar}
              />
            </div>

            <div {...stylex.props(styles.heroInfo)}>
              {profileKind === "empty" ? null : (
                <Kicker>
                  {profileKind === "author" ? (
                    <Trans>Author</Trans>
                  ) : (
                    <Trans>Reader</Trans>
                  )}
                </Kicker>
              )}
              <h1 {...stylex.props(styles.heroName)}>{name}</h1>
              {profile.handle ? (
                <Handle style={styles.heroHandle}>@{profile.handle}</Handle>
              ) : null}
            </div>

            <div {...stylex.props(styles.heroActs)}>
              <ShareMenu variant="icon" pageUrl={pageUrl} />
              <RssFeedButton
                name={name}
                feedUrl={authorFeedUrl(getPublicUrlClient(), did)}
                size="md"
              />
              {profile.handle ? (
                <IconButton
                  variant="secondary"
                  size="md"
                  label={t`View on Bluesky`}
                  onPress={() => {
                    window.open(
                      `https://bsky.app/profile/${profile.handle}`,
                      "_blank",
                      "noopener,noreferrer",
                    );
                  }}
                >
                  <ExternalLink size={15} />
                </IconButton>
              ) : null}
              <AuthorSifaResumeChip
                did={did}
                handle={profile.handle}
                variant="icon"
              />
              {isOwnProfile ? (
                <IconButton
                  variant="secondary"
                  size="md"
                  label={t`Profile settings`}
                  onPress={() => setSettingsOpen(true)}
                >
                  <Settings size={15} />
                </IconButton>
              ) : (
                <>
                  {session?.user?.did ? <AddToListButton did={did} /> : null}
                  <FollowUserButton
                    did={did}
                    signedIn={session?.user?.did != null}
                    user={{
                      did,
                      handle: profile.handle,
                      displayName: profile.displayName ?? null,
                      avatarUrl: profile.avatarUrl ?? null,
                    }}
                  />
                </>
              )}
            </div>
          </div>

          {profile.description ? (
            <p {...stylex.props(styles.heroDesc)}>
              <LinkifiedText text={profile.description} />
            </p>
          ) : null}

          <div {...stylex.props(styles.heroActsMobile)}>
            <ShareMenu variant="icon" size="md" pageUrl={pageUrl} />
            <RssFeedButton
              name={name}
              feedUrl={authorFeedUrl(getPublicUrlClient(), did)}
              size="md"
            />
            {profile.handle ? (
              <IconButton
                variant="secondary"
                size="md"
                label={t`View on Bluesky`}
                onPress={() => {
                  window.open(
                    `https://bsky.app/profile/${profile.handle}`,
                    "_blank",
                    "noopener,noreferrer",
                  );
                }}
              >
                <ExternalLink size={15} />
              </IconButton>
            ) : null}
            <AuthorSifaResumeChip
              did={did}
              handle={profile.handle}
              variant="icon"
            />
            {isOwnProfile ? (
              <IconButton
                variant="secondary"
                size="md"
                label={t`Profile settings`}
                onPress={() => setSettingsOpen(true)}
              >
                <Settings size={15} />
              </IconButton>
            ) : (
              <>
                {session?.user?.did ? <AddToListButton did={did} /> : null}
                <FollowUserButton
                  did={did}
                  signedIn={session?.user?.did != null}
                  user={{
                    did,
                    handle: profile.handle,
                    displayName: profile.displayName ?? null,
                    avatarUrl: profile.avatarUrl ?? null,
                  }}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {visibleTabs.length === 0 ? (
        <ReaderContent>
          <ProfileEmptyState
            name={name}
            handle={profile.handle}
            isOwnProfile={isOwnProfile}
            isFullyEmpty={profileKind === "empty"}
          />
        </ReaderContent>
      ) : (
        <Tabs
          selectedKey={tab}
          onSelectionChange={onTabChange}
          style={styles.tabs}
        >
          <div {...stylex.props(styles.tabBar)}>
            <div {...stylex.props(styles.tabBarInner)}>
              <TabList aria-label={t`Author sections`} style={styles.tabList}>
                {visibleTabs.includes("posts") ? (
                  <Tab id="posts">
                    <Trans>Posts</Trans>
                    <Badge size="sm" style={styles.tabCount}>
                      {stats.documentCount}
                    </Badge>
                  </Tab>
                ) : null}
                {visibleTabs.includes("publications") ? (
                  <Tab id="publications">
                    <Trans>Publications</Trans>
                    <Badge size="sm" style={styles.tabCount}>
                      {stats.publicationCount}
                    </Badge>
                  </Tab>
                ) : null}
                {visibleTabs.includes("subscriptions") ? (
                  <Tab id="subscriptions">
                    <Trans>Subscriptions</Trans>
                    <Badge size="sm" style={styles.tabCount}>
                      {stats.subscriptionCount}
                    </Badge>
                  </Tab>
                ) : null}
                {visibleTabs.includes("readers") ? (
                  <Tab id="readers">
                    <Trans>Readers</Trans>
                    <Badge size="sm" style={styles.tabCount}>
                      {formatReaders(stats.subscriberCount)}
                    </Badge>
                  </Tab>
                ) : null}
                {visibleTabs.includes("lists") && lists ? (
                  <Tab id="lists">
                    <Trans>Lists</Trans>
                    <Badge size="sm" style={styles.tabCount}>
                      {lists.length}
                    </Badge>
                  </Tab>
                ) : null}
                {visibleTabs.includes("likes") ? (
                  <Tab id="likes">
                    <Trans>Recommendations</Trans>
                    <Badge size="sm" style={styles.tabCount}>
                      {stats.recommendationCount}
                    </Badge>
                  </Tab>
                ) : null}
              </TabList>
            </div>
            <div {...stylex.props(styles.tabRule)} aria-hidden />
          </div>

          <ReaderContent>
            {visibleTabs.includes("posts") ? (
              <TabPanel id="posts" style={styles.tabPanel}>
                <AuthorPostsPanel
                  did={did}
                  initialItems={initialPage.documents}
                  initialNextOffset={initialPage.documentsNextOffset}
                />
              </TabPanel>
            ) : null}

            {visibleTabs.includes("publications") ? (
              <TabPanel id="publications" style={styles.tabPanel}>
                <AuthorPublicationsPanel
                  did={did}
                  initialItems={initialPage.publications}
                  initialNextOffset={initialPage.publicationsNextOffset}
                />
              </TabPanel>
            ) : null}

            {visibleTabs.includes("subscriptions") ? (
              <TabPanel id="subscriptions" style={styles.tabPanel}>
                <AuthorSubscriptionsPanel
                  did={did}
                  initialItems={initialPage.subscriptions}
                  initialNextOffset={initialPage.subscriptionsNextOffset}
                />
              </TabPanel>
            ) : null}

            {visibleTabs.includes("readers") ? (
              <TabPanel id="readers" style={styles.tabPanel}>
                <AuthorReadersPanel
                  did={did}
                  initialItems={initialPage.readers}
                  initialNextOffset={initialPage.readersNextOffset}
                />
              </TabPanel>
            ) : null}

            {visibleTabs.includes("lists") && lists ? (
              <TabPanel id="lists" style={styles.tabPanel}>
                <AuthorListsPanel did={did} lists={lists} />
              </TabPanel>
            ) : null}

            {visibleTabs.includes("likes") ? (
              <TabPanel id="likes" style={styles.tabPanel}>
                <AuthorLikesPanel
                  did={did}
                  initialItems={initialPage.recommendations}
                  initialNextOffset={initialPage.recommendationsNextOffset}
                />
              </TabPanel>
            ) : null}
          </ReaderContent>
        </Tabs>
      )}

      {isOwnProfile ? (
        <ProfileTabsSettingsModal
          isOpen={settingsOpen}
          onOpenChange={setSettingsOpen}
          candidateTabs={candidateTabs}
          visibleTabs={visibleTabs}
          onToggleTab={onToggleTab}
        />
      ) : null}
    </div>
  );
}

function ProfileEmptyState({
  name,
  handle,
  isOwnProfile,
  isFullyEmpty,
}: {
  name: string;
  handle: string | null;
  isOwnProfile: boolean;
  isFullyEmpty: boolean;
}) {
  if (isOwnProfile) {
    return (
      <div {...stylex.props(styles.profileEmptyCard)}>
        <h2 {...stylex.props(styles.profileEmptyTitle)}>
          <Trans>Your profile is quiet for now</Trans>
        </h2>
        <p {...stylex.props(styles.profileEmptyDek)}>
          <Trans>
            Follow the publications you love and build reading lists worth
            sharing — they&apos;ll gather here for others to discover.
            Everything you do lives in your own repo, owned by you.
          </Trans>
        </p>
        <div {...stylex.props(styles.profileEmptyActions)}>
          <ButtonLink to="/discover" variant="primary" size="lg">
            <Trans>Discover publications</Trans>
          </ButtonLink>
          <ButtonLink to="/" variant="secondary" size="lg">
            <Trans>Browse your feed</Trans>
          </ButtonLink>
        </div>
      </div>
    );
  }

  // A profile with no footprint at all: don't call them a reader. Lead with
  // their Bluesky profile, which is where they actually are.
  if (isFullyEmpty) {
    return (
      <div {...stylex.props(styles.profileEmptyCard)}>
        <h2 {...stylex.props(styles.profileEmptyTitle)}>
          <Trans>Not on Standard Reader yet</Trans>
        </h2>
        <p {...stylex.props(styles.profileEmptyDek)}>
          {handle ? (
            <Trans>
              {name} hasn&apos;t started reading or publishing here. You can
              find them on Bluesky.
            </Trans>
          ) : (
            <Trans>
              {name} hasn&apos;t started reading or publishing here.
            </Trans>
          )}
        </p>
        {handle ? (
          <div {...stylex.props(styles.profileEmptyActions)}>
            <Button
              variant="primary"
              size="lg"
              onPress={() => {
                window.open(
                  `https://bsky.app/profile/${handle}`,
                  "_blank",
                  "noopener,noreferrer",
                );
              }}
            >
              <ExternalLink size={16} aria-hidden />
              <Trans>View on Bluesky</Trans>
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  // Has a reading footprint, but nothing is publicly visible right now (e.g.
  // the owner hid every tab).
  return (
    <div {...stylex.props(styles.profileEmptyCard)}>
      <h2 {...stylex.props(styles.profileEmptyTitle)}>
        <Trans>Nothing here yet</Trans>
      </h2>
      <p {...stylex.props(styles.profileEmptyDek)}>
        <Trans>
          {name} hasn&apos;t published or shared anything public yet. Follow
          along to catch their work when it arrives.
        </Trans>
      </p>
    </div>
  );
}

function AuthorPublicationsPanel({
  did,
  initialItems,
  initialNextOffset,
}: {
  did: string;
  initialItems: Array<PublicationCard>;
  initialNextOffset: number | null;
}) {
  const { t } = useLingui();
  const [items, setItems] = useState(initialItems);
  const [nextOffset, setNextOffset] = useState(initialNextOffset);

  const loadMore = useCallback(async () => {
    if (nextOffset == null) return;
    const page = await authorApi.getAuthorPublications({
      data: { did, limit: AUTHOR_PAGE_SIZE, offset: nextOffset },
    });
    setItems((prev) => {
      const seen = new Set(prev.map((pub) => pub.uri));
      return [...prev, ...page.items.filter((pub) => !seen.has(pub.uri))];
    });
    setNextOffset(page.nextOffset);
  }, [did, nextOffset]);
  const scroll = useInfiniteScroll(nextOffset, loadMore);

  if (items.length === 0) {
    return (
      <div {...stylex.props(styles.emptyNote)}>
        <Trans>No publications indexed yet.</Trans>
      </div>
    );
  }

  // The query returns owned publications first, then ones the author is only
  // featured in, so a partition keeps both groups intact as pages accumulate.
  const owned = items.filter((pub) => pub.did === did);
  const featured = items.filter((pub) => pub.did !== did);
  // Only the trailing group closes its bottom rule; a mid-list rule would
  // collide with the "Featured in" head that follows it.
  const ownedIsLastGroup = featured.length === 0;

  return (
    <div>
      {owned.map((pub, index) => (
        <PubDirectoryRow
          key={pub.uri}
          pub={pub}
          isFirstInSection={index === 0}
          isLast={
            ownedIsLastGroup && index === owned.length - 1 && nextOffset == null
          }
          markHidden
        />
      ))}
      {featured.length > 0 ? (
        <section
          aria-label={t`Featured in`}
          {...stylex.props(owned.length > 0 && styles.featuredSection)}
        >
          <SectionHead size="md" title={<Trans>Featured in</Trans>} />
          {featured.map((pub, index) => (
            <PubDirectoryRow
              key={pub.uri}
              pub={pub}
              isFirstInSection={index === 0}
              isLast={index === featured.length - 1 && nextOffset == null}
              markHidden
            />
          ))}
        </section>
      ) : null}
      <LoadMoreFooter
        nextOffset={nextOffset}
        loadingMore={scroll.loadingMore}
        sentinelRef={scroll.sentinelRef}
      />
    </div>
  );
}

function AuthorPostsPanel({
  did,
  initialItems,
  initialNextOffset,
}: {
  did: string;
  initialItems: Array<ArticleCard>;
  initialNextOffset: number | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [nextOffset, setNextOffset] = useState(initialNextOffset);

  const loadMore = useCallback(async () => {
    if (nextOffset == null) return;
    const page = await authorApi.getAuthorDocuments({
      data: { did, limit: AUTHOR_ACTIVITY_PAGE_SIZE, offset: nextOffset },
    });
    setItems((prev) => {
      const seen = new Set(prev.map((article) => article.uri));
      return [
        ...prev,
        ...page.items.filter((article) => !seen.has(article.uri)),
      ];
    });
    setNextOffset(page.nextOffset);
  }, [did, nextOffset]);
  const scroll = useInfiniteScroll(nextOffset, loadMore);

  if (items.length === 0) {
    return (
      <div {...stylex.props(styles.emptyNote)}>
        <Trans>No posts indexed yet.</Trans>
      </div>
    );
  }

  return (
    <div>
      {items.map((article, index) => (
        <ArticleRow
          key={article.uri}
          article={article}
          isFirstInSection={index === 0}
          showSaveButton={false}
        />
      ))}
      <LoadMoreFooter
        nextOffset={nextOffset}
        loadingMore={scroll.loadingMore}
        sentinelRef={scroll.sentinelRef}
      />
    </div>
  );
}

function AuthorLikesPanel({
  did,
  initialItems,
  initialNextOffset,
}: {
  did: string;
  initialItems: Array<ArticleCard>;
  initialNextOffset: number | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [nextOffset, setNextOffset] = useState(initialNextOffset);

  const loadMore = useCallback(async () => {
    if (nextOffset == null) return;
    const page = await authorApi.getAuthorRecommendations({
      data: { did, limit: AUTHOR_ACTIVITY_PAGE_SIZE, offset: nextOffset },
    });
    setItems((prev) => {
      const seen = new Set(prev.map((article) => article.uri));
      return [
        ...prev,
        ...page.items.filter((article) => !seen.has(article.uri)),
      ];
    });
    setNextOffset(page.nextOffset);
  }, [did, nextOffset]);
  const scroll = useInfiniteScroll(nextOffset, loadMore);

  if (items.length === 0) {
    return (
      <div {...stylex.props(styles.emptyNote)}>
        <Trans>No liked articles yet.</Trans>
      </div>
    );
  }

  return (
    <div>
      {items.map((article, index) => (
        <ArticleRow
          key={article.uri}
          article={article}
          isFirstInSection={index === 0}
          showSaveButton={false}
        />
      ))}
      <LoadMoreFooter
        nextOffset={nextOffset}
        loadingMore={scroll.loadingMore}
        sentinelRef={scroll.sentinelRef}
      />
    </div>
  );
}

function AuthorSubscriptionsPanel({
  did,
  initialItems,
  initialNextOffset,
}: {
  did: string;
  initialItems: Array<PublicationCard>;
  initialNextOffset: number | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [nextOffset, setNextOffset] = useState(initialNextOffset);

  const loadMore = useCallback(async () => {
    if (nextOffset == null) return;
    const page = await authorApi.getAuthorSubscriptions({
      data: { did, limit: AUTHOR_ACTIVITY_PAGE_SIZE, offset: nextOffset },
    });
    setItems((prev) => {
      const seen = new Set(prev.map((pub) => pub.uri));
      return [...prev, ...page.items.filter((pub) => !seen.has(pub.uri))];
    });
    setNextOffset(page.nextOffset);
  }, [did, nextOffset]);
  const scroll = useInfiniteScroll(nextOffset, loadMore);

  if (items.length === 0) {
    return (
      <div {...stylex.props(styles.emptyNote)}>
        <Trans>Subscriptions aren&apos;t indexed yet.</Trans>
      </div>
    );
  }

  return (
    <div>
      {items.map((pub, index) => (
        <PubDirectoryRow
          key={pub.uri}
          pub={pub}
          isFirstInSection={index === 0}
          isLast={index === items.length - 1 && nextOffset == null}
        />
      ))}
      <LoadMoreFooter
        nextOffset={nextOffset}
        loadingMore={scroll.loadingMore}
        sentinelRef={scroll.sentinelRef}
      />
    </div>
  );
}

function AuthorReadersPanel({
  did,
  initialItems,
  initialNextOffset,
}: {
  did: string;
  initialItems: Array<AuthorReader>;
  initialNextOffset: number | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [nextOffset, setNextOffset] = useState(initialNextOffset);

  const loadMore = useCallback(async () => {
    if (nextOffset == null) return;
    const page = await authorApi.getAuthorReaders({
      data: { did, limit: AUTHOR_ACTIVITY_PAGE_SIZE, offset: nextOffset },
    });
    setItems((prev) => {
      const seen = new Set(prev.map((reader) => reader.did));
      return [...prev, ...page.items.filter((reader) => !seen.has(reader.did))];
    });
    setNextOffset(page.nextOffset);
  }, [did, nextOffset]);
  const scroll = useInfiniteScroll(nextOffset, loadMore);

  if (items.length === 0) {
    return (
      <div {...stylex.props(styles.emptyNote)}>
        <Trans>No readers indexed yet.</Trans>
      </div>
    );
  }

  return (
    <div>
      {items.map((reader, index) => (
        <AuthorReaderRow
          key={reader.did}
          reader={reader}
          isFirst={index === 0}
        />
      ))}
      <LoadMoreFooter
        nextOffset={nextOffset}
        loadingMore={scroll.loadingMore}
        sentinelRef={scroll.sentinelRef}
      />
    </div>
  );
}

function AuthorReaderRow({
  reader,
  isFirst,
}: {
  reader: AuthorReader;
  isFirst: boolean;
}) {
  const { t } = useLingui();
  const name = reader.displayName?.trim() || reader.handle || t`Reader`;

  return (
    <div {...stylex.props(styles.readerRow, isFirst && styles.readerRowFirst)}>
      <AuthorProfileLink authorRef={reader.did} linkStyle={styles.readerLink}>
        <Avatar
          size="md"
          src={reader.avatarUrl ?? undefined}
          fallback={initials(name)}
          alt={name}
          style={styles.readerAvatar}
        />
      </AuthorProfileLink>
      <div>
        <AuthorProfileLink authorRef={reader.did} linkStyle={styles.readerLink}>
          <span {...stylex.props(styles.readerName)}>{name}</span>
        </AuthorProfileLink>
        {reader.handle ? (
          <div>
            <Handle style={styles.readerHandle}>@{reader.handle}</Handle>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const ListRowLink = createLink(AriaLink);

function AuthorListsPanel({
  did,
  lists,
}: {
  did: string;
  lists: Array<SubscriptionList>;
}) {
  return (
    <div>
      {lists.map((list, index) => (
        <ListRowLink
          key={list.uri}
          to="/l/$did/$rkey"
          params={{ did, rkey: list.rkey }}
          {...stylex.props(
            styles.listRow,
            ui.bgGhost,
            index === 0 && styles.listRowFirst,
          )}
        >
          <span dir="auto" {...stylex.props(styles.listRowLink)}>
            <ListPlus size={14} aria-hidden /> {list.name}
          </span>
          {list.description ? (
            <p dir="auto" {...stylex.props(styles.listRowDesc)}>
              {list.description}
            </p>
          ) : null}
          <span {...stylex.props(styles.listRowMeta)}>
            <Plural
              value={list.publications.length}
              one="# publication"
              other="# publications"
            />
          </span>
        </ListRowLink>
      ))}
    </div>
  );
}
