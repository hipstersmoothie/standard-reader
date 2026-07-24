// The design system's `Link` for the one link that leaves the app; in-app
// navigation goes through TanStack Router's `Link` below.
import { Link as ExternalLink } from "@standard-reader/design-system/link";
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
import { Link, createFileRoute, redirect } from "@tanstack/react-router";

import { common } from "../common-styles";
import { AreaChart } from "../components/charts";
import { I, Ico, icon } from "../components/icons";
import { Delta, PubGlyph, StatBar, StatCard } from "../components/ui";
import type { Send } from "../data/publications";
import { fmt } from "../lib/format";
import { publicationsQueryOptions } from "../server/analytics";

export const Route = createFileRoute("/_app/p/$pubId")({
  loader: async ({ context, params }) => {
    const pubs = await context.queryClient.ensureQueryData(
      publicationsQueryOptions(),
    );
    if (!pubs.some((p) => p.id === params.pubId)) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: PubAnalytics,
});

const styles = stylex.create({
  // The masthead is painted in the publication's own stored theme, which is
  // arbitrary runtime data rather than an app token.
  masthead: (background: string, foreground: string) => ({
    backgroundColor: background,
    color: foreground,
  }),
  mastheadInner: {
    alignItems: "flex-start",
    columnGap: gap["4xl"],
    display: "flex",
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    maxWidth: "1000px",
    paddingBlockEnd: spacing["8"],
    paddingBlockStart: spacing["9"],
    paddingInlineEnd: spacing["10"],
    paddingInlineStart: spacing["10"],
    rowGap: gap["4xl"],
  },
  pubName: {
    fontFamily: fontFamily.serif,
    fontSize: fontSize["3xl"],
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.none,
  },
  pubDesc: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    marginTop: verticalSpace.sm,
    maxWidth: "520px",
    opacity: 0.82,
  },
  pubMeta: {
    alignItems: "center",
    columnGap: gap.xl,
    display: "flex",
    flexWrap: "wrap",
    fontSize: fontSize.xs,
    marginTop: verticalSpace["2xl"],
    opacity: 0.75,
    rowGap: gap.xl,
  },
  metaItem: {
    alignItems: "center",
    columnGap: gap.sm,
    display: "inline-flex",
    rowGap: gap.sm,
  },
  metaMono: { fontFamily: fontFamily.mono },
  dot: { opacity: 0.4 },
  mastheadActions: {
    alignItems: "center",
    columnGap: gap["3xl"],
    display: "flex",
    rowGap: gap["3xl"],
  },
  mastheadLink: {
    alignItems: "center",
    // Inherits the masthead's own foreground, whatever the publication's theme
    // set it to.
    color: "inherit",
    columnGap: gap.sm,
    display: "inline-flex",
    fontSize: fontSize.sm,
    opacity: { default: 0.75, ":hover": 1 },
    rowGap: gap.sm,
    textDecoration: "none",
    transitionDuration: animationDuration.default,
    transitionProperty: "opacity",
  },

  cards: {
    columnGap: gap["2xl"],
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    marginBottom: spacing["6"],
    rowGap: gap["2xl"],
  },
  growthCard: {
    marginBottom: spacing["7"],
    paddingBlockEnd: verticalSpace["5xl"],
    paddingBlockStart: verticalSpace["5xl"],
    paddingInlineEnd: horizontalSpace["5xl"],
    paddingInlineStart: horizontalSpace["5xl"],
  },
  cardHead: {
    alignItems: "baseline",
    columnGap: gap.xl,
    display: "flex",
    marginBottom: verticalSpace["2xl"],
    rowGap: gap.xl,
  },
  cardTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
  },

  sendsHead: {
    alignItems: "flex-end",
    display: "flex",
    marginBottom: verticalSpace.xl,
  },
  sendsList: {
    overflow: "hidden",
  },
  sendRow: {
    alignItems: "center",
    // Rules separate the rows; the card's own border closes the list, so the
    // last row does not draw one.
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: { default: 1, ":last-child": 0 },
    columnGap: gap["2xl"],
    display: "grid",
    // Title · opens · clicks · unsubs · chevron. The metric columns are fixed
    // so their bars line up down the list.
    gridTemplateColumns: "1fr 120px 120px 84px 22px",
    paddingBlockEnd: verticalSpace["3xl"],
    paddingBlockStart: verticalSpace["3xl"],
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    rowGap: gap["2xl"],
  },
  sendTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
  },
  sendWhen: {
    color: uiColor.text1,
    fontSize: fontSize.xs,
    marginTop: verticalSpace.xxs,
  },
  barHead: {
    display: "flex",
    fontSize: fontSize.xs,
    justifyContent: "space-between",
    marginBottom: verticalSpace.xs,
  },
  barLabel: { color: uiColor.text1 },
  barValue: { color: uiColor.text2, fontWeight: fontWeight.semibold },
  unsubs: {
    color: uiColor.text1,
    fontSize: fontSize.xs,
    textAlign: "right",
  },
  unsubsInner: {
    alignItems: "center",
    columnGap: gap.xs,
    display: "inline-flex",
    rowGap: gap.xs,
  },

  noSends: {
    paddingBlockEnd: spacing["10"],
    paddingBlockStart: spacing["10"],
    paddingInlineEnd: horizontalSpace["5xl"],
    paddingInlineStart: horizontalSpace["5xl"],
    textAlign: "center",
  },
  noSendsTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    marginBottom: verticalSpace.sm,
  },
  noSendsBody: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.base,
    marginBlockEnd: 0,
    marginBlockStart: 0,
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    maxWidth: "380px",
  },
});

