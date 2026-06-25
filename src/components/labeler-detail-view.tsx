"use client";

import type { LabelValueDef } from "#/integrations/tanstack-query/api-labelers.functions";

import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArticleResultRow } from "#/components/reader/article-result-row";
import { labelerApi } from "#/integrations/tanstack-query/api-labelers.functions";

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
import { uiColor } from "../design-system/theme/color.stylex";
import {
  gap,
  verticalSpace,
} from "../design-system/theme/semantic-spacing.stylex";
import { spacing } from "../design-system/theme/spacing.stylex";
import { fontSize, fontWeight } from "../design-system/theme/typography.stylex";
import { Masthead, ReaderContent } from "./reader/primitives";

type Visibility = "ignore" | "warn" | "hide";

// Each label is a simple three-way toggle. "Blur" maps to the standard `warn`
// visibility (content warning / blurred media); "Hide" filters it out entirely.
const VISIBILITY_OPTIONS: Array<{ id: Visibility; label: string }> = [
  { id: "ignore", label: "Off" },
  { id: "warn", label: "Blur" },
  { id: "hide", label: "Hide" },
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

export function LabelerDetailView({ did }: { did: string }) {
  const queryClient = useQueryClient();
  const labeler = useQuery(labelerApi.getLabelerQueryOptions(did));
  const labeled = useQuery(labelerApi.getLabeledDocumentsQueryOptions(did));

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
  const documents = labeled.data?.documents ?? [];

  return (
    <ReaderContent>
      <Masthead kicker="Labeler" title={name} dek={card.description ?? ""} />

      <div {...stylex.props(styles.header)}>
        <Avatar size="xl" fallback={initials(name)} alt={name} />
        <div {...stylex.props(styles.headerBody)}>
          <p {...stylex.props(styles.did)}>{card.did}</p>
        </div>
        {subscribed ? (
          <Switch
            aria-label="Subscribed"
            isSelected
            isDisabled={unsubscribe.isPending}
            onChange={() => unsubscribe.mutate(card.did)}
          >
            Subscribed
          </Switch>
        ) : (
          <Button
            variant="primary"
            isPending={subscribe.isPending}
            onPress={() => subscribe.mutate(card.did)}
          >
            Subscribe
          </Button>
        )}
      </div>

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.sectionHeading)}>Labels</h2>
        <div {...stylex.props(styles.settingGroup)}>
          {defs.length === 0 ? (
            <p {...stylex.props(styles.note)}>
              This labeler didn’t publish any label definitions.
            </p>
          ) : (
            defs.map((def) => {
              const val = def.identifier ?? defName(def);
              const current =
                prefs.get(val) ?? (def.defaultSetting as Visibility) ?? "warn";
              return (
                <div key={val} {...stylex.props(styles.labelRow)}>
                  <div {...stylex.props(styles.labelText)}>
                    <p {...stylex.props(styles.labelName)}>{defName(def)}</p>
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
                        {opt.label}
                      </SegmentedControlItem>
                    ))}
                  </SegmentedControl>
                </div>
              );
            })
          )}
          {!subscribed && defs.length > 0 ? (
            <p {...stylex.props(styles.note)}>
              Subscribe to choose how these labels are applied while you read.
            </p>
          ) : null}
        </div>
      </section>

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.sectionHeading)}>Labeled documents</h2>
        <div {...stylex.props(styles.settingGroup)}>
          {labeled.isLoading ? (
            <p {...stylex.props(styles.note)}>Loading…</p>
          ) : documents.length === 0 ? (
            <EmptyState>
              <EmptyStateTitle>Nothing labeled yet</EmptyStateTitle>
              <EmptyStateDescription>
                This labeler hasn’t labeled any documents in the read-model yet.
              </EmptyStateDescription>
            </EmptyState>
          ) : (
            documents.map((article) => (
              <ArticleResultRow key={article.uri} article={article} />
            ))
          )}
        </div>
      </section>
    </ReaderContent>
  );
}

const styles = stylex.create({
  header: {
    gap: gap.lg,
    alignItems: "center",
    display: "flex",
    marginBlockEnd: verticalSpace["3xl"],
  },
  headerBody: {
    flexGrow: 1,
    minWidth: 0,
  },
  did: {
    color: uiColor.text1,
    fontFamily: "monospace",
    fontSize: fontSize.xs,
    wordBreak: "break-all",
  },
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
  labelRow: {
    gap: gap.lg,
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
  },
  note: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
  },
});
