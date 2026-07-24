import { Button } from "@standard-reader/design-system/button";
import { animationDuration } from "@standard-reader/design-system/theme/animations.stylex";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
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
  lineHeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { common } from "../common-styles";
import { AreaChart } from "../components/charts";
import { I, Ico, icon } from "../components/icons";
import { Delta, PubGlyph } from "../components/ui";
import { MONTHS } from "../data/publications";
import { fmt } from "../lib/format";
import { publicationsQueryOptions } from "../server/analytics";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

const styles = stylex.create({
  intro: {
    marginBlockEnd: spacing["8"],
    marginBlockStart: 0,
    // The standfirst wraps at a comfortable measure rather than the full
    // 1000px column.
    maxWidth: "620px",
  },
  titleGap: {
    marginBottom: verticalSpace.sm,
  },

  empty: {
    paddingBlockEnd: spacing["14"],
    paddingBlockStart: spacing["14"],
    paddingInlineEnd: spacing["10"],
    paddingInlineStart: spacing["10"],
    textAlign: "center",
  },
  emptyIcon: {
    display: "inline-flex",
    marginBottom: verticalSpace["4xl"],
  },
  emptyTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.medium,
    marginBottom: verticalSpace.md,
  },
  emptyBody: {
    color: uiColor.text1,
    fontSize: fontSize.base,
    lineHeight: lineHeight.base,
    marginBlockEnd: verticalSpace["5xl"],
    marginBlockStart: 0,
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    maxWidth: "420px",
  },
  emptyHeading: {
    marginBottom: spacing["8"],
  },

  kpis: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    marginBottom: spacing["11"],
  },
  kpi: {
    paddingBlockEnd: verticalSpace["5xl"],
    paddingBlockStart: verticalSpace["5xl"],
    paddingInlineEnd: horizontalSpace["5xl"],
    paddingInlineStart: horizontalSpace["5xl"],
  },
  kpiDivided: {
    borderInlineStartColor: uiColor.border1,
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 1,
  },
  kpiLabel: {
    alignItems: "center",
    color: uiColor.text1,
    columnGap: gap.md,
    display: "flex",
    fontSize: fontSize.xs,
    letterSpacing: tracking.wider,
    marginBottom: verticalSpace.xl,
    rowGap: gap.md,
    textTransform: "uppercase",
  },
  kpiValue: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["3xl"],
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.none,
    marginBottom: verticalSpace.lg,
  },
  kpiFoot: {
    alignItems: "center",
    color: uiColor.text1,
    columnGap: gap.xs,
    display: "flex",
    fontSize: fontSize.xs,
    rowGap: gap.xs,
  },

  chartBlock: {
    marginBottom: spacing["12"],
  },
  chartHead: {
    alignItems: "baseline",
    columnGap: gap.xl,
    display: "flex",
    marginBottom: verticalSpace["3xl"],
    rowGap: gap.xl,
  },
  chartTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xl,
  },

  columns: {
    alignItems: "start",
    columnGap: spacing["14"],
    display: "grid",
    gridTemplateColumns: "1.4fr 1fr",
    rowGap: spacing["14"],
  },

  pubRow: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": uiColor.component1,
    },
    columnGap: gap["3xl"],
    cursor: "pointer",
    display: "flex",
    paddingBlockEnd: verticalSpace["3xl"],
    paddingBlockStart: verticalSpace["3xl"],
    paddingInlineEnd: horizontalSpace.lg,
    paddingInlineStart: horizontalSpace.lg,
    rowGap: gap["3xl"],
    transitionDuration: animationDuration.default,
    transitionProperty: "background-color",
  },
  pubName: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
  },
  pubMeta: {
    alignItems: "center",
    color: uiColor.text1,
    columnGap: gap.md,
    display: "flex",
    fontSize: fontSize.xs,
    marginTop: verticalSpace.xxs,
    rowGap: gap.md,
  },
  dot: {
    opacity: 0.4,
  },
  // The open-rate column is fixed so the percentages line up down the list
  // while the publication names flex.
  pubRate: { textAlign: "right", width: "92px" },
  pubRateValue: {
    color: uiColor.text2,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  pubRateLabel: {
    color: uiColor.text1,
    fontSize: fontSize.xs,
  },

  sendRow: {
    alignItems: "center",
    columnGap: gap.xl,
    cursor: "pointer",
    display: "flex",
    paddingBlockEnd: verticalSpace["2xl"],
    paddingBlockStart: verticalSpace["2xl"],
    paddingInlineEnd: horizontalSpace.sm,
    paddingInlineStart: horizontalSpace.sm,
    rowGap: gap.xl,
  },
  sendTitle: {
    color: uiColor.text2,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  sendMeta: {
    color: uiColor.text1,
    fontSize: fontSize.xs,
  },
  noSends: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    fontStyle: "italic",
    paddingBlockEnd: verticalSpace["4xl"],
    paddingBlockStart: verticalSpace["4xl"],
    paddingInlineEnd: horizontalSpace.sm,
    paddingInlineStart: horizontalSpace.sm,
  },
});