function SendRow({ s, pubId }: { s: Send; pubId: string }) {
  return (
    <Link
      to="/p/$pubId/$sendPath"
      params={{ pubId, sendPath: s.path }}
      {...stylex.props(common.rowLink, styles.sendRow)}
    >
      <div {...stylex.props(common.flexFill)}>
        <div {...stylex.props(styles.sendTitle, common.truncate)}>
          {s.title}
        </div>
        <div {...stylex.props(styles.sendWhen)}>
          {s.when} · {fmt(s.recipients)} recipients
        </div>
      </div>
      <div>
        <div {...stylex.props(styles.barHead)}>
          <span {...stylex.props(styles.barLabel)}>Opens</span>
          <span {...stylex.props(styles.barValue)}>{s.openRate}%</span>
        </div>
        <StatBar pct={s.openRate} label={`Open rate for ${s.title}`} />
      </div>
      <div>
        <div {...stylex.props(styles.barHead)}>
          <span {...stylex.props(styles.barLabel)}>Clicks</span>
          <span {...stylex.props(styles.barValue)}>{s.clickRate}%</span>
        </div>
        {/* Click rates run an order of magnitude below open rates, so the bar
            is scaled to keep a typical 3–8% readable next to a 40% open bar.
            The meter still announces the real rate. */}
        <StatBar
          pct={s.clickRate * 3.5}
          label={`Click rate for ${s.title}: ${s.clickRate}%`}
          variant="success"
        />
      </div>
      <div {...stylex.props(styles.unsubs)}>
        <span {...stylex.props(styles.unsubsInner)}>
          <Ico d={I.userMinus} s={13} />
          {s.unsubs}
        </span>
      </div>
      <Ico d={I.chevR} s={16} style={icon.muted} />
    </Link>
  );
}

