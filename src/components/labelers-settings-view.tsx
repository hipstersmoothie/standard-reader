"use client";

import type { LabelerCard } from "#/integrations/tanstack-query/api-labelers.functions";

import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { labelerApi } from "#/integrations/tanstack-query/api-labelers.functions";
import { useState } from "react";

import { Avatar } from "../design-system/avatar";
import { Badge } from "../design-system/badge";
import { Button } from "../design-system/button";
import {
  EmptyState,
  EmptyStateDescription,
  EmptyStateTitle,
} from "../design-system/empty-state";
import { Switch } from "../design-system/switch";
import { TextField } from "../design-system/text-field";
import { uiColor } from "../design-system/theme/color.stylex";
import {
  gap,
  verticalSpace,
} from "../design-system/theme/semantic-spacing.stylex";
import { spacing } from "../design-system/theme/spacing.stylex";
import { fontSize, fontWeight } from "../design-system/theme/typography.stylex";
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

function LabelerRow({
  card,
  trailing,
  linkToDetail = false,
}: {
  card: LabelerCard;
  trailing: React.ReactNode;
  linkToDetail?: boolean;
}) {
  const names = labelValueNames(card);
  const displayName = card.displayName ?? card.did;
  return (
    <div {...stylex.props(styles.row)}>
      <Avatar size="lg" fallback={initials(card)} alt={displayName} />
      <div {...stylex.props(styles.rowBody)}>
        {linkToDetail ? (
          <Link
            to="/settings/labelers/$did"
            params={{ did: card.did }}
            {...stylex.props(styles.rowName, styles.rowLink)}
          >
            {displayName}
          </Link>
        ) : (
          <p {...stylex.props(styles.rowName)}>{displayName}</p>
        )}
        <p {...stylex.props(styles.rowDid)}>{card.did}</p>
        {card.description ? (
          <p {...stylex.props(styles.rowDescription)}>{card.description}</p>
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
      <div {...stylex.props(styles.rowTrailing)}>{trailing}</div>
    </div>
  );
}

export function LabelersSettingsView() {
  const queryClient = useQueryClient();
  const labelers = useQuery(labelerApi.getLabelersQueryOptions());

  const [actor, setActor] = useState("");
  const [submitted, setSubmitted] = useState("");
  const lookup = useQuery(labelerApi.getLabelerQueryOptions(submitted));

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["reader", "labelers"] });
    void queryClient.invalidateQueries({ queryKey: ["labeler"] });
    void queryClient.invalidateQueries({ queryKey: ["labels"] });
  };

  const subscribe = useMutation({
    ...labelerApi.subscribeLabelerMutationOptions(),
    onSuccess: () => {
      invalidate();
      setActor("");
      setSubmitted("");
    },
  });
  const unsubscribe = useMutation({
    ...labelerApi.unsubscribeLabelerMutationOptions(),
    onSuccess: invalidate,
  });

  const lookupCard = lookup.data?.labeler ?? null;
  const lookupSubscribed = lookup.data?.subscribed ?? false;

  return (
    <ReaderContent>
      <Masthead
        kicker="Account"
        title="Labelers"
        dek="Subscribe to labelers to see their labels on documents as you read. A labeler is just a DID — add one by handle or DID."
      />

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.sectionHeading)}>Add a labeler</h2>
        <div {...stylex.props(styles.settingGroup)}>
          <form
            {...stylex.props(styles.addForm)}
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitted(actor.trim());
            }}
          >
            <TextField
              aria-label="Labeler handle or DID"
              placeholder="claudeslop.standard-reader.app or did:web:…"
              value={actor}
              onChange={setActor}
              style={styles.addInput}
            />
            <Button
              type="submit"
              variant="secondary"
              isPending={lookup.isFetching}
            >
              Look up
            </Button>
          </form>

          {submitted && lookup.isFetched && !lookupCard ? (
            <p {...stylex.props(styles.note)}>
              Couldn’t find a labeler at “{submitted}”. Check the handle or DID.
            </p>
          ) : null}

          {lookupCard ? (
            <LabelerRow
              card={lookupCard}
              trailing={
                lookupSubscribed ? (
                  <Badge variant="success">Subscribed</Badge>
                ) : (
                  <Button
                    variant="primary"
                    isPending={subscribe.isPending}
                    onPress={() => subscribe.mutate(lookupCard.did)}
                  >
                    Subscribe
                  </Button>
                )
              }
            />
          ) : null}
        </div>
      </section>

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.sectionHeading)}>Your labelers</h2>
        <div {...stylex.props(styles.settingGroup)}>
          {labelers.isLoading ? (
            <p {...stylex.props(styles.note)}>Loading…</p>
          ) : (labelers.data?.length ?? 0) === 0 ? (
            <EmptyState>
              <EmptyStateTitle>No labelers yet</EmptyStateTitle>
              <EmptyStateDescription>
                Add a labeler above to start seeing its labels while you read.
              </EmptyStateDescription>
            </EmptyState>
          ) : (
            labelers.data?.map((card) => (
              <LabelerRow
                key={card.did}
                card={card}
                linkToDetail
                trailing={
                  <Switch
                    aria-label={`Subscribed to ${card.displayName ?? card.did}`}
                    isSelected
                    isDisabled={unsubscribe.isPending}
                    onChange={() => unsubscribe.mutate(card.did)}
                  />
                }
              />
            ))
          )}
        </div>
      </section>
    </ReaderContent>
  );
}

const styles = stylex.create({
  section: {
    marginBlockEnd: verticalSpace["3xl"],
  },
  sectionHeading: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    letterSpacing: "0.05em",
    marginBlockEnd: verticalSpace.xs,
    textTransform: "uppercase",
  },
  settingGroup: {
    padding: spacing["4"],
    borderColor: uiColor.border1,
    borderRadius: spacing["2"],
    borderStyle: "solid",
    borderWidth: spacing.px,
    gap: gap.lg,
    display: "flex",
    flexDirection: "column",
  },
  addForm: {
    gap: gap.sm,
    alignItems: "flex-end",
    display: "flex",
    flexDirection: { [MOBILE]: "column", default: "row" },
  },
  addInput: {
    flexGrow: 1,
    width: { [MOBILE]: "100%", default: "auto" },
  },
  row: {
    gap: gap.lg,
    alignItems: "flex-start",
    display: "flex",
  },
  rowBody: {
    flexGrow: 1,
    minWidth: 0,
  },
  rowName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  rowLink: {
    textDecoration: { default: "none", ":hover": "underline" },
    color: "inherit",
  },
  rowDid: {
    color: uiColor.text1,
    fontFamily: "monospace",
    fontSize: fontSize.xs,
    wordBreak: "break-all",
  },
  rowDescription: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
    marginBlockStart: spacing["1"],
  },
  badges: {
    gap: gap.sm,
    display: "flex",
    flexWrap: "wrap",
    marginBlockStart: spacing["1.5"],
  },
  rowTrailing: {
    flexShrink: 0,
  },
  note: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
  },
});
