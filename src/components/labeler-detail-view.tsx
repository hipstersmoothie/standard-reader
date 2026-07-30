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
import { labelerHandle, labelerHandleOrDid } from "#/lib/labeler-handle";
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
import { Switch } from "../design-system/switch";
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

/** The cached payload of `getLabeler`, patched in place by the mutations below. */
type LabelerQueryData = Awaited<ReturnType<typeof labelerApi.getLabeler>>;

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
  // A labeler's declared labels are paged too: ATlas declares 4,995 of them, and
  // rendering that many visibility controls at once is what made this page crawl.
  const {
    data: labelDefPages,
    fetchNextPage: fetchNextLabelDefs,
    hasNextPage: hasNextLabelDefs,
    isFetchingNextPage: isFetchingNextLabelDefs,
  } = useInfiniteQuery(labelerApi.getLabelerLabelsInfiniteQueryOptions(did));
  const { enabled: trackReading } = useTrackReadingHistory();

  const labelerKey = ["labeler", did] as const;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: labelerKey });
    void queryClient.invalidateQueries({ queryKey: ["reader", "labelers"] });
    void queryClient.invalidateQueries({
      queryKey: ["reader", "knownLabelers"],
    });
    void queryClient.invalidateQueries({ queryKey: ["labels"] });
  };

  /** Patch this labeler's cached entry without refetching it. */
  const patchLabeler = (patch: Partial<LabelerQueryData>) =>
    queryClient.setQueryData(labelerKey, (old: LabelerQueryData | undefined) =>
      old ? { ...old, ...patch } : old,
    );

  const subscribe = useMutation({
    ...labelerApi.subscribeLabelerMutationOptions(),
    onSuccess: invalidate,
  });
  const unsubscribe = useMutation({
    ...labelerApi.unsubscribeLabelerMutationOptions(),
    onSuccess: invalidate,
  });

  /**
   * Per-label visibility, applied optimistically.
   *
   * Every change is a PDS write, so waiting on the round trip before moving the
   * control — and then refetching the labeler and every label query on top —
   * made the page feel frozen for a second per click. The control moves
   * immediately instead, and since the write returns the authoritative prefs
   * there is nothing to refetch: only the *document* label treatment changed, so
   * only `["labels"]` is invalidated. The labeler's own metadata and its place in
   * the directory are untouched by a visibility pref.
   */
  const setPref = useMutation({
    ...labelerApi.setLabelerPrefMutationOptions(),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: labelerKey });
      const previous = queryClient.getQueryData<LabelerQueryData>(labelerKey);
      patchLabeler({
        prefs: [
          ...(previous?.prefs ?? []).filter((p) => p.val !== input.val),
          { val: input.val, visibility: input.visibility },
        ],
      });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(labelerKey, context.previous);
      }
    },
    onSuccess: (result) => {
      patchLabeler({ prefs: result.prefs });
      void queryClient.invalidateQueries({ queryKey: ["labels"] });
    },
  });

  /** Muting, applied optimistically for the same reason as {@link setPref}. */
  const setEnabled = useMutation({
    ...labelerApi.setLabelerEnabledMutationOptions(),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: labelerKey });
      const previous = queryClient.getQueryData<LabelerQueryData>(labelerKey);
      patchLabeler({ enabled: input.enabled });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(labelerKey, context.previous);
      }
    },
    onSuccess: (result) => {
      patchLabeler({ enabled: result.enabled });
      // Muting changes how labels are treated everywhere, and the directory
      // card's muted state — but not this labeler's own metadata.
      void queryClient.invalidateQueries({ queryKey: ["labels"] });
      void queryClient.invalidateQueries({
        queryKey: ["reader", "knownLabelers"],
      });
    },
  });

  const card = labeler.data?.labeler ?? { did };
  const subscribed = labeler.data?.subscribed ?? false;
  const enabled = labeler.data?.enabled ?? true;
  const health = labeler.data?.health ?? null;
  const prefs = new Map<string, Visibility>(
    (labeler.data?.prefs ?? []).map((p) => [p.val, p.visibility]),
  );
  const name =
    card.displayName ?? labelerHandle(card.did, card.handle) ?? card.did;
  // The paged query owns the list once it has loaded; `getLabeler`'s first page
  // is the fallback so the tab has content on the very first paint.
  const pagedDefs =
    labelDefPages?.pages.flatMap((page) => page.definitions) ?? [];
  const defs =
    pagedDefs.length > 0 ? pagedDefs : (card.labelValueDefinitions ?? []);
  const declaredLabelCount =
    labelDefPages?.pages[0]?.total ?? labeler.data?.labelCount ?? defs.length;
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
  const loadMoreLabelDefs = useCallback(() => {
    if (hasNextLabelDefs && !isFetchingNextLabelDefs) void fetchNextLabelDefs();
  }, [fetchNextLabelDefs, hasNextLabelDefs, isFetchingNextLabelDefs]);
  const loadMoreLabelDefsRef = useInfiniteScrollSentinel(
    loadMoreLabelDefs,
    hasNextLabelDefs,
    labelDefPages?.pages.reduce((n, p) => n + p.definitions.length, 0) ?? 0,
  );

  // Only offer a subject tab once we know it has content. A labeler deals in
  // documents, accounts, or both — ours score prose, network labelers label
  // publishers — so an empty tab is the normal case, not an error. Gated on the
  // loaded count rather than shown-then-hidden, so a labeler with nothing to
  // list never flashes a tab that disappears.
  const showDocuments = !labeledIsLoading && documentCount > 0;
  const showAccounts = !accountsIsLoading && accountCount > 0;
  // Fall back to Labels when the URL names a tab this labeler doesn't have.
  const effectiveView: LabelerView =
    (view === "documents" && !showDocuments) ||
    (view === "accounts" && !showAccounts)
      ? "labels"
      : view;

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
            <span {...stylex.props(styles.did)}>
              {labelerHandleOrDid(card.did, card.handle)}
            </span>
            {/* The total this labeler declares, not the page we happen to have
                loaded — the Labels tab pages in on scroll. */}
            {declaredLabelCount > 0 ? (
              <span>
                <span {...stylex.props(styles.statValue)}>
                  {declaredLabelCount}
                </span>
                <Plural value={declaredLabelCount} one="label" other="labels" />
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
          {/* Muting is only meaningful once subscribed — for a labeler kept on
              another app but not wanted here. It sits beside Subscribed rather
              than replacing it, so the two states stay distinguishable. */}
          {subscribed ? (
            // A switch names the state it shows, so this reads "Muted here"
            // rather than the "Mute"/"Unmute" action a button would. On means
            // muted, which is the inverse of `enabled`.
            <Switch
              isSelected={!enabled}
              isDisabled={setEnabled.isPending}
              onChange={(muted) =>
                setEnabled.mutate({ labeler: card.did, enabled: !muted })
              }
              labelVariant="left"
              style={styles.muteSwitch}
            >
              <Trans>Muted here</Trans>
            </Switch>
          ) : null}
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
        selectedKey={effectiveView}
        onSelectionChange={onViewChange}
        style={styles.tabs}
      >
        <div {...stylex.props(styles.tabBar)}>
          <div {...stylex.props(styles.tabBarInner)}>
            <TabList aria-label={t`Labeler views`} style={styles.tabList}>
              <Tab id="labels">
                <Trans>Labels</Trans>
              </Tab>
              {showDocuments ? (
                <Tab id="documents">
                  <Trans>Documents</Trans>
                </Tab>
              ) : null}
              {showAccounts ? (
                <Tab id="accounts">
                  <Trans>Accounts</Trans>
                </Tab>
              ) : null}
            </TabList>
          </div>
          <div {...stylex.props(styles.tabRule)} aria-hidden />
        </div>

        <ReaderContent>
          <TabPanel id="labels" style={styles.tabPanel}>
            {/* A labeler can be listed, declare a full set of labels, and still
                deliver nothing — because its server is down, or because what it
                serves doesn't verify against the signing key it publishes. Say
                so, rather than leaving an empty tab that looks like "no labels
                yet". */}
            {health?.error ? (
              <p {...stylex.props(styles.warnNote)}>
                <Trans>
                  This labeler’s server couldn’t be reached, so its labels
                  aren’t available right now. We’ll keep trying.
                </Trans>
              </p>
            ) : health && health.rejected > 0 && health.stored === 0 ? (
              <p {...stylex.props(styles.warnNote)}>
                <Trans>
                  None of this labeler’s labels could be verified against the
                  signing key it publishes, so none are applied. That’s a
                  problem on the labeler’s end.
                </Trans>
              </p>
            ) : health && health.rejected > 0 ? (
              <p {...stylex.props(styles.warnNote)}>
                <Plural
                  value={health.rejected}
                  one="One of this labeler’s labels couldn’t be verified and was skipped."
                  other="# of this labeler’s labels couldn’t be verified and were skipped."
                />
              </p>
            ) : null}
            {subscribed && !enabled ? (
              <p {...stylex.props(styles.note)}>
                <Trans>
                  Muted here — this labeler’s labels aren’t applied while you
                  read on Standard Reader. Your subscription and the settings
                  below are kept, and unmuting restores them.
                </Trans>
              </p>
            ) : null}
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
                        isDisabled={!subscribed}
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
              {/* Paged on scroll rather than virtualized: each row owns a
                  SegmentedControl, and react-aria's Virtualizer wants a
                  collection component (ListBox/GridList), whose row semantics
                  fight interactive controls nested inside them. This also keeps
                  the tab consistent with Documents and Accounts below. */}
              {hasNextLabelDefs ? (
                <div ref={loadMoreLabelDefsRef} {...stylex.props(styles.note)}>
                  {isFetchingNextLabelDefs ? (
                    <Trans>Loading more labels…</Trans>
                  ) : (
                    <Trans>
                      Showing {defs.length} of {declaredLabelCount} labels.
                    </Trans>
                  )}
                </div>
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
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    paddingInlineEnd: {
      default: spacing["5"],
      "@media (min-width: 40rem)": spacing["10"],
    },
    paddingInlineStart: {
      default: spacing["5"],
      "@media (min-width: 40rem)": spacing["10"],
    },
    rowGap: spacing["4"],
    maxWidth: "82.5rem",
    paddingBottom: spacing["0"],
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
    columnGap: gap.md,
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    rowGap: spacing["2.5"],
    paddingTop: spacing["1"],
  },
  muteSwitch: {
    flexShrink: 0,
  },
  tabs: {
    paddingBottom: spacing["10"],
  },
  tabBar: {
    width: "100%",
  },
  tabBarInner: {
    boxSizing: "border-box",
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    paddingInlineEnd: {
      default: spacing["5"],
      "@media (min-width: 40rem)": spacing["10"],
    },
    paddingInlineStart: {
      default: spacing["5"],
      "@media (min-width: 40rem)": spacing["10"],
    },
    maxWidth: "82.5rem",
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
    paddingInlineEnd: spacing["0"],
    paddingInlineStart: spacing["0"],
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
  warnNote: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
    borderRadius: radius.md,
    backgroundColor: uiColor.component1,
    borderInlineStartColor: uiColor.border2,
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: spacing.px,
    paddingBlock: spacing["2"],
    paddingInline: spacing["3"],
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
    gap: gap.md,
    textDecoration: "none",
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": uiColor.component1 },
    color: "inherit",
    display: "flex",
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: spacing.px,
  },
  accountText: {
    gap: gap.xs,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  accountName: {
    overflow: "hidden",
    color: uiColor.text2,
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
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
