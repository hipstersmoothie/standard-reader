"use client";

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import type { Key } from "react";
import { useCallback } from "react";

import { ArticleRow } from "#/components/reader/cards";
import { LabelerPill } from "#/components/reader/labeler-pill";
import { useInfiniteScrollSentinel } from "#/components/reader/use-infinite-scroll-sentinel";
import type {
  LabelValueDef,
  LabeledAccount,
} from "#/integrations/tanstack-query/api-labelers.functions";
import { labelerApi } from "#/integrations/tanstack-query/api-labelers.functions";
import { useTrackReadingHistory } from "#/lib/use-track-reading-history";

import { Avatar } from "../design-system/avatar";
import { Button } from "../design-system/button";
import {
  EmptyState,
  EmptyStateDescription,
  EmptyStateTitle,
} from "../design-system/empty-state";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "../design-system/segmented-control";
import { Tab, TabList, TabPanel, Tabs } from "../design-system/tabs";
import { animationDuration } from "../design-system/theme/animations.stylex";
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
import { Kicker, ReaderContent } from "./reader/primitives";

type Visibility = "ignore" | "warn" | "hide";

/**
 * One account a labeler has labeled. Deliberately not an `ArticleRow`: the
 * subject here is a publisher, not a document, so the row leads with identity
 * and links to the profile. Falls back to the bare DID when we hold no profile
 * for the account — a labeler can label someone we have never indexed.
 */
function LabeledAccountRow({
  account,
  src,
  vals,
}: {
  account: LabeledAccount;
  src: string;
  vals: Array<string>;
}) {
  const name =
    account.displayName?.trim() ||
    (account.handle ? `@${account.handle}` : account.did);

  return (
    <Link
      to="/u/$did"
      params={{ did: account.did }}
      {...stylex.props(styles.accountRow)}
    >
      <Avatar
        size="md"
        src={account.avatarUrl ?? undefined}
        alt={name}
        fallback={name.slice(0, 2).toUpperCase()}
      />
      <div {...stylex.props(styles.accountText)}>
        <span {...stylex.props(styles.accountName)}>{name}</span>
        {account.handle && account.displayName ? (
          <span {...stylex.props(styles.accountHandle)}>@{account.handle}</span>
        ) : null}
      </div>
      <div {...stylex.props(styles.accountLabels)}>
        {vals.map((val) => (
          <LabelerPill key={val} src={src} val={val} />
        ))}
      </div>
    </Link>
  );
}
export type LabelerView = "labels" | "documents" | "accounts";

// Each label is a simple three-way toggle: off (ignore), warn (content warning /
// blur), or hide (filter it out entirely).
const VISIBILITY_OPTIONS: Array<{ id: Visibility; label: MessageDescriptor }> =
  [
    { id: "ignore", label: msg`Off` },
    { id: "warn", label: msg`Warn` },
    { id: "hide", label: msg`Hide` },
  ];

function defName(def: LabelValueDef): string {
  return def.locales?.[0]?.name ?? def.identifier ?? "label";
}

function defDescription(def: LabelValueDef): string | undefined {
  return def.locales?.[0]?.description;
}

function initials(name: string): string {
  return name
    .replace(/^did:\w+:/, "")
    .slice(0, 2)
    .toUpperCase();
}

