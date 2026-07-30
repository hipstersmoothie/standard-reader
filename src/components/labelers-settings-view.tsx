"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import type {
  LabelerCard,
  LabelerListItem,
} from "#/integrations/tanstack-query/api-labelers.functions";
import { labelerApi } from "#/integrations/tanstack-query/api-labelers.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { labelerHandle, labelerHandleOrDid } from "#/lib/labeler-handle";
import { useDebouncedValue } from "#/lib/use-debounced-value";

import { Avatar } from "../design-system/avatar";
import { Badge } from "../design-system/badge";
import { Button } from "../design-system/button";
import { Switch } from "../design-system/switch";
import { TextField } from "../design-system/text-field";
import { animationDuration } from "../design-system/theme/animations.stylex";
import { uiColor } from "../design-system/theme/color.stylex";
import { radius } from "../design-system/theme/radius.stylex";
import {
  gap,
  verticalSpace,
} from "../design-system/theme/semantic-spacing.stylex";
import { spacing } from "../design-system/theme/spacing.stylex";
import { fontSize, fontWeight } from "../design-system/theme/typography.stylex";
import { Masthead, ReaderContent } from "./reader/primitives";

const MOBILE = "@media (max-width: 47.5rem)";

/**
 * Label badges shown on a directory card before collapsing to "+N more". A
 * labeler can declare dozens — Skywatch declares 35 — which would otherwise
 * make one card tower over the rest of the grid.
 */
const MAX_VISIBLE_LABELS = 2;

/** Typing pause before the directory search hits the server. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * Badge names for a card, plus how many labels the labeler declares in total.
 *
 * Directory rows arrive pre-trimmed as `labelNames`/`labelCount` (the full
 * definitions are megabytes across the whole network). The lookup card is a
 * plain `LabelerCard` straight from a resolve and still carries definitions, so
 * both shapes are handled here.
 */
function labelSummary(card: LabelerCard | LabelerListItem): {
  names: Array<string>;
  total: number;
} {
  if ("labelNames" in card) {
    return { names: card.labelNames, total: card.labelCount };
  }
  const defs = card.labelValueDefinitions ?? [];
  return {
    names: defs.slice(0, MAX_VISIBLE_LABELS).map((def) => {
      const locales = def.locales as Array<{ name?: string }> | undefined;
      return (
        locales?.[0]?.name ??
        (typeof def.identifier === "string" ? def.identifier : "label")
      );
    }),
    total: defs.length,
  };
}

