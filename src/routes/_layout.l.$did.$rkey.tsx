"use client";

import type {
  ArticleCard,
  PublicationCard,
} from "#/integrations/tanstack-query/api-shapes";

import * as stylex from "@stylexjs/stylex";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { feedApi } from "#/integrations/tanstack-query/api-feed.functions";
import { listApi } from "#/integrations/tanstack-query/api-lists.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { listOgImageUrl, siteSocialMeta } from "#/lib/site-metadata";
import { useTrackReadingHistory } from "#/lib/use-track-reading-history";
import { Pencil } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

import { ArticleRow, PubDirectoryRow } from "../components/reader/cards";
import { ListEditModal } from "../components/reader/list-edit-modal";
import { Handle, Kicker, ReaderContent } from "../components/reader/primitives";
import { ShareMenu } from "../components/reader/share-menu";
import { Button } from "../design-system/button";
import { Tab, TabList, TabPanel, Tabs } from "../design-system/tabs";
import { uiColor } from "../design-system/theme/color.stylex";
import { spacing } from "../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "../design-system/theme/typography.stylex";

const PAGE_SIZE = 20;

const listSearchSchema = z.object({
  view: z.enum(["feed", "publications"]).default("feed"),
});

type ListView = z.infer<typeof listSearchSchema>["view"];

export const Route = createFileRoute("/_layout/l/$did/$rkey")({
  validateSearch: listSearchSchema,
  loader: async ({ context, params }) => {
    const page = await context.queryClient.ensureQueryData(
      listApi.getListQueryOptions(params.did, params.rkey),
    );
    await context.queryClient.ensureQueryData(
      listApi.getListFeedQueryOptions(params.did, params.rkey, {
        limit: PAGE_SIZE,
        offset: 0,
      }),
    );
    return {
      listName: page.list?.name ?? null,
      listDescription: page.list?.description ?? null,
      ownerHandle: page.owner?.handle ?? null,
    };
  },
  head: ({ loaderData, match, params }) => {
    const name = loaderData?.listName;
    if (!name) {
      return { meta: [{ title: "Standard Reader" }] };
    }
    const baseUrl = getPublicUrlClient();
    const owner = loaderData?.ownerHandle;
    return {
      meta: siteSocialMeta({
        title: `${name} · Standard Reader`,
        description:
          loaderData?.listDescription?.trim() ||
          `A publication list${owner ? ` by @${owner}` : ""} on Standard Reader.`,
        url: `${baseUrl}${match.pathname}`,
        ogImage: listOgImageUrl(baseUrl, params.did, params.rkey),
      }),
    };
  },
  component: ListPage,
});