export function LabelerDetailView({
  did,
  view,
}: {
  did: string;
  view: LabelerView;
}) {
  const { t, i18n } = useLingui();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const labeler = useQuery(labelerApi.getLabelerQueryOptions(did));
  const {
    data: labeledPages,
    isLoading: labeledIsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(labelerApi.getLabeledDocumentsInfiniteQueryOptions(did));
  // A labeler's subjects are documents, accounts, or both — ours score prose,
  // network labelers label publishers — so both listings are always fetched and
  // each tab hides itself when its side is empty.
  const {
    data: accountPages,
    isLoading: accountsIsLoading,
    fetchNextPage: fetchNextAccounts,
    hasNextPage: hasNextAccounts,
    isFetchingNextPage: isFetchingNextAccounts,
  } = useInfiniteQuery(labelerApi.getLabeledAccountsInfiniteQueryOptions(did));
  const { enabled: trackReading } = useTrackReadingHistory();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["labeler", did] });
    void queryClient.invalidateQueries({ queryKey: ["reader", "labelers"] });
    void queryClient.invalidateQueries({ queryKey: ["labels"] });
  };

  const subscribe = useMutation({
    ...labelerApi.subscribeLabelerMutationOptions(),
    onSuccess: invalidate,
  });
  const unsubscribe = useMutation({
    ...labelerApi.unsubscribeLabelerMutationOptions(),
    onSuccess: invalidate,
  });
  const setPref = useMutation({
    ...labelerApi.setLabelerPrefMutationOptions(),
    onSuccess: invalidate,
  });

  const card = labeler.data?.labeler ?? { did };
  const subscribed = labeler.data?.subscribed ?? false;
  const prefs = new Map<string, Visibility>(
    (labeler.data?.prefs ?? []).map((p) => [p.val, p.visibility]),
  );
  const name = card.displayName ?? card.did;
  const defs = card.labelValueDefinitions ?? [];
  const documents = labeledPages?.pages.flatMap((page) => page.documents) ?? [];
  const labelsByUri: Record<string, Array<string>> = Object.assign(
    {},
    ...(labeledPages?.pages.map((page) => page.labelsByUri) ?? []),
  );
  const documentCount = labeledPages?.pages[0]?.total ?? 0;
  const accounts = accountPages?.pages.flatMap((page) => page.accounts) ?? [];
  const labelsByDid: Record<string, Array<string>> = Object.assign(
    {},
    ...(accountPages?.pages.map((page) => page.labelsByDid) ?? []),
  );
  const accountCount = accountPages?.pages[0]?.total ?? 0;

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);
  const loadMoreRef = useInfiniteScrollSentinel(
    loadMore,
    hasNextPage,
    documents.length,
  );
  const loadMoreAccounts = useCallback(() => {
    if (hasNextAccounts && !isFetchingNextAccounts) void fetchNextAccounts();
  }, [fetchNextAccounts, hasNextAccounts, isFetchingNextAccounts]);
  const loadMoreAccountsRef = useInfiniteScrollSentinel(
    loadMoreAccounts,
    hasNextAccounts,
    accounts.length,
  );

  const onViewChange = (key: Key) => {
    const next = key as LabelerView;
    void navigate({
      to: "/labelers/$did",
      params: { did },
      search: { view: next },
    });
  };

  return (
    <div>
      <div {...stylex.props(styles.heroInner)}>
        <div {...stylex.props(styles.avRing)}>
          <Avatar
            size="xl"
            src={card.avatar}
            fallback={initials(name)}
            alt={name}
            style={styles.avatar}
          />
        </div>

        <div {...stylex.props(styles.heroInfo)}>
          <Kicker>
            <Trans>Labeler</Trans>
          </Kicker>
          <h1 {...stylex.props(styles.heroName)}>{name}</h1>
          {card.description ? (
            <p {...stylex.props(styles.heroDesc)}>{card.description}</p>
          ) : null}
          <div {...stylex.props(styles.stats)}>
            <span {...stylex.props(styles.did)}>{card.did}</span>
            {defs.length > 0 ? (
              <span>
                <span {...stylex.props(styles.statValue)}>{defs.length}</span>
                <Plural value={defs.length} one="label" other="labels" />
              </span>
            ) : null}
            {documentCount > 0 ? (
              <span>
                <span {...stylex.props(styles.statValue)}>{documentCount}</span>
                <Plural
                  value={documentCount}
                  one="document"
                  other="documents"
                />
              </span>
            ) : null}
            {accountCount > 0 ? (
              <span>
                <span {...stylex.props(styles.statValue)}>{accountCount}</span>
                <Plural value={accountCount} one="account" other="accounts" />
              </span>
            ) : null}
          </div>
        </div>

        <div {...stylex.props(styles.heroActs)}>
          <Button
            variant={subscribed ? "secondary" : "primary"}
            size="md"
            isPending={subscribed ? unsubscribe.isPending : subscribe.isPending}
            onPress={() =>
              subscribed
                ? unsubscribe.mutate(card.did)
                : subscribe.mutate(card.did)
            }
          >
            {subscribed ? <Check size={18} aria-hidden /> : null}
            {subscribed ? <Trans>Subscribed</Trans> : <Trans>Subscribe</Trans>}
          </Button>
        </div>
      </div>

      <Tabs
        selectedKey={view}
        onSelectionChange={onViewChange}
        style={styles.tabs}
      >
        <div {...stylex.props(styles.tabBar)}>
          <div {...stylex.props(styles.tabBarInner)}>
            <TabList aria-label={t`Labeler views`} style={styles.tabList}>
              <Tab id="labels">
                <Trans>Labels</Trans>
              </Tab>
              <Tab id="documents">
                <Trans>Documents</Trans>
              </Tab>
              <Tab id="accounts">
                <Trans>Accounts</Trans>
              </Tab>
            </TabList>
          </div>
          <div {...stylex.props(styles.tabRule)} aria-hidden />
        </div>

        <ReaderContent>
          <TabPanel id="labels" style={styles.tabPanel}>
            <div {...stylex.props(styles.settingGroup)}>
              {defs.length === 0 ? (
                <p {...stylex.props(styles.note)}>
                  <Trans>
                    This labeler didn’t publish any label definitions.
                  </Trans>
                </p>
              ) : (
                defs.map((def) => {
                  const val = def.identifier ?? defName(def);
                  const current =
                    prefs.get(val) ??
                    (def.defaultSetting as Visibility) ??
                    "warn";
                  return (
                    <div key={val} {...stylex.props(styles.labelRow)}>
                      <div {...stylex.props(styles.labelText)}>
                        <p {...stylex.props(styles.labelName)}>
                          {defName(def)}
                        </p>
                        {defDescription(def) ? (
                          <p {...stylex.props(styles.labelDescription)}>
                            {defDescription(def)}
                          </p>
                        ) : null}
                      </div>
                      <SegmentedControl
                        selectedKeys={new Set([current])}
                        isDisabled={!subscribed || setPref.isPending}
                        onSelectionChange={(keys) => {
                          const key = String([...keys][0] ?? "");
                          if (
                            key === "ignore" ||
                            key === "warn" ||
                            key === "hide"
                          ) {
                            setPref.mutate({
                              labeler: card.did,
                              val,
                              visibility: key,
                            });
                          }
                        }}
                      >
                        {VISIBILITY_OPTIONS.map((opt) => (
                          <SegmentedControlItem key={opt.id} id={opt.id}>
                            {i18n._(opt.label)}
                          </SegmentedControlItem>
                        ))}
                      </SegmentedControl>
                    </div>
                  );
                })
              )}
              {!subscribed && defs.length > 0 ? (
                <p {...stylex.props(styles.note)}>
                  <Trans>
                    Subscribe to choose how these labels are applied while you
                    read.
                  </Trans>
                </p>
              ) : null}
            </div>
          </TabPanel>

          <TabPanel id="documents" style={styles.tabPanel}>
            {labeledIsLoading ? (
              <p {...stylex.props(styles.emptyNote)}>
                <Trans>Loading…</Trans>
              </p>
            ) : documents.length === 0 ? (
              <EmptyState>
                <EmptyStateTitle>
                  <Trans>Nothing labeled yet</Trans>
                </EmptyStateTitle>
                <EmptyStateDescription>
                  <Trans>
                    This labeler hasn’t labeled any documents in the read-model
                    yet.
                  </Trans>
                </EmptyStateDescription>
              </EmptyState>
            ) : (
              <div>
                {documents.map((article, index) => (
                  <ArticleRow
                    key={article.uri}
                    article={article}
                    isFirstInSection={index === 0}
                    unread={trackReading && !article.isRead}
                    showSaveButton={false}
                    metaLabels={(labelsByUri[article.uri] ?? []).map((val) => ({
                      src: did,
                      val,
                    }))}
                  />
                ))}
                {isFetchingNextPage ? (
                  <p {...stylex.props(styles.note)}>
                    <Trans>Loading…</Trans>
                  </p>
                ) : null}
                {hasNextPage ? (
                  <div
                    ref={loadMoreRef}
                    aria-hidden
                    {...stylex.props(styles.loadSentinel)}
                  />
                ) : null}
              </div>
            )}
          </TabPanel>

          <TabPanel id="accounts" style={styles.tabPanel}>
            {accountsIsLoading ? (
              <p {...stylex.props(styles.emptyNote)}>
                <Trans>Loading…</Trans>
              </p>
            ) : accounts.length === 0 ? (
              <EmptyState>
                <EmptyStateTitle>
                  <Trans>No labeled accounts</Trans>
                </EmptyStateTitle>
                <EmptyStateDescription>
                  <Trans>
                    This labeler hasn’t labeled any accounts in the read-model
                    yet.
                  </Trans>
                </EmptyStateDescription>
              </EmptyState>
            ) : (
              <div>
                {accounts.map((account) => (
                  <LabeledAccountRow
                    key={account.did}
                    account={account}
                    src={did}
                    vals={labelsByDid[account.did] ?? []}
                  />
                ))}
                {isFetchingNextAccounts ? (
                  <p {...stylex.props(styles.note)}>
                    <Trans>Loading…</Trans>
                  </p>
                ) : null}
                {hasNextAccounts ? (
                  <div
                    ref={loadMoreAccountsRef}
                    aria-hidden
                    {...stylex.props(styles.loadSentinel)}
                  />
                ) : null}
              </div>
            )}
          </TabPanel>
        </ReaderContent>
      </Tabs>
    </div>
  );
}

