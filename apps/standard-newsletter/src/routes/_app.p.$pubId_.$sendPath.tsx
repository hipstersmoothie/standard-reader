import { Link as ExternalLink } from "@standard-reader/design-system/link";
import {
  primaryColor,
  successColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
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
import { I, Ico } from "../components/icons";
import { BigStat, StatBar } from "../components/ui";
import { fmt } from "../lib/format";
import { publicationsQueryOptions } from "../server/analytics";

export const Route = createFileRoute("/_app/p/$pubId_/$sendPath")({
  loader: async ({ context, params }) => {
    const pubs = await context.queryClient.ensureQueryData(
      publicationsQueryOptions(),
    );
    const pub = pubs.find((p) => p.id === params.pubId);
    const send = pub?.sends.find((s) => s.path === params.sendPath);
    if (!pub || !send) throw redirect({ to: "/dashboard" });
  },
  component: SendDetail,
});

const styles = stylex.create({
  head: {
    alignItems: "flex-start",
    columnGap: gap["2xl"],
    display: "flex",
    marginBlockEnd: verticalSpace.xs,
    marginBlockStart: spacing["3.5"],
    rowGap: gap["2xl"],
  },
  status: {
    alignItems: "center",
    color: successColor.text1,
    columnGap: gap.sm,
    display: "inline-flex",
    fontSize: fontSize.xs,
    marginBottom: verticalSpace.lg,
    rowGap: gap.sm,
  },
  statusDot: {
    backgroundColor: successColor.solid1,
    borderRadius: radius.full,
    height: spacing["2"],
    width: spacing["2"],
  },
  title: {
    fontSize: fontSize["3xl"],
  },
  subject: {
    alignItems: "center",
    color: uiColor.text1,
    columnGap: gap.md,
    display: "flex",
    fontSize: fontSize.sm,
    marginTop: verticalSpace.md,
    rowGap: gap.md,
  },
  subjectLine: { fontStyle: "italic" },
  viewPost: {
    backgroundColor: uiColor.bg,
    borderColor: uiColor.border2,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    color: uiColor.text2,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    paddingBlockEnd: verticalSpace.md,
    paddingBlockStart: verticalSpace.md,
    paddingInlineEnd: horizontalSpace.xl,
    paddingInlineStart: horizontalSpace.xl,
  },

  summary: {
    columnGap: gap["2xl"],
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    marginBlockEnd: spacing["6"],
    marginBlockStart: spacing["6"],
    paddingBlockEnd: verticalSpace["4xl"],
    paddingBlockStart: verticalSpace["4xl"],
    paddingInlineEnd: horizontalSpace["6xl"],
    paddingInlineStart: horizontalSpace["6xl"],
    rowGap: gap["2xl"],
  },

  panels: {
    alignItems: "start",
    columnGap: gap["5xl"],
    display: "grid",
    gridTemplateColumns: "1.3fr 1fr",
    rowGap: gap["5xl"],
  },
  panel: {
    paddingBlockEnd: verticalSpace["5xl"],
    paddingBlockStart: verticalSpace["5xl"],
    paddingInlineEnd: horizontalSpace["5xl"],
    paddingInlineStart: horizontalSpace["5xl"],
  },
  panelHead: {
    alignItems: "baseline",
    columnGap: gap.xl,
    display: "flex",
    marginBottom: verticalSpace["2xl"],
    rowGap: gap.xl,
  },
  panelTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
  },
  panelTitleSpaced: {
    marginBottom: verticalSpace["3xl"],
  },
  /** Stands in for a chart or a list that has no readership behind it yet. */
  panelEmpty: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    fontStyle: "italic",
    marginBlockEnd: 0,
    marginBlockStart: 0,
    paddingBlockEnd: verticalSpace["3xl"],
    paddingBlockStart: verticalSpace["3xl"],
  },

  links: {
    display: "flex",
    flexDirection: "column",
    rowGap: gap["2xl"],
  },
  linkHead: {
    columnGap: gap.xl,
    display: "flex",
    justifyContent: "space-between",
    marginBottom: verticalSpace.sm,
    rowGap: gap.xl,
  },
  linkUrl: {
    color: primaryColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
  },
  linkCount: {
    color: uiColor.text2,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  titleTight: {
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.none,
  },
});

/**
 * `n` as a percentage of `total`, formatted. A send to an empty list has a zero
 * denominator, which would otherwise print "NaN%" all down the summary row.
 */
function share(n: number, total: number, digits = 1): string {
  return (total > 0 ? (n / total) * 100 : 0).toFixed(digits);
}

