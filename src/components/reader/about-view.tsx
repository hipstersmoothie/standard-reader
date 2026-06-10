"use client";

import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { discoverApi } from "#/integrations/tanstack-query/api-discover.functions";
import { formatCount } from "#/lib/format-count";

import { primaryColor, uiColor } from "../../design-system/theme/color.stylex";
import { Kicker } from "./primitives";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "../../design-system/theme/semantic-spacing.stylex";
import { spacing } from "../../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "../../design-system/theme/typography.stylex";

const MOBILE = "@media (max-width: 47.5rem)";

const TENETS = [
  {
    name: "Writers own their work",
    desc: "Every publication lives in its author's repository. We index it; we never hold it.",
  },
  {
    name: "The directory is just a query",
    desc: "One shared protocol means the whole network is browsable. There is no walled garden to maintain.",
  },
  {
    name: "Your reading life is yours",
    desc: "Follows, likes, and saves belong to your account and travel with you to any compatible app.",
  },
] as const;

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    marginLeft: "auto",
    marginRight: "auto",
    maxWidth: "640px",
    paddingBottom: {
      [MOBILE]: spacing["20"],
      default: spacing["20"],
    },
    paddingLeft: {
      [MOBILE]: horizontalSpace["3xl"],
      default: horizontalSpace["3xl"],
    },
    paddingRight: {
      [MOBILE]: horizontalSpace["3xl"],
      default: horizontalSpace["3xl"],
    },
    paddingTop: {
      [MOBILE]: verticalSpace["7xl"],
      default: verticalSpace["10xl"],
    },
    width: "100%",
  },
  head: {
    textAlign: "center",
    marginBottom: verticalSpace["7xl"],
  },
  headKicker: {
    display: "block",
    marginBottom: verticalSpace["4xl"],
  },
  title: {
    textBoxEdge: "cap alphabetic",

    textBoxTrim: "trim-both",
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: {
      [MOBILE]: fontSize["4xl"],
      default: fontSize["5xl"],
    },
    fontStyle: "italic",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.xs,
    textWrap: "balance",
    marginBottom: verticalSpace["4xl"],
    marginTop: verticalSpace.none,
  },
  dek: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xl,
    fontStyle: "italic",
    lineHeight: lineHeight.sm,
    textWrap: "balance",
    marginBottom: verticalSpace.none,
    marginLeft: "auto",
    marginRight: "auto",
    marginTop: verticalSpace.none,
    maxWidth: "36ch",
  },
  body: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: {
      [MOBILE]: fontSize.lg,
      default: "1.1875rem",
    },
    lineHeight: 1.68,
  },
  paragraph: {
    marginBottom: spacing["5"],
    marginTop: verticalSpace.none,
  },
  dropCapParagraph: {
    display: "flow-root",
    minHeight: `calc(3.5em * 0.78 + ${spacing["1.5"]})`,
  },
  dropCap: {
    color: primaryColor.text2,
    float: "left",
    fontFamily: fontFamily.serif,
    fontSize: "3.5em",
    fontStyle: "italic",
    fontWeight: fontWeight.semibold,
    lineHeight: 0.78,
    paddingBottom: spacing["0"],
    paddingLeft: spacing["0"],
    paddingRight: spacing["3"],
    paddingTop: spacing["1.5"],
  },
  sectionHeading: {
    color: primaryColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.widest,
    textTransform: "uppercase",
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginBottom: verticalSpace["3xl"],
    marginTop: verticalSpace["9xl"],
    paddingTop: verticalSpace["5xl"],
  },
  sectionHeadingPlain: {
    borderTopWidth: 0,
    marginTop: verticalSpace["5xl"],
    paddingTop: verticalSpace.none,
  },
  inlineLink: {
    font: "inherit",
    borderWidth: 0,
    backgroundColor: "transparent",
    color: primaryColor.text2,
    cursor: "pointer",
    textDecorationColor: primaryColor.component3,
    textDecorationLine: "underline",
    textDecorationThickness: "2px",
    textUnderlineOffset: spacing["1"],
    paddingBottom: verticalSpace.none,
    paddingLeft: horizontalSpace.none,
    paddingRight: horizontalSpace.none,
    paddingTop: verticalSpace.none,
  },
  tenets: {
    display: "flex",
    flexDirection: "column",
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginBottom: verticalSpace.xl,
    marginTop: verticalSpace["5xl"],
  },
  tenet: {
    alignItems: "baseline",
    columnGap: horizontalSpace["3xl"],
    display: "grid",
    gridTemplateColumns: {
      [MOBILE]: "1fr",
      default: "220px 1fr",
    },
    rowGap: {
      [MOBILE]: gap.xxs,
      default: gap.xs,
    },
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: verticalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
  },
  tenetName: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: "1.09375rem",
    fontStyle: "italic",
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.sm,
  },
  tenetDesc: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.base,
  },
  colophon: {
    textAlign: "center",
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginTop: verticalSpace["8xl"],
    paddingTop: verticalSpace["5xl"],
  },
  colophonText: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: "0.96875rem",
    fontStyle: "italic",
    lineHeight: lineHeight.base,
    marginBottom: verticalSpace["3xl"],
    marginLeft: "auto",
    marginRight: "auto",
    marginTop: verticalSpace.none,
    maxWidth: "46ch",
  },
  built: {
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    letterSpacing: tracking.wider,
    textTransform: "uppercase",
  },
});