function PubAnalytics() {
  const { pubId } = Route.useParams();
  const { data: pubs } = useSuspenseQuery(publicationsQueryOptions());
  const pub = pubs.find((p) => p.id === pubId);
  if (!pub) return null;
  const t = pub.theme;
  const hasSends = pub.sends.length > 0;
  // An all-zero series is nothing to chart — a flat line reads as data.
  const hasGrowth = pub.growth.some((g) => g.subscribers > 0);
  // A publication with no sends has no averages; averaging over zero of them is
  // NaN, and the cards show "—" rather than a fabricated rate.
  const avgUnsub = hasSends
    ? Math.round(pub.sends.reduce((s, x) => s + x.unsubs, 0) / pub.sends.length)
    : 0;

  return (
    <div {...stylex.props(common.screen)}>
      <div
        {...stylex.props(
          common.ruleBelow,
          styles.masthead(t.background, t.foreground),
        )}
      >
        <div {...stylex.props(styles.mastheadInner)}>
          <PubGlyph pub={pub} size="xl" />
          <div {...stylex.props(common.flexFill)}>
            <div {...stylex.props(styles.pubName)}>{pub.name}</div>
            <div {...stylex.props(styles.pubDesc)}>{pub.desc}</div>
            <div {...stylex.props(styles.pubMeta)}>
              <span {...stylex.props(styles.metaItem, styles.metaMono)}>
                <Ico d={I.link} s={14} />
                {pub.url}
              </span>
              <span {...stylex.props(styles.dot)}>·</span>
              {pub.cadence ? (
                <>
                  <span {...stylex.props(styles.metaItem)}>
                    <Ico d={I.calendar} s={14} />
                    {pub.cadence}
                  </span>
                  <span {...stylex.props(styles.dot)}>·</span>
                </>
              ) : null}
              <span>
                {pub.sends.length} {pub.sends.length === 1 ? "send" : "sends"}
              </span>
            </div>
          </div>
          <div {...stylex.props(common.flexNone, styles.mastheadActions)}>
            <ExternalLink
              href={`https://${pub.url}`}
              target="_blank"
              rel="noreferrer"
              style={styles.mastheadLink}
            >
              <Ico d={I.external} s={15} /> Visit site
            </ExternalLink>
            <Link
              to="/p/$pubId/settings"
              params={{ pubId: pub.id }}
              {...stylex.props(styles.mastheadLink)}
            >
              <Ico d={I.settings} s={15} /> Settings
            </Link>
          </div>
        </div>
      </div>

      <div
        {...stylex.props(
          common.container,
          common.screenPadTight,
          common.measureFull,
        )}
      >
        <div {...stylex.props(styles.cards)}>
          <StatCard
            icon={I.users}
            label="Subscribers"
            value={fmt(pub.subs)}
            to="/p/$pubId/subscribers"
            params={{ pubId: pub.id }}
            foot={
              pub.delta > 0 ? (
                <span>
                  <Delta value={pub.delta} /> new this week
                </span>
              ) : (
                <span>View list →</span>
              )
            }
          />
          <StatCard
            icon={I.eye}
            label="Open rate"
            value={hasSends ? `${pub.openRate}%` : "—"}
            foot={hasSends ? "avg across sends" : "no sends yet"}
          />
          <StatCard
            icon={I.cursor}
            label="Click rate"
            value={hasSends ? `${pub.clickRate}%` : "—"}
            foot={hasSends ? "avg across sends" : "no sends yet"}
          />
          <StatCard
            icon={I.userMinus}
            label="Unsubscribes"
            value={hasSends ? `${avgUnsub}` : "—"}
            foot={hasSends ? "avg per send" : "no sends yet"}
          />
        </div>

        {hasGrowth ? (
          <div {...stylex.props(common.card, styles.growthCard)}>
            <div {...stylex.props(styles.cardHead)}>
              <div {...stylex.props(styles.cardTitle)}>Subscriber growth</div>
              <div {...stylex.props(common.meta, common.pushEnd)}>
                Last 12 months
              </div>
            </div>
            <AreaChart
              data={pub.growth.map((g) => g.subscribers)}
              h={160}
              labels={pub.growth.map((g) => g.month)}
            />
          </div>
        ) : null}

        <div {...stylex.props(styles.sendsHead)}>
          <div {...stylex.props(common.sectionLabel)}>Newsletters sent</div>
          <span {...stylex.props(common.meta, common.pushEnd)}>
            Each row is a published post mailed to subscribers
          </span>
        </div>
        <div {...stylex.props(common.card, styles.sendsList)}>
          {pub.sends.length === 0 ? (
            <div {...stylex.props(styles.noSends)}>
              <div {...stylex.props(styles.noSendsTitle)}>
                No newsletters sent yet
              </div>
              <p {...stylex.props(styles.noSendsBody)}>
                New posts published to this publication are mailed to its
                subscribers and their delivery reports appear here.
              </p>
            </div>
          ) : (
            pub.sends.map((s) => <SendRow key={s.path} s={s} pubId={pub.id} />)
          )}
        </div>
      </div>
    </div>
  );
}