const styles = stylex.create({
  heroInner: {
    alignItems: "flex-start",
    boxSizing: "border-box",
    columnGap: spacing["5"],
    display: "flex",
    flexWrap: "wrap",
    rowGap: spacing["4"],
    marginInlineStart: "auto",
    marginInlineEnd: "auto",
    maxWidth: "82.5rem",
    paddingBottom: spacing["0"],
    paddingInlineStart: {
      default: spacing["5"],
      "@media (min-width: 40rem)": spacing["10"],
    },
    paddingInlineEnd: {
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
    minWidth: "15rem",
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
    marginInlineEnd: spacing["1"],
  },
  did: {
    fontFamily: "monospace",
    wordBreak: "break-all",
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
    marginInlineStart: "auto",
    marginInlineEnd: "auto",
    maxWidth: "82.5rem",
    paddingInlineStart: {
      default: spacing["5"],
      "@media (min-width: 40rem)": spacing["10"],
    },
    paddingInlineEnd: {
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
    paddingInlineStart: spacing["0"],
    paddingInlineEnd: spacing["0"],
    paddingTop: spacing["6"],
  },
  settingGroup: {
    padding: spacing["5"],
    borderColor: uiColor.border1,
    borderRadius: radius.lg,
    borderStyle: "solid",
    borderWidth: spacing.px,
    gap: gap["2xl"],
    display: "flex",
    flexDirection: "column",
  },
  labelRow: {
    gap: gap.xl,
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
  },
  labelText: {
    flexGrow: 1,
    minWidth: 0,
  },
  labelName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  labelDescription: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.base,
    marginTop: spacing["1.5"],
  },
  note: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
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
  accountRow: {
    padding: spacing["3"],
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: spacing.px,
    gap: gap.md,
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": uiColor.component1 },
    color: "inherit",
    display: "flex",
    textDecoration: "none",
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
  },
  accountText: {
    gap: gap.xs,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  accountName: {
    color: uiColor.text2,
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  accountHandle: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
  },
  accountLabels: {
    gap: gap.xs,
    display: "flex",
    flexWrap: "wrap",
    marginInlineStart: "auto",
  },
});
