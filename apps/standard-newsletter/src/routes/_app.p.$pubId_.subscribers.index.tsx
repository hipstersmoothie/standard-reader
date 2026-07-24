import { Avatar } from "@standard-reader/design-system/avatar";
import { Badge } from "@standard-reader/design-system/badge";
import { Button } from "@standard-reader/design-system/button";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateImage,
  EmptyStateTitle,
} from "@standard-reader/design-system/empty-state";
import { SearchField } from "@standard-reader/design-system/search-field";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@standard-reader/design-system/segmented-control";
import {
  primaryColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Link,
  createFileRoute,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { Users } from "lucide-react";
import { useMemo, useState } from "react";
import type { Key } from "react-aria-components";

import { common } from "../common-styles";
import { I, Ico } from "../components/icons";
import type { SubscriberRowData } from "../server/analytics";
import {
  publicationSubscribersQueryOptions,
  publicationsQueryOptions,
} from "../server/analytics";
import { fmt } from "../lib/format";

export const Route = createFileRoute("/_app/p/$pubId_/subscribers/")({
  loader: async ({ context, params }) => {
    const [pubs, subs] = await Promise.all([
      context.queryClient.ensureQueryData(publicationsQueryOptions()),
      context.queryClient.ensureQueryData(
        publicationSubscribersQueryOptions(params.pubId),
      ),
    ]);
    // No connected publication by that id, or not the owner → nothing to show.
    if (!pubs.some((p) => p.id === params.pubId) || !subs) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: Subscribers,
});

type Filter = "all" | "confirmed" | "pending" | "unsubscribed";

const SOURCE_LABEL: Record<string, string> = {
  email: "Email",
  space: "Bluesky",
};

/** local-part of an email, for a friendlier avatar initial and display. */
function emailName(email: string): string {
  return email.split("@")[0] ?? email;
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}

function toCsv(rows: Array<SubscriberRowData>): string {
  const header = ["email", "status", "source", "joined", "open_rate"];
  const lines = rows.map((r) =>
    [
      r.email,
      r.status,
      SOURCE_LABEL[r.source] ?? r.source,
      r.joined,
      r.openRate === null ? "" : String(r.openRate),
    ]
      .map((v) => csvCell(v))
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

const styles = stylex.create({
  head: {
    alignItems: "flex-end",
    columnGap: gap["5xl"],
    display: "flex",
    marginBlockEnd: spacing["6"],
    marginBlockStart: spacing["3.5"],
    rowGap: gap["5xl"],
  },
  title: {
    fontSize: fontSize["3xl"],
  },
  subtitle: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
    marginTop: verticalSpace.sm,
  },
  actions: {
    columnGap: gap.lg,
    display: "flex",
    rowGap: gap.lg,
  },
  controls: {
    alignItems: "center",
    columnGap: gap["4xl"],
    display: "flex",
    marginBottom: verticalSpace.sm,
    rowGap: gap["4xl"],
  },
  // The search field is sized to hold a full email address without the layout
  // reflowing as the segmented control's tab labels change width.
  search: { width: "260px" },

  // Subscriber · Source · Opens · Joined. The two trailing columns are fixed so
  // the right-aligned numbers stay in a column as the email column flexes.
  grid: {
    columnGap: gap["2xl"],
    display: "grid",
    gridTemplateColumns: "2fr 1fr 96px 120px",
    rowGap: gap["2xl"],
  },
  gridHead: {
    color: uiColor.text1,
    fontSize: fontSize.xs,
    letterSpacing: tracking.wider,
    paddingBlockEnd: verticalSpace.lg,
    paddingBlockStart: verticalSpace.lg,
    paddingInlineEnd: horizontalSpace.xl,
    paddingInlineStart: horizontalSpace.xl,
    textTransform: "uppercase",
  },
  row: {
    alignItems: "center",
    paddingBlockEnd: verticalSpace.xl,
    paddingBlockStart: verticalSpace.xl,
    paddingInlineEnd: horizontalSpace.xl,
    paddingInlineStart: horizontalSpace.xl,
  },
  identity: {
    alignItems: "center",
    columnGap: gap.xl,
    display: "flex",
    minWidth: 0,
    rowGap: gap.xl,
  },
  nameLine: {
    alignItems: "center",
    columnGap: gap.md,
    display: "flex",
    rowGap: gap.md,
  },
  email: {
    color: uiColor.text2,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  did: {
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
  },
  source: {
    color: primaryColor.text1,
    fontSize: fontSize.sm,
  },
  numeric: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    textAlign: "right",
  },
  numericStrong: { color: uiColor.text2 },
  numericMuted: { color: uiColor.text1 },
  joined: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
    textAlign: "right",
  },
  noMatch: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
    paddingBlockEnd: spacing["8"],
    paddingBlockStart: spacing["8"],
    paddingInlineEnd: horizontalSpace.xl,
    paddingInlineStart: horizontalSpace.xl,
    textAlign: "center",
  },
});

function Subscribers() {
  const { pubId } = Route.useParams();
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(publicationSubscribersQueryOptions(pubId));
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const all = useMemo(() => data?.subscribers ?? [], [data]);
  const counts = useMemo(
    () => ({
      all: all.length,
      confirmed: all.filter((s) => s.status === "confirmed").length,
      pending: all.filter((s) => s.status === "pending").length,
      unsubscribed: all.filter((s) => s.status === "unsubscribed").length,
    }),
    [all],
  );

  const needle = q.trim().toLowerCase();
  const rows = all.filter(
    (s) =>
      (filter === "all" || s.status === filter) &&
      (needle === "" ||
        s.email.toLowerCase().includes(needle) ||
        (s.did?.toLowerCase().includes(needle) ?? false)),
  );

  const onExport = () => {
    if (globalThis.document === undefined) return;
    const blob = new Blob([toCsv(all)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = globalThis.document.createElement("a");
    a.href = url;
    a.download = `${pubId}-subscribers.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Only these four filters exist; pending gets a tab only when there are any,
  // since most publications never have unconfirmed rows lingering.
  const tabs: Array<[Filter, string]> = [
    ["all", `All ${counts.all}`],
    ["confirmed", `Confirmed ${counts.confirmed}`],
    ...(counts.pending > 0
      ? ([["pending", `Pending ${counts.pending}`]] as Array<[Filter, string]>)
      : []),
    ["unsubscribed", `Unsubscribed ${counts.unsubscribed}`],
  ];

  return (
    <div {...stylex.props(common.screen)}>
      <div
        {...stylex.props(
          common.container,
          common.screenPadTight,
          common.measureFull,
        )}
      >
        <Link
          to="/p/$pubId"
          params={{ pubId }}
          {...stylex.props(common.backLink)}
        >
          <Ico d={I.chevL} s={15} w={1.9} />
          {data?.name}
        </Link>

        <div {...stylex.props(styles.head)}>
          <div>
            <h1 {...stylex.props(common.pageTitle, styles.title)}>
              Subscribers
            </h1>
            <div {...stylex.props(styles.subtitle)}>
              {counts.confirmed === 0
                ? `No one receives ${data?.name} yet`
                : `${fmt(counts.confirmed)} ${counts.confirmed === 1 ? "person receives" : "people receive"} ${data?.name}`}
            </div>
          </div>
          <span {...stylex.props(common.pushEnd, styles.actions)}>
            {all.length > 0 ? (
              <Button variant="tertiary" onPress={onExport}>
                <span {...stylex.props(common.buttonContent)}>
                  <Ico d={I.download} s={16} />
                  Export CSV
                </span>
              </Button>
            ) : null}
            <Button
              variant="primary"
              onPress={() =>
                navigate({
                  to: "/p/$pubId/subscribers/import",
                  params: { pubId },
                })
              }
            >
              <span {...stylex.props(common.buttonContent)}>
                <Ico d={I.upload} s={16} />
                Import
              </span>
            </Button>
          </span>
        </div>

        {all.length === 0 ? (
          <SubscribersEmptyState
            name={data?.name ?? "this publication"}
            onImport={() =>
              navigate({
                to: "/p/$pubId/subscribers/import",
                params: { pubId },
              })
            }
          />
        ) : (
          <>
            <div {...stylex.props(styles.controls)}>
              <SegmentedControl
                selectedKeys={new Set([filter])}
                onSelectionChange={(keys) => {
                  const next = [...(keys as Set<Key>)][0];
                  if (typeof next === "string") setFilter(next as Filter);
                }}
              >
                {tabs.map(([id, label]) => (
                  <SegmentedControlItem key={id} id={id} selection="fill">
                    {label}
                  </SegmentedControlItem>
                ))}
              </SegmentedControl>
              <span {...stylex.props(common.pushEnd, styles.search)}>
                <SearchField
                  aria-label="Search subscribers"
                  placeholder="Search email"
                  value={q}
                  onChange={setQ}
                />
              </span>
            </div>

            <div {...stylex.props(common.ruleBelow)}>
              <div
                {...stylex.props(
                  common.ruleAbove,
                  styles.grid,
                  styles.gridHead,
                )}
              >
                <span>Subscriber</span>
                <span>Source</span>
                <span {...stylex.props(styles.joined)}>Opens</span>
                <span {...stylex.props(styles.joined)}>Joined</span>
              </div>
              {rows.map((s) => (
                <SubscriberRow key={s.email} s={s} />
              ))}
              {rows.length === 0 ? (
                <div {...stylex.props(common.ruleAbove, styles.noMatch)}>
                  No subscribers match “{q}”.
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SubscriberRow({ s }: { s: SubscriberRowData }) {
  return (
    <div
      {...stylex.props(common.ruleAbove, styles.grid, styles.row)}
    >
      <div {...stylex.props(styles.identity)}>
        <Avatar
          size="sm"
          alt=""
          fallback={emailName(s.email).charAt(0).toUpperCase()}
        />
        <div {...stylex.props(common.flexFill)}>
          <div {...stylex.props(styles.nameLine)}>
            <span {...stylex.props(styles.email, common.truncate)}>
              {s.email}
            </span>
            {s.status === "unsubscribed" ? (
              <Badge size="sm" variant="critical">
                Unsubbed
              </Badge>
            ) : null}
            {s.status === "pending" ? (
              <Badge size="sm" variant="warning">
                Pending
              </Badge>
            ) : null}
          </div>
          {s.did ? (
            <div {...stylex.props(styles.did, common.truncate)}>{s.did}</div>
          ) : null}
        </div>
      </div>
      <span {...stylex.props(styles.source)}>
        {SOURCE_LABEL[s.source] ?? s.source}
      </span>
      <span
        {...stylex.props(
          styles.numeric,
          s.openRate === null ? styles.numericMuted : styles.numericStrong,
        )}
      >
        {s.openRate === null ? "—" : `${s.openRate}%`}
      </span>
      <span {...stylex.props(styles.joined)}>{s.joined}</span>
    </div>
  );
}

function SubscribersEmptyState({
  name,
  onImport,
}: {
  name: string;
  onImport: () => void;
}) {
  return (
    <EmptyState>
      <EmptyStateImage>
        <Users size={24} />
      </EmptyStateImage>
      <EmptyStateTitle>No subscribers yet</EmptyStateTitle>
      <EmptyStateDescription>
        When someone subscribes to {name} — from the subscribe page or a Bluesky
        record — they’ll appear here. You can also import an existing list.
      </EmptyStateDescription>
      <EmptyStateActions>
        <Button variant="primary" size="sm" onPress={onImport}>
          <span {...stylex.props(common.buttonContent)}>
            <Ico d={I.upload} s={16} />
            Import subscribers
          </span>
        </Button>
      </EmptyStateActions>
    </EmptyState>
  );
}