function SendDetail() {
  const { pubId, sendPath } = Route.useParams();
  const { data: pubs } = useSuspenseQuery(publicationsQueryOptions());
  const pub = pubs.find((p) => p.id === pubId);
  const send = pub?.sends.find((s) => s.path === sendPath);
  if (!pub || !send) return null;

  const delivered = send.delivered ?? send.recipients - send.bounces;
  const opens = Math.round((delivered * send.openRate) / 100);
  const clicks = Math.round((delivered * send.clickRate) / 100);
  // The cumulative-open curve is recorded per send, so it exists as 13 zeros
  // from the moment the send does. A flat line along the axis reads as data —
  // with nothing to plot, the panel says so instead.
  const curve = send.opensByHour ?? [];
  const hasOpenCurve = curve.some((v) => v > 0);
  const hourLabels = [
    "0h",
    "",
    "4h",
    "",
    "8h",
    "",
    "12h",
    "",
    "",
    "",
    "",
    "",
    "48h",
  ];
  // Only links someone actually clicked. With no click events there is no list
  // — inventing plausible URLs would read as a report on mail nobody opened.
  const links = (send.topLinks ?? []).map((l) => ({
    label: l.url,
    count: l.count,
  }));
  const maxLink = Math.max(1, ...links.map((l) => l.count));

  return (
    <div {...stylex.props(common.screen)}>
      <div
        {...stylex.props(
          common.container,
          common.screenPadTight,
          common.measureWide,
        )}
      >
        <Link
          to="/p/$pubId"
          params={{ pubId: pub.id }}
          {...stylex.props(common.backLink)}
        >
          <Ico d={I.chevL} s={15} w={1.9} />
          {pub.name}
        </Link>

        <div {...stylex.props(styles.head)}>
          <div {...stylex.props(common.flexFill)}>
            <div {...stylex.props(styles.status)}>
              <span {...stylex.props(styles.statusDot)} />
              Delivered · {send.when}
            </div>
            <h1
              {...stylex.props(
                common.pageTitle,
                styles.title,
                styles.titleTight,
              )}
            >
              {send.title}
            </h1>
            <div {...stylex.props(styles.subject)}>
              <Ico d={I.mail} s={15} />
              <span {...stylex.props(styles.subjectLine)}>
                “{send.subject}”
              </span>
            </div>
          </div>
          {/* A link, not a button: it leaves for the published post. The design
              system's `Link` carries the react-aria behavior; the chip shape is
              local so it sits as a control next to the headline. */}
          <ExternalLink
            href={`https://${pub.url}/${send.path}`}
            target="_blank"
            rel="noreferrer"
            style={[common.flexNone, styles.viewPost]}
          >
            <Ico d={I.external} s={16} />
            View post
          </ExternalLink>
        </div>

        <div {...stylex.props(common.card, styles.summary)}>
          <BigStat
            label="Delivered"
            value={fmt(delivered)}
            sub={`${share(delivered, send.recipients)}% of ${fmt(send.recipients)}`}
          />
          <BigStat
            label="Opens"
            value={`${send.openRate}%`}
            sub={`${fmt(opens)} unique`}
            tone="accent"
          />
          <BigStat
            label="Clicks"
            value={`${send.clickRate}%`}
            sub={`${fmt(clicks)} unique`}
            tone="positive"
          />
          <BigStat
            label="Unsubscribes"
            value={fmt(send.unsubs)}
            sub={`${share(send.unsubs, send.recipients, 2)}%`}
          />
          <BigStat
            label="Bounced"
            value={fmt(send.bounces)}
            sub={`${share(send.bounces, send.recipients, 2)}%`}
            tone="critical"
          />
        </div>

        <div {...stylex.props(styles.panels)}>
          <div {...stylex.props(common.card, styles.panel)}>
            <div {...stylex.props(styles.panelHead)}>
              <div {...stylex.props(styles.panelTitle)}>Opens over time</div>
              <div {...stylex.props(common.meta, common.pushEnd)}>
                First 48 hours
              </div>
            </div>
            {hasOpenCurve ? (
              <AreaChart data={curve} h={168} labels={hourLabels} />
            ) : (
              <p {...stylex.props(styles.panelEmpty)}>
                No opens recorded for this send yet.
              </p>
            )}
          </div>

          <div {...stylex.props(common.card, styles.panel)}>
            <div
              {...stylex.props(styles.panelTitle, styles.panelTitleSpaced)}
            >
              Top links clicked
            </div>
            {links.length === 0 ? (
              <p {...stylex.props(styles.panelEmpty)}>
                No link clicks recorded for this send yet.
              </p>
            ) : (
              <div {...stylex.props(styles.links)}>
                {links.map((l) => (
                  <div key={l.label}>
                    <div {...stylex.props(styles.linkHead)}>
                      <span {...stylex.props(styles.linkUrl, common.truncate)}>
                        {l.label}
                      </span>
                      <span
                        {...stylex.props(styles.linkCount, common.flexNone)}
                      >
                        {fmt(l.count)}
                      </span>
                    </div>
                    <StatBar
                      pct={(l.count / maxLink) * 100}
                      label={`${l.label}: ${fmt(l.count)} clicks`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