const styles = stylex.create({
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
    paddingBottom: spacing["0"],
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
  tabs: {
    paddingBottom: spacing["10"],
  },
  tabBar: {
    width: "100%",
  },
  tabBarInner: {
    boxSizing: "border-box",
    marginLeft: "auto",
    marginRight: "auto",
    maxWidth: "1320px",
    paddingLeft: {
      default: spacing["5"],
      "@media (min-width: 40rem)": spacing["10"],
    },
    paddingRight: {
      default: spacing["5"],
      "@media (min-width: 40rem)": spacing["10"],
    },
    paddingTop: spacing["4"],
    width: "100%",
  },
  tabList: {
    borderBottomStyle: "none",
    borderBottomWidth: 0,
  },
  tabRule: {
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    width: "100%",
  },
  tabPanel: {
    paddingLeft: spacing["0"],
    paddingRight: spacing["0"],
    paddingTop: spacing["6"],
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

function ListFeedPanel({
  did,
  rkey,
  hasPublications,
  isOwner,
}: {
  did: string;
  rkey: string;
  hasPublications: boolean;
  isOwner: boolean;
}) {
  const { data: session } = useQuery(user.getSessionQueryOptions);
  const signedIn = Boolean(session?.user);
  const { enabled: trackReading } = useTrackReadingHistory();

  const { data: feed } = useSuspenseQuery(
    listApi.getListFeedQueryOptions(did, rkey, {
      limit: PAGE_SIZE,
      offset: 0,
    }),
  );

  const [items, setItems] = useState<Array<ArticleCard>>(() => feed.items);
  const [nextOffset, setNextOffset] = useState<number | null>(
    () => feed.nextOffset,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    setItems(feed.items);
    setNextOffset(feed.nextOffset);
  }, [feed]);

  const loadMore = useCallback(async () => {
    if (nextOffset == null || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await listApi.getListFeed({
        data: { did, rkey, limit: PAGE_SIZE, offset: nextOffset },
      });
      setItems((prev) => {
        const seen = new Set(prev.map((article) => article.uri));
        return [
          ...prev,
          ...page.items.filter((article) => !seen.has(article.uri)),
        ];
      });
      setNextOffset(page.nextOffset);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [did, nextOffset, rkey]);

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
  }, [loadMore, nextOffset]);

  if (!hasPublications) {
    return (
      <div {...stylex.props(styles.emptyNote)}>
        This list is empty
        {isOwner ? " — add some publications to it." : "."}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div {...stylex.props(styles.emptyNote)}>
        No articles indexed from these publications yet.
      </div>
    );
  }

  return (
    <>
      <div>
        {items.map((article, index) => (
          <ArticleRow
            key={article.uri}
            article={article}
            isFirstInSection={index === 0}
            unread={trackReading && signedIn && !article.isRead}
          />
        ))}
      </div>
      {nextOffset == null ? (
        <p {...stylex.props(styles.endNote)}>You&apos;ve reached the end.</p>
      ) : (
        <>
          <div
            ref={loadMoreSentinelRef}
            aria-hidden
            {...stylex.props(styles.loadSentinel)}
          />
          {loadingMore ? (
            <p {...stylex.props(styles.endNote)}>Loading…</p>
          ) : null}
        </>
      )}
    </>
  );
}

function ListPublicationsPanel({
  publications,
  isOwner,
}: {
  publications: Array<PublicationCard>;
  isOwner: boolean;
}) {
  if (publications.length === 0) {
    return (
      <div {...stylex.props(styles.emptyNote)}>
        This list is empty
        {isOwner ? " — add some publications to it." : "."}
      </div>
    );
  }

  return (
    <div>
      {publications.map((pub, index) => (
        <PubDirectoryRow
          key={pub.uri}
          pub={pub}
          rank={index + 1}
          isFirstInSection={index === 0}
          isLast={index === publications.length - 1}
        />
      ))}
    </div>
  );
}

function ListPage() {
  const { did, rkey } = Route.useParams();
  const { view } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const { data: page } = useSuspenseQuery(
    listApi.getListQueryOptions(did, rkey),
  );
  const { data: session } = useQuery(user.getSessionQueryOptions);
  const signedIn = Boolean(session?.user);
  const { data: sidebar } = useQuery(feedApi.getSidebarQueryOptions());
  const following = sidebar?.following ?? [];

  const [editOpen, setEditOpen] = useState(false);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["list", did, rkey] });
    void queryClient.invalidateQueries({
      queryKey: ["reader", "savedLists"],
    });
    // Saving a list acts like following its publications, so every feed
    // surface (sidebar, home, latest) changes too.
    void queryClient.invalidateQueries({ queryKey: ["feed"] });
  };
  const saveMutation = useMutation({
    ...listApi.saveListMutationOptions(),
    onSettled: invalidate,
  });
  const unsaveMutation = useMutation({
    ...listApi.unsaveListMutationOptions(),
    onSettled: invalidate,
  });
  const toggling = saveMutation.isPending || unsaveMutation.isPending;

  const onViewChange = (key: React.Key) => {
    const next = key as ListView;
    void navigate({ search: { view: next } });
  };

  if (!page.list) {
    return (
      <ReaderContent>
        <div {...stylex.props(styles.emptyNote)}>
          We couldn’t find that list.
        </div>
      </ReaderContent>
    );
  }

  const { list, owner, publications, viewer } = page;

  const pageUrl = `${getPublicUrlClient()}/l/${did}/${rkey}`;

  return (
    <div>
      <div {...stylex.props(styles.heroInner)}>
        <div {...stylex.props(styles.heroInfo)}>
          <Kicker>Publication list</Kicker>
          <h1 {...stylex.props(styles.heroName)}>{list.name}</h1>
          {list.description ? (
            <p {...stylex.props(styles.heroDesc)}>{list.description}</p>
          ) : null}
          <div {...stylex.props(styles.stats)}>
            {owner?.handle ? (
              <Link
                to="/u/$did"
                params={{ did: owner.did }}
                {...stylex.props(styles.handleLink)}
              >
                <Handle>by @{owner.handle}</Handle>
              </Link>
            ) : null}
            <span>
              <span {...stylex.props(styles.statValue)}>
                {list.publications.length}
              </span>
              {list.publications.length === 1 ? "publication" : "publications"}
            </span>
          </div>
        </div>

        <div {...stylex.props(styles.heroActs)}>
          <ShareMenu pageUrl={pageUrl} />
          {viewer.isOwner ? (
            <Button variant="secondary" onPress={() => setEditOpen(true)}>
              <Pencil size={14} /> Edit list
            </Button>
          ) : signedIn ? (
            viewer.isSaved ? (
              <Button
                variant="secondary"
                isPending={toggling}
                onPress={() => unsaveMutation.mutate(list.uri)}
              >
                Remove list
              </Button>
            ) : (
              <Button
                variant="primary"
                isPending={toggling}
                onPress={() => saveMutation.mutate(list.uri)}
              >
                Follow list
              </Button>
            )
          ) : null}
        </div>
      </div>

      <Tabs
        selectedKey={view}
        onSelectionChange={onViewChange}
        style={styles.tabs}
      >
        <div {...stylex.props(styles.tabBar)}>
          <div {...stylex.props(styles.tabBarInner)}>
            <TabList aria-label="List views" style={styles.tabList}>
              <Tab id="feed">Articles</Tab>
              <Tab id="publications">Publications</Tab>
            </TabList>
          </div>
          <div {...stylex.props(styles.tabRule)} aria-hidden />
        </div>

        <ReaderContent>
          <TabPanel id="feed" style={styles.tabPanel}>
            <ListFeedPanel
              did={did}
              rkey={rkey}
              hasPublications={list.publications.length > 0}
              isOwner={viewer.isOwner}
            />
          </TabPanel>
          <TabPanel id="publications" style={styles.tabPanel}>
            <ListPublicationsPanel
              publications={publications}
              isOwner={viewer.isOwner}
            />
          </TabPanel>
        </ReaderContent>
      </Tabs>

      {viewer.isOwner ? (
        <ListEditModal
          isOpen={editOpen}
          onOpenChange={setEditOpen}
          list={list}
          following={following}
        />
      ) : null}
    </div>
  );
}
