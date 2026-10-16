"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { DirectionalIcon } from "@standard-reader/design-system/directional-icon";
import { Flex } from "@standard-reader/design-system/flex";
import { Link } from "@standard-reader/design-system/link";
import {
  primaryColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
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
import { createFileRoute, notFound } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { ArticleRow } from "#/components/reader/cards";
import { Masthead, ReaderContent } from "#/components/reader/primitives";
import { usePullToRefresh } from "#/components/reader/pull-to-refresh";
import { ButtonLink } from "#/components/router-links";
import { weeklyApi } from "#/integrations/tanstack-query/api-weekly.functions";
import { bskyPostUrl } from "#/lib/leaflet/bsky";
import { getPublicUrlClient } from "#/lib/public-url";
import { canonicalLink, SITE_NAME, siteSocialMeta } from "#/lib/site-metadata";
import { useFormatters } from "#/lib/use-formatters";
import { isWeekKey, weeklyPicksOgImageUrl } from "#/lib/weekly-picks";

/**
 * The week's hottest reads — the page the Friday Bluesky thread roots on.
 * The thread's replies link each article to its own site; this page is the
 * Standard Reader view of the same picks, in the order they were posted.
 */
export const Route = createFileRoute("/_layout/weekly/$week")({
  staleTime: 5 * 60_000,
  loader: async ({ context, params }) => {
    if (!isWeekKey(params.week)) throw notFound();
    const page = await context.queryClient.ensureQueryData(
      weeklyApi.getWeeklyPicksQueryOptions({ week: params.week }),
    );
    if (!page) throw notFound();
    return {
      count: page.picks.length,
      titles: page.picks.map((pick) => pick.article.title),
    };
  },
  head: ({ loaderData, params }) => {
    const baseUrl = getPublicUrlClient();
    const url = `${baseUrl.replace(/\/$/, "")}/weekly/${params.week}`;
    const titles = loaderData?.titles ?? [];
    return {
      meta: siteSocialMeta({
        title: `The week's hottest reads · ${SITE_NAME}`,
        description:
          titles.length > 0
            ? titles.map((title, i) => `${i + 1}. ${title}`).join(" · ")
            : "The articles readers recommended most this week.",
        url,
        ogImage: weeklyPicksOgImageUrl(baseUrl, params.week),
      }),
      links: [canonicalLink(url)],
    };
  },
  component: WeeklyPicksPage,
});

/** `2026-W42` → `{ year: "2026", week: "42" }`, with the week unpadded. */
function splitWeekKey(key: string): { year: string; week: string } {
  const [year, week] = key.split("-W");
  return { year, week: String(Number(week)) };
}

function WeeklyPicksPage() {
  usePullToRefresh();
  const { t } = useLingui();
  const fmt = useFormatters();
  const { week: weekKey } = Route.useParams();
  const { data } = useSuspenseQuery(
    weeklyApi.getWeeklyPicksQueryOptions({ week: weekKey }),
  );
  // The loader 404s a missing week before render, so this is always set.
  if (!data) return null;

  const { year, week } = splitWeekKey(data.periodKey);
  const start = fmt.date(data.windowStart);
  const end = fmt.date(data.windowEnd);
  const threadUrl = data.threadUri ? bskyPostUrl(data.threadUri) : null;

  return (
    <ReaderContent>
      <Masthead
        kicker={<Trans>Weekly · {year}</Trans>}
        title={<Trans>The week&apos;s hottest reads</Trans>}
        dek={
          <Trans>
            What readers across the network recommended most, {start} to {end}.
            Each one is written and published by an independent author on their
            own site.
          </Trans>
        }
        metaLabel={t`Week`}
        metaValue={week}
      />

      {data.picks.length === 0 ? (
        <p {...stylex.props(styles.empty)}>
          <Trans>
            Every pick this week is from an account you&apos;ve blocked or
            muted.
          </Trans>
        </p>
      ) : (
        <ol {...stylex.props(styles.list)}>
          {data.picks.map(({ rank, article }, i) => (
            <li key={article.uri} {...stylex.props(styles.pick)}>
              <span
                aria-hidden
                {...stylex.props(styles.rank, i === 0 && styles.rankFirst)}
              >
                {rank}
              </span>
              <div {...stylex.props(styles.pickBody)}>
                <ArticleRow article={article} isFirstInSection={i === 0} />
              </div>
            </li>
          ))}
        </ol>
      )}

      <Flex direction="column" gap="3xl" style={styles.footer}>
        <p {...stylex.props(styles.note)}>
          <Trans>
            Picked every Friday from a week of recommendations, with the most
            recent counting most, and posted as a thread on Bluesky.
          </Trans>{" "}
          {threadUrl ? (
            <Link href={threadUrl} target="_blank" rel="noopener noreferrer">
              <Trans>Join the conversation</Trans>
            </Link>
          ) : null}
        </p>
        {data.previous || data.next ? (
          <nav aria-label={t`Other weeks`}>
            <Flex gap="xl" justify="between" wrap>
              {data.previous ? (
                <ButtonLink
                  to="/weekly/$week"
                  params={{ week: data.previous }}
                  variant="secondary"
                >
                  <DirectionalIcon as={ArrowLeft} size={15} />{" "}
                  <Trans>Week {splitWeekKey(data.previous).week}</Trans>
                </ButtonLink>
              ) : (
                <span />
              )}
              {data.next ? (
                <ButtonLink
                  to="/weekly/$week"
                  params={{ week: data.next }}
                  variant="secondary"
                >
                  <Trans>Week {splitWeekKey(data.next).week}</Trans>{" "}
                  <DirectionalIcon as={ArrowRight} size={15} />
                </ButtonLink>
              ) : null}
            </Flex>
          </nav>
        ) : null}
      </Flex>
    </ReaderContent>
  );
}

const styles = stylex.create({
  list: {
    listStyle: "none",
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
    paddingInlineStart: spacing["0"],
  },
  pick: {
    columnGap: {
      default: spacing["4"],
      "@media (min-width: 40rem)": spacing["8"],
    },
    display: "grid",
    gridTemplateColumns: {
      default: `${spacing["8"]} minmax(0, 1fr)`,
      "@media (min-width: 40rem)": `${spacing["12"]} minmax(0, 1fr)`,
    },
  },
  // The numeral sits level with the row's byline: the same top padding the
  // row shell puts above it (`spacing["6"]`, none for the first row).
  rank: {
    color: primaryColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: {
      default: fontSize["3xl"],
      "@media (min-width: 40rem)": fontSize["5xl"],
    },
    fontVariantNumeric: "lining-nums tabular-nums",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.none,
    paddingTop: spacing["6"],
    textAlign: "end",
  },
  rankFirst: {
    paddingTop: spacing["0"],
  },
  pickBody: {
    minWidth: 0,
  },
  footer: {
    paddingBottom: spacing["10"],
    paddingTop: spacing["8"],
  },
  note: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontStyle: "italic",
    lineHeight: lineHeight.base,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
  empty: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontStyle: "italic",
    marginTop: spacing["6"],
  },
});