function Dashboard() {
  const navigate = useNavigate();
  const { data: pubs } = useSuspenseQuery(publicationsQueryOptions());
  const openPub = (id: string) =>
    navigate({ to: "/p/$pubId", params: { pubId: id } });

  if (pubs.length === 0) {
    return (
      <div {...stylex.props(common.screen)}>
        <div
          {...stylex.props(
            common.container,
            common.screenPadRoomy,
            common.measureFull,
          )}
        >
          <h1 {...stylex.props(common.pageTitle, styles.emptyHeading)}>
            Dashboard
          </h1>
          <div {...stylex.props(common.card, styles.empty)}>
            <div
              {...stylex.props(
                common.chip,
                common.chipXl,
                common.chipRoomy,
                styles.emptyIcon,
              )}
            >
              <Ico d={I.mail} s={24} />
            </div>
            <div {...stylex.props(styles.emptyTitle)}>No newsletters yet</div>
            <p {...stylex.props(styles.emptyBody)}>
              To get started choose one of your publications to start a
              newsletter for.
            </p>
            <Button
              variant="primary"
              size="lg"
              onPress={() => navigate({ to: "/connect" })}
            >
              Start a newsletter
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const totalSubs = pubs.reduce((s, p) => s + p.subs, 0);
  const totalDelta = pubs.reduce((s, p) => s + p.delta, 0);
  const allSends = pubs
    .flatMap((p) => p.sends.map((s) => ({ ...s, pub: p })))
    .toSorted((a, b) => b.sentAtMs - a.sentAtMs);
  const recentSends = allSends.slice(0, 5);
  // Real send counts and totals — a publication with no sends contributes 0,
  // and averages over zero sends are 0, not fabricated.
  const thirtyDaysAgo = Date.now() - 30 * 86_400_000;
  const sends30 = allSends.filter((s) => s.sentAtMs >= thirtyDaysAgo).length;
  const emailsSent = allSends.reduce((s, x) => s + x.recipients, 0);
  const sentPubs = pubs.filter((p) => p.sends.length > 0);
  const weight = sentPubs.reduce((s, p) => s + p.subs, 0);
  const avgOpen =
    weight > 0
      ? sentPubs.reduce((s, p) => s + p.openRate * p.subs, 0) / weight
      : 0;
  const avgClick =
    weight > 0
      ? sentPubs.reduce((s, p) => s + p.clickRate * p.subs, 0) / weight
      : 0;
  // No historical subscriber timeseries in the read model, so there's no
  // growth chart to draw (rather than a fabricated curve).
  const hasGrowth = pubs.some((p) => p.growth.length > 0);

  const kpis: Array<{
    icon: string;
    label: string;
    value: string;
    foot: ReactNode;
  }> = [
    {
      icon: I.users,
      label: "Subscribers",
      value: fmt(totalSubs),
      foot:
        totalDelta > 0 ? (
          <>
            <Delta value={totalDelta} />
            <span>new this week</span>
          </>
        ) : (
          <span>
            across{" "}
            {pubs.length === 1 ? "1 newsletter" : `${pubs.length} newsletters`}
          </span>
        ),
    },
    {
      icon: I.send,
      label: "Emails sent",
      value: fmt(emailsSent),
      foot: <span>{sends30} sent · 30d</span>,
    },
    {
      icon: I.eye,
      label: "Avg open rate",
      value: emailsSent > 0 ? `${avgOpen.toFixed(1)}%` : "—",
      foot: <span>across sends</span>,
    },
    {
      icon: I.cursor,
      label: "Avg click rate",
      value: emailsSent > 0 ? `${avgClick.toFixed(1)}%` : "—",
      foot: <span>across sends</span>,
    },
  ];

  return (
    <div {...stylex.props(common.screen)}>
      <div
        {...stylex.props(
          common.container,
          common.screenPadRoomy,
          common.measureFull,
        )}
      >
        <h1 {...stylex.props(common.pageTitle, styles.titleGap)}>Dashboard</h1>
        <p {...stylex.props(common.pageIntro, styles.intro)}>
          Delivery and readership across all of your publications. Each
          newsletter is a published post, mailed to that publication’s
          subscribers.
        </p>

        <div
          {...stylex.props(common.ruleAbove, common.ruleBelow, styles.kpis)}
        >
          {kpis.map((k, i) => (
            <div
              key={k.label}
              {...stylex.props(styles.kpi, i > 0 && styles.kpiDivided)}
            >
              <div {...stylex.props(styles.kpiLabel)}>
                <Ico d={k.icon} s={15} style={icon.accentText} />
                {k.label}
              </div>
              <div {...stylex.props(styles.kpiValue)}>{k.value}</div>
              <div {...stylex.props(styles.kpiFoot)}>{k.foot}</div>
            </div>
          ))}
        </div>

        {hasGrowth ? (
          <div {...stylex.props(styles.chartBlock)}>
            <div {...stylex.props(styles.chartHead)}>
              <div {...stylex.props(styles.chartTitle)}>Total subscribers</div>
              <div {...stylex.props(common.meta, common.pushEnd)}>
                Last 12 months
              </div>
            </div>
            <AreaChart
              data={MONTHS.map((_, i) =>
                pubs.reduce((s, p) => s + (p.growth[i] ?? 0), 0),
              )}
              h={180}
              labels={MONTHS}
            />
          </div>
        ) : null}

        <div {...stylex.props(styles.columns)}>
          <div>
            <div {...stylex.props(common.sectionLabel)}>Publications</div>
            <div {...stylex.props(common.ruleBelow)}>
              {pubs.map((p) => (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openPub(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") openPub(p.id);
                  }}
                  {...stylex.props(common.ruleAbove, styles.pubRow)}
                >
                  <PubGlyph pub={p} />
                  <div {...stylex.props(common.flexFill)}>
                    <div {...stylex.props(styles.pubName, common.truncate)}>
                      {p.name}
                    </div>
                    <div {...stylex.props(styles.pubMeta)}>
                      <span>{fmt(p.subs)} subscribers</span>
                      <span {...stylex.props(styles.dot)}>·</span>
                      <Delta value={p.delta} />
                    </div>
                  </div>
                  <div {...stylex.props(common.flexNone, styles.pubRate)}>
                    <div {...stylex.props(styles.pubRateValue)}>
                      {p.openRate}%
                    </div>
                    <div {...stylex.props(styles.pubRateLabel)}>open rate</div>
                  </div>
                  <Ico d={I.chevR} s={17} style={[icon.muted, icon.fixed]} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <div {...stylex.props(common.sectionLabel)}>Recent sends</div>
            <div {...stylex.props(common.ruleBelow)}>
              {recentSends.length === 0 ? (
                <div {...stylex.props(common.ruleAbove, styles.noSends)}>
                  Nothing sent yet.
                </div>
              ) : null}
              {recentSends.map((s) => (
                <div
                  key={`${s.pub.id}-${s.path}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => openPub(s.pub.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") openPub(s.pub.id);
                  }}
                  {...stylex.props(common.ruleAbove, styles.sendRow)}
                >
                  <PubGlyph pub={s.pub} size="sm" />
                  <div {...stylex.props(common.flexFill)}>
                    <div {...stylex.props(styles.sendTitle, common.truncate)}>
                      {s.title}
                    </div>
                    <div {...stylex.props(styles.sendMeta)}>
                      {s.when.split(" · ")[0]} · {s.openRate}% open
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