export function AboutView() {
  const { data: knownPublicationCount } = useSuspenseQuery(
    discoverApi.getKnownPublicationCountQueryOptions(),
  );
  const publicationLabel =
    knownPublicationCount > 0 ? formatCount(knownPublicationCount) : null;

  return (
    <article {...stylex.props(styles.root)} data-screen-label="About">
      <header {...stylex.props(styles.head)}>
        <div {...stylex.props(styles.headKicker)}>
          <Kicker>About this app</Kicker>
        </div>
        <h1 {...stylex.props(styles.title)}>Standard Reader</h1>
        <p {...stylex.props(styles.dek)}>
          A calm, text-first home for long-form writing, and a way to keep
          finding new voices.
        </p>
      </header>

      <div {...stylex.props(styles.body)}>
        <p {...stylex.props(styles.paragraph, styles.dropCapParagraph)}>
          <span {...stylex.props(styles.dropCap)} aria-hidden>
            S
          </span>
          tandard Reader collects writing from publications on the
          AT&nbsp;Protocol, the same open network behind Bluesky, and presents
          it the way a classic feed reader would: a quiet, chronological home
          for the things you choose to follow. You follow publications; new
          writing arrives; you read it. There is no engagement feed, and nothing
          on the page is competing for your attention.
        </p>

        <h2 {...stylex.props(styles.sectionHeading)}>How it works</h2>

        <p {...stylex.props(styles.paragraph)}>
          Publications here are not hosted by us. Each one lives in a repository
          its author controls, written in a shared, open format that any
          compatible app can read. Standard Reader is one of those apps. There
          can be many, and they all see the same writing.
        </p>

        <p {...stylex.props(styles.paragraph)}>
          That has a useful consequence: because every publication speaks the
          same protocol, a directory of <em>all</em> of them is simply a
          question you can ask the network. We keep a fast index of every
          publication we know about, so browsing and search feel instant. But
          the index is only a copy; the originals always stay with their
          authors.
        </p>

        <p {...stylex.props(styles.paragraph)}>
          The same is true of your side of things. When you follow a
          publication, like an article, or save one for later, that is written
          to your own account, not locked inside this app. Sign in to a
          different reader tomorrow, and your subscriptions come with you.
        </p>

        <div {...stylex.props(styles.tenets)}>
          {TENETS.map((tenet) => (
            <div key={tenet.name} {...stylex.props(styles.tenet)}>
              <div {...stylex.props(styles.tenetName)}>{tenet.name}</div>
              <div {...stylex.props(styles.tenetDesc)}>{tenet.desc}</div>
            </div>
          ))}
        </div>

        <h2
          {...stylex.props(styles.sectionHeading, styles.sectionHeadingPlain)}
        >
          Why discovery is different here
        </h2>

        <p {...stylex.props(styles.paragraph)}>
          Most readers stop at the things you already follow, and finding
          something new is left to chance. Standard Reader treats discovery as
          part of the job. Because the whole network is visible, the{" "}
          <Link to="/discover" {...stylex.props(styles.inlineLink)}>
            Discover
          </Link>{" "}
          directory lists every known publication
          {publicationLabel === null ? null : (
            <> ({publicationLabel} at the moment)</>
          )}
          , alongside what&apos;s rising this week and what the people you
          follow are reading.
        </p>

        <p {...stylex.props(styles.paragraph)}>
          Recommendations come from real reading patterns on the network: people
          who follow the publications you follow tend to surface the next one
          worth your mornings. Nothing is promoted, and no one can pay to appear
          there.
        </p>
      </div>

      <footer {...stylex.props(styles.colophon)}>
        <p {...stylex.props(styles.colophonText)}>
          Standard Reader is read-first: it never posts on your behalf. You can
          read without an account; sign in with Bluesky to follow, like, and
          save.
        </p>
        <div {...stylex.props(styles.built)}>
          Built on the AT&nbsp;Protocol · standard.site publications
        </div>
      </footer>
    </article>
  );
}
