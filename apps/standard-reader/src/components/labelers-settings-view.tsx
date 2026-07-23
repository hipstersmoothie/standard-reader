"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import type {
  LabelerCard,
  LabelerListItem,
} from "#/integrations/tanstack-query/api-labelers.functions";
import { labelerApi } from "#/integrations/tanstack-query/api-labelers.functions";

import { Avatar } from "@standard-reader/design-system/avatar";
import { Badge } from "@standard-reader/design-system/badge";
import { TextField } from "@standard-reader/design-system/text-field";
import { animationDuration } from "@standard-reader/design-system/theme/animations.stylex";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import {
  gap,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import { fontSize, fontWeight } from "@standard-reader/design-system/theme/typography.stylex";
import { Masthead, ReaderContent } from "./reader/primitives";

const MOBILE = "@media (max-width: 47.5rem)";

function labelValueNames(card: LabelerCard): Array<string> {
  return (card.labelValueDefinitions ?? []).map((def) => {
    const locales = def.locales as Array<{ name?: string }> | undefined;
    return (
      locales?.[0]?.name ??
      (typeof def.identifier === "string" ? def.identifier : "label")
    );
  });
}

function initials(card: LabelerCard): string {
  const name = card.displayName ?? card.did;
  return name
    .replace(/^did:\w+:/, "")
    .slice(0, 2)
    .toUpperCase();
}

function labelerSearchText(card: LabelerCard): string {
  const parts = [
    card.displayName,
    card.did,
    card.description,
    ...labelValueNames(card),
    ...(card.labelValueDefinitions ?? []).map((def) => def.identifier),
  ];
  return parts
    .filter(
      (part): part is string => typeof part === "string" && part.length > 0,
    )
    .join("\n")
    .toLowerCase();
}

function labelerSubscriberCount(card: LabelerCard | LabelerListItem): number {
  return "subscriberCount" in card ? card.subscriberCount : 0;
}

function sortLabelersBySubscribers<T extends LabelerCard>(
  items: Array<T>,
): Array<T> {
  return [...items].toSorted(
    (a, b) => labelerSubscriberCount(b) - labelerSubscriberCount(a),
  );
}

function matchesLabeler(card: LabelerCard, query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;
  return labelerSearchText(card).includes(trimmed.toLowerCase());
}

/** Labeler directory card — entire surface links to the labeler profile. */
function LabelerCardItem({ card }: { card: LabelerCard }) {
  const names = labelValueNames(card);
  const displayName = card.displayName ?? card.did;

  return (
    <Link
      to="/labelers/$did"
      params={{ did: card.did }}
      {...stylex.props(styles.cardLink)}
    >
      <div {...stylex.props(styles.card)}>
        <div {...stylex.props(styles.cardHead)}>
          <Avatar
            size="lg"
            src={card.avatar}
            fallback={initials(card)}
            alt={displayName}
          />
          <div {...stylex.props(styles.cardHeadText)}>
            <span {...stylex.props(styles.cardName)}>{displayName}</span>
            <p {...stylex.props(styles.cardDid)}>{card.did}</p>
          </div>
        </div>
        {card.description ? (
          <p {...stylex.props(styles.cardDescription)}>{card.description}</p>
        ) : null}
        {names.length > 0 ? (
          <div {...stylex.props(styles.badges)}>
            {names.map((name) => (
              <Badge key={name} variant="warning">
                {name}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

export function LabelersSettingsView() {
  const { t } = useLingui();
  const known = useQuery(labelerApi.getKnownLabelersQueryOptions());

  const [search, setSearch] = useState("");
  const searchTrim = search.trim();

  const labelers = useMemo(() => known.data ?? [], [known.data]);
  const filtered = useMemo(
    () =>
      sortLabelersBySubscribers(
        labelers.filter((item) => matchesLabeler(item, searchTrim)),
      ),
    [labelers, searchTrim],
  );

  const lookupLocallyMatched = searchTrim.length > 0 && filtered.length > 0;
  const lookup = useQuery({
    ...labelerApi.getLabelerQueryOptions(searchTrim),
    enabled: searchTrim.length > 0 && !lookupLocallyMatched,
  });

  const lookupCard = lookup.data?.labeler ?? null;
  const showLookup =
    lookupCard != null && !labelers.some((item) => item.did === lookupCard.did);

  const visibleCards = sortLabelersBySubscribers(
    showLookup
      ? [lookupCard, ...filtered.filter((item) => item.did !== lookupCard.did)]
      : filtered,
  );

  return (
    <ReaderContent>
      <Masthead
        kicker={t`Moderation`}
        title={t`Labelers`}
        dek={t`Labelers are moderation services you subscribe to by DID. Subscribe to see their labels — and blur or hide labeled posts — while you read.`}
      />

      <TextField
        aria-label={t`Search labelers`}
        placeholder={t`Search`}
        value={search}
        onChange={setSearch}
        size="lg"
        style={styles.searchInput}
      />

      {searchTrim && lookup.isFetched && visibleCards.length === 0 ? (
        <p {...stylex.props(styles.note)}>
          <Trans>No labelers match “{searchTrim}”.</Trans>
        </p>
      ) : null}

      <div {...stylex.props(styles.grid)}>
        {visibleCards.map((item: LabelerListItem | LabelerCard) => (
          <LabelerCardItem key={item.did} card={item} />
        ))}
      </div>

      {!known.isLoading && labelers.length === 0 && !searchTrim ? (
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
  card: {
    padding: spacing["4"],
    borderColor: { default: uiColor.border1, ":hover": uiColor.border2 },
    borderRadius: spacing["3"],
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
    display: "flex",
    flexWrap: "wrap",
  },
  note: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
    marginBlockEnd: verticalSpace.lg,
  },
});