function initials(card: LabelerCard): string {
  const name = card.displayName ?? card.did;
  return name
    .replace(/^did:\w+:/, "")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Labeler directory card. The identity block links to the labeler's page; the
 * subscribe/unsubscribe control sits outside that link rather than nested
 * inside it, so a click on either does one unambiguous thing.
 */
function LabelerCardItem({
  card,
  subscribed,
  enabled,
  signedIn,
}: {
  card: LabelerCard;
  subscribed: boolean;
  enabled: boolean;
  signedIn: boolean;
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const { names, total: labelTotal } = labelSummary(card);
  const displayName =
    card.displayName ?? labelerHandle(card.did, card.handle) ?? card.did;
  const muted = subscribed && !enabled;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["labeler"] });
    void queryClient.invalidateQueries({ queryKey: ["reader", "labelers"] });
    // `["reader", "labelers"]` is *not* a prefix of `["reader", "knownLabelers"]`,
    // so without this the card you just acted on kept its old state.
    void queryClient.invalidateQueries({
      queryKey: ["reader", "knownLabelers"],
    });
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
  const setEnabled = useMutation({
    ...labelerApi.setLabelerEnabledMutationOptions(),
    onSuccess: invalidate,
  });

  return (
    <div {...stylex.props(styles.card)}>
      <div {...stylex.props(styles.cardHead)}>
        <Link
          to="/labelers/$did"
          params={{ did: card.did }}
          {...stylex.props(styles.cardLink, styles.cardIdentity)}
        >
          <Avatar
            size="lg"
            src={card.avatar}
            fallback={initials(card)}
            alt={displayName}
          />
          <div {...stylex.props(styles.cardHeadText)}>
            <span {...stylex.props(styles.cardName)}>{displayName}</span>
            <p {...stylex.props(styles.cardDid)}>
              {labelerHandleOrDid(card.did, card.handle)}
            </p>
          </div>
        </Link>
        {signedIn ? (
          <div {...stylex.props(styles.cardActs)}>
            {subscribed ? (
              // A switch reports state, so it reads "Muted" rather than the
              // "Mute"/"Unmute" action a button would name. On means muted, so
              // `enabled` is its inverse.
              <Switch
                isSelected={muted}
                isDisabled={setEnabled.isPending}
                onChange={(next) =>
                  setEnabled.mutate({ labeler: card.did, enabled: !next })
                }
                labelVariant="left"
                style={styles.muteSwitch}
              >
                {t`Muted`}
              </Switch>
            ) : null}
            <Button
              variant={subscribed ? "secondary" : "primary"}
              size="sm"
              isPending={
                subscribed ? unsubscribe.isPending : subscribe.isPending
              }
              onPress={() =>
                subscribed
                  ? unsubscribe.mutate(card.did)
                  : subscribe.mutate(card.did)
              }
            >
              {subscribed ? t`Unsubscribe` : t`Subscribe`}
            </Button>
          </div>
        ) : null}
      </div>
      {muted ? (
        <p {...stylex.props(styles.mutedNote)}>
          <Trans>Muted — not applied while you read here.</Trans>
        </p>
      ) : null}
      {card.description ? (
        <p {...stylex.props(styles.cardDescription)}>{card.description}</p>
      ) : null}
      {names.length > 0 ? (
        <div {...stylex.props(styles.badges)}>
          {/* Neutral, not `warning`: most labels state something unalarming
              ("Bot", a place name, a repo), and severity is the reader's own
              per-label choice rather than a property of the label. */}
          {names.map((name) => (
            <Badge key={name} variant="default">
              {name}
            </Badge>
          ))}
          {labelTotal > names.length ? (
            <span {...stylex.props(styles.moreLabels)}>
              <Trans>+{labelTotal - names.length} more</Trans>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function LabelersSettingsView() {
  const { t } = useLingui();
  const { data: session } = useQuery(user.getSessionQueryOptions);
  const signedIn = session?.user?.did != null;

  const [search, setSearch] = useState("");
  const searchTrim = search.trim();
  // The directory lists every labeler on the network, so searching and paging
  // are server-side; debounce so typing doesn't fire a query per keystroke.
  const debouncedSearch = useDebouncedValue(searchTrim, SEARCH_DEBOUNCE_MS);

  const known = useInfiniteQuery(
    labelerApi.getKnownLabelersInfiniteQueryOptions(debouncedSearch),
  );
  const labelers = useMemo(
    () => known.data?.pages.flatMap((page) => page.labelers) ?? [],
    [known.data],
  );
  const total = known.data?.pages[0]?.total ?? 0;

  // Only consulted when the server search comes back empty: a reader can paste
  // a DID or handle for a labeler we have not discovered yet, and resolving it
  // both shows the card and backfills it into the directory.
  const lookup = useQuery({
    ...labelerApi.getLabelerQueryOptions(debouncedSearch),
    enabled:
      debouncedSearch.length > 0 && !known.isFetching && labelers.length === 0,
  });

  const lookupCard = lookup.data?.labeler ?? null;
  const showLookup =
    lookupCard != null && !labelers.some((item) => item.did === lookupCard.did);

  const listed: Array<LabelerListItem | LabelerCard> = showLookup
    ? [lookupCard, ...labelers]
    : labelers;
  const subscribedDids = new Set(
    listed
      .filter((item) => "subscribed" in item && item.subscribed)
      .map((item) => item.did),
  );
  if (lookupCard && lookup.data?.subscribed) subscribedDids.add(lookupCard.did);
  // Muted labelers, so a search result shows Unmute rather than Mute. The
  // lookup card is a bare LabelerCard with no `enabled`, so its state comes
  // from the lookup response alongside `subscribed`.
  const mutedDids = new Set(
    listed
      .filter((item) => "enabled" in item && !item.enabled)
      .map((item) => item.did),
  );
  if (lookupCard && lookup.data?.enabled === false) {
    mutedDids.add(lookupCard.did);
  }
  // Subscribed-first ordering is applied in SQL, but the lookup card arrives
  // outside that ordering, so keep it pinned with the reader's own labelers.
  const visibleCards = showLookup
    ? [
        ...listed.filter((item) => subscribedDids.has(item.did)),
        ...listed.filter((item) => !subscribedDids.has(item.did)),
      ]
    : listed;

  const searching = debouncedSearch.length > 0;
  const nothingFound =
    searching &&
    !known.isFetching &&
    !lookup.isFetching &&
    visibleCards.length === 0;

  return (
    <ReaderContent>
      <Masthead
        kicker={t`Moderation`}
        title={t`Labelers`}
        dek={t`Labelers are moderation services you subscribe to by DID. Subscribe to see their labels — and blur or hide labeled posts — while you read.`}
        metaLabel={t`On the network`}
        metaValue={total > 0 ? String(total) : undefined}
      />

      <TextField
        aria-label={t`Search labelers`}
        placeholder={t`Search by name, handle, or label`}
        value={search}
        onChange={setSearch}
        size="lg"
        style={styles.searchInput}
      />

      {nothingFound ? (
        <p {...stylex.props(styles.note)}>
          <Trans>No labelers match “{searchTrim}”.</Trans>
        </p>
      ) : null}

      <div {...stylex.props(styles.grid)}>
        {visibleCards.map((item: LabelerListItem | LabelerCard) => (
          <LabelerCardItem
            key={item.did}
            card={item}
            subscribed={subscribedDids.has(item.did)}
            enabled={!mutedDids.has(item.did)}
            signedIn={signedIn}
          />
        ))}
      </div>

      {known.hasNextPage ? (
        <div {...stylex.props(styles.loadMore)}>
          <Button
            variant="secondary"
            isPending={known.isFetchingNextPage}
            onPress={() => void known.fetchNextPage()}
          >
            <Trans>Show more labelers</Trans>
          </Button>
        </div>
      ) : null}

      {!known.isLoading && total === 0 && !searching ? (
        <p {...stylex.props(styles.note)}>
          <Trans>No known labelers yet.</Trans>
        </p>
      ) : null}
    </ReaderContent>
  );
}

const styles = stylex.create({
  searchInput: {
    marginBlockEnd: verticalSpace["2xl"],
    width: "100%",
  },
  grid: {
    gap: gap.lg,
    display: "grid",
    gridTemplateColumns: {
      [MOBILE]: "1fr",
      default: "repeat(auto-fill, minmax(20rem, 1fr))",
    },
  },
  cardLink: {
    textDecoration: "none",
    color: "inherit",
    cursor: "pointer",
    display: "block",
  },
  muteSwitch: {
    flexShrink: 0,
  },
  cardActs: {
    gap: gap.md,
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
  },
  mutedNote: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
    fontStyle: "italic",
  },
  cardIdentity: {
    gap: gap.lg,
    alignItems: "center",
    display: "flex",
    // Takes the free space so the subscribe control sits hard against the card
    // edge, and so a long DID truncates instead of pushing the button off.
    flexGrow: 1,
    minWidth: 0,
  },
  card: {
    padding: spacing["4"],
    borderColor: { default: uiColor.border1, ":hover": uiColor.border2 },
    borderRadius: radius.lg,
    borderStyle: "solid",
    borderWidth: spacing.px,
    gap: gap.md,
    backgroundColor: { default: "transparent", ":hover": uiColor.component1 },
    display: "flex",
    flexDirection: "column",
    transitionDuration: animationDuration.fast,
    transitionProperty: "border-color, background-color",
  },
  cardHead: {
    gap: gap.lg,
    alignItems: "center",
    display: "flex",
  },
  cardHeadText: {
    gap: gap.xs,
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    minWidth: 0,
  },
  cardName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  cardDid: {
    color: uiColor.text1,
    fontFamily: "monospace",
    fontSize: fontSize.xs,
    wordBreak: "break-all",
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
  cardDescription: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
  },
  badges: {
    gap: gap.sm,
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    // Grid rows stretch every card to the tallest in the row, so a short card
    // otherwise leaves its labels floating in the middle. `auto` eats the slack
    // above the badges instead, keeping them on the bottom edge across the row.
    marginBlockStart: "auto",
  },
  moreLabels: {
    color: uiColor.text1,
    fontSize: fontSize.xs,
    whiteSpace: "nowrap",
  },
  loadMore: {
    display: "flex",
    justifyContent: "center",
    marginBlockStart: verticalSpace["2xl"],
  },
  note: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
    marginBlockEnd: verticalSpace.lg,
  },
});
