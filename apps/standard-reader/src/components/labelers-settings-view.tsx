"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Avatar } from "@standard-reader/design-system/avatar";
import { Badge } from "@standard-reader/design-system/badge";
import { Button } from "@standard-reader/design-system/button";
import { TextField } from "@standard-reader/design-system/text-field";
import { animationDuration } from "@standard-reader/design-system/theme/animations.stylex";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  gap,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontSize,
  fontWeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useMemo, useState } from "react";

import type {
  LabelerCard,
  LabelerListItem,
} from "#/integrations/tanstack-query/api-labelers.functions";
import { labelerApi } from "#/integrations/tanstack-query/api-labelers.functions";
import { labelerHandle, labelerHandleOrDid } from "#/lib/labeler-handle";
import { useDebouncedValue } from "#/lib/use-debounced-value";

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
 * Labeler directory card — a link, and nothing else.
 *
 * Subscribe and mute used to live here. They don't any more: the whole card is
 * one target that opens the labeler's page, which is where subscribing belongs
 * because that is the only place showing what a labeler actually declares and
 * what it has labeled. Deciding to trust a moderation service from a two-line
 * card was the wrong shape, and per-card controls also meant every card carried
 * three mutations and its own invalidation.
 *
 * State is still shown, just passively: a "Subscribed" mark, and a muted card
 * dimmed so it reads as present-but-inactive.
 */
function LabelerCardItem({
  card,
  subscribed,
  enabled,
}: {
  card: LabelerCard;
  subscribed: boolean;
  enabled: boolean;
}) {
  const { names, total: labelTotal } = labelSummary(card);
  const displayName =
    card.displayName ?? labelerHandle(card.did, card.handle) ?? card.did;
  const muted = subscribed && !enabled;

  return (
    <Link
      to="/labelers/$did"
      params={{ did: card.did }}
      {...stylex.props(styles.cardLink, styles.card, muted && styles.cardMuted)}
    >
      <div {...stylex.props(styles.cardHead)}>
        <div {...stylex.props(styles.cardIdentity)}>
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
        </div>
        {subscribed ? (
          <span {...stylex.props(styles.stateMark)}>
            <Check size={14} aria-hidden />
            {muted ? <Trans>Muted</Trans> : <Trans>Subscribed</Trans>}
          </span>
        ) : null}
      </div>
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
    </Link>
  );
}

export function LabelersSettingsView() {
  const { t } = useLingui();
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
  // Muted labelers, so the card renders dimmed. The lookup card is a bare
  // LabelerCard with no `enabled`, so its state comes from the lookup response
  // alongside `subscribed`.
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
  stateMark: {
    gap: gap.xs,
    alignItems: "center",
    color: uiColor.text1,
    display: "inline-flex",
    flexShrink: 0,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
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
  cardMuted: {
    // Dimmed so a muted labeler reads as present-but-inactive at a glance. The
    // controls are deliberately excluded from the fade — you need to be able to
    // see and hit Unmute — so the opacity lands on the content, not the card.
    opacity: 0.55,
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
