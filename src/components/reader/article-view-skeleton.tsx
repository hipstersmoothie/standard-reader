"use client";

import * as stylex from "@stylexjs/stylex";
import { Skeleton } from "#/design-system/skeleton";
import { uiColor } from "#/design-system/theme/color.stylex";
import { radius } from "#/design-system/theme/radius.stylex";
import { gap } from "#/design-system/theme/semantic-spacing.stylex";
import { spacing } from "#/design-system/theme/spacing.stylex";

import { articleMeasureStyles } from "./content/body-styles";

const BODY_LINES = ["100%", "96%", "88%", "100%", "72%", "94%", "58%"] as const;

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    maxWidth: "100%",
    minWidth: 0,
    overflowX: "clip",
    paddingBottom: {
      default: `calc(env(safe-area-inset-bottom, 0px) + ${spacing["28"]})`,
      "@media (min-width: 60rem)": 0,
    },
  },
  article: {
    boxSizing: "border-box",
    marginLeft: "auto",
    marginRight: "auto",
    maxWidth: "100%",
    minWidth: 0,
    paddingBottom: spacing["24"],
    paddingLeft: spacing["6"],
    paddingRight: spacing["6"],
    paddingTop: spacing["14"],
    width: "100%",
  },
  centered: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    marginLeft: "auto",
    marginRight: "auto",
    maxWidth: "100%",
    width: "100%",
  },
  kicker: {
    marginBottom: spacing["5"],
  },
  title: {
    gap: gap.md,
    marginBottom: spacing["5"],
    width: "100%",
  },
  titleLinePrimary: {
    maxWidth: "92%",
  },
  titleLineSecondary: {
    maxWidth: "68%",
  },
  dek: {
    gap: gap.md,
    marginBottom: spacing["7"],
    maxWidth: "30ch",
    width: "100%",
  },
  byline: {
    alignItems: "center",
    boxSizing: "border-box",
    columnGap: gap.lg,
    display: "flex",
    justifyContent: "center",
    rowGap: gap.lg,
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginBottom: spacing["2"],
    maxWidth: "100%",
    minWidth: 0,
    paddingBottom: spacing["5"],
    paddingTop: spacing["5"],
    width: "100%",
  },
  bylineWho: {
    gap: gap.sm,
    display: "flex",
    flexBasis: "0%",
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  hero: {
    borderRadius: radius.lg,
    overflow: "hidden",
    aspectRatio: "16 / 9",
    marginBottom: spacing["10"],
    marginTop: spacing["10"],
    width: "100%",
  },
  heroSkeleton: {
    height: "100%",
    width: "100%",
  },
  body: {
    gap: gap["2xl"],
    display: "flex",
    flexDirection: "column",
    marginTop: spacing["9"],
    width: "100%",
  },
});

export function ArticleViewSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading article"
      {...stylex.props(styles.root)}
    >
      <article {...stylex.props(styles.article, articleMeasureStyles.default)}>
        <div {...stylex.props(styles.centered, styles.kicker)}>
          <Skeleton variant="rectangle" height={spacing["3.5"]} width="7rem" />
        </div>

        <div {...stylex.props(styles.centered, styles.title)}>
          <Skeleton
            variant="rectangle"
            height={spacing["10"]}
            width="100%"
            style={styles.titleLinePrimary}
          />
          <Skeleton
            variant="rectangle"
            height={spacing["10"]}
            width="100%"
            style={styles.titleLineSecondary}
          />
        </div>

        <div {...stylex.props(styles.centered, styles.dek)}>
          <Skeleton variant="rectangle" height={spacing["5"]} width="100%" />
          <Skeleton variant="rectangle" height={spacing["5"]} width="84%" />
        </div>

        <div {...stylex.props(styles.byline)}>
          <Skeleton variant="circle" size="lg" />
          <div {...stylex.props(styles.bylineWho)}>
            <Skeleton variant="rectangle" height={spacing["4"]} width="42%" />
            <Skeleton variant="rectangle" height={spacing["3.5"]} width="58%" />
          </div>
        </div>

        <div {...stylex.props(styles.hero)}>
          <Skeleton
            variant="rectangle"
            height="100%"
            width="100%"
            style={styles.heroSkeleton}
          />
        </div>

        <div {...stylex.props(styles.body)}>
          {BODY_LINES.map((width, index) => (
            <Skeleton
              key={index}
              variant="rectangle"
              height={spacing["5"]}
              width={width}
            />
          ))}
        </div>
      </article>
    </div>
  );
}
