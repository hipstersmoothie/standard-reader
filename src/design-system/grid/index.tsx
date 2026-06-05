import * as stylex from "@stylexjs/stylex";

import type { Gap } from "../theme/semantic-spacing.stylex";
import type { StyleXComponentProps } from "../theme/types";

import { gap as gapVars } from "../theme/semantic-spacing.stylex";

const styles = stylex.create({
  base: { display: "grid" },

  rows: (template: string) => ({ gridTemplateRows: template }),
  columns: (template: string) => ({ gridTemplateColumns: template }),

  "justify-content-start": { justifyContent: "flex-start" },
  "justify-content-end": { justifyContent: "flex-end" },
  "justify-content-center": { justifyContent: "center" },
  "justify-content-between": { justifyContent: "space-between" },
  "justify-content-around": { justifyContent: "space-around" },
  "justify-content-evenly": { justifyContent: "space-evenly" },

  "align-items-stretch": { alignItems: "stretch" },
  "align-items-start": { alignItems: "flex-start" },
  "align-items-end": { alignItems: "flex-end" },
  "align-items-center": { alignItems: "center" },
  "align-items-baseline": { alignItems: "baseline" },

  "align-content-start": { alignContent: "start" },
  "align-content-end": { alignContent: "end" },
  "align-content-center": { alignContent: "center" },
  "align-content-between": { alignContent: "space-between" },
  "align-content-around": { alignContent: "space-around" },
  "align-content-evenly": { alignContent: "space-evenly" },

  "justify-items-start": { justifyItems: "start" },
  "justify-items-end": { justifyItems: "end" },
  "justify-items-center": { justifyItems: "center" },

  rowGap: (g: Gap) => ({ rowGap: gapVars[g] }),
  columnGap: (g: Gap) => ({ columnGap: gapVars[g] }),

  columnStart: (start: number) => ({ gridColumnStart: start }),
  columnEnd: (end: number) => ({ gridColumnEnd: end }),
  rowStart: (start: number) => ({ gridRowStart: start }),
  rowEnd: (end: number) => ({ gridRowEnd: end }),
});

export interface GridProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {
  /**
   * The grid template rows of the grid container.
   * @default "auto"
   * @type string
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/grid-template-rows
   */
  rows?: string;
  /**
   * The grid template columns of the grid container.
   * @default "auto"
   * @type string
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/grid-template-columns
   */
  columns?: string;
  /**
   * The flex justify content of the flex container.
   * @default "start"
   * @type "start" | "end" | "center" | "between" | "around" | "evenly"
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/justify-content
   */
  justifyContent?: "start" | "end" | "center" | "between" | "around" | "evenly";
  /**
   * The flex align items of the flex container.
   * @default "stretch"
   * @type "stretch" | "flex-start" | "flex-end" | "center" | "baseline"
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/align-items
   */
  alignItems?: "stretch" | "start" | "end" | "center" | "baseline";
  /**
   * The grid justify items of the grid container.
   * @default "stretch"
   * @type "start" | "end" | "center" | "between" | "around" | "evenly"
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/justify-items
   */
  justifyItems?: "start" | "end" | "center";
  /**
   * The grid align content of the grid container.
   * @default "stretch"
   * @type "start" | "end" | "center" | "between" | "around" | "evenly"
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/align-content
   */
  alignContent?: "start" | "end" | "center" | "between" | "around" | "evenly";
  /**
   * Column gap (semantic spacing token).
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/column-gap
   */
  columnGap?: Gap;
  /**
   * Row gap (semantic spacing token).
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/row-gap
   */
  rowGap?: Gap;
}

export const Grid = ({
  style,
  justifyContent,
  alignContent,
  justifyItems,
  alignItems,
  columnGap,
  rowGap,
  rows,
  columns,
  ...props
}: GridProps) => {
  return (
    <div
      {...props}
      {...stylex.props(
        styles.base,
        typeof rows === "string" && styles.rows(rows),
        typeof columns === "string" && styles.columns(columns),

        justifyContent === "start" && styles["justify-content-start"],
        justifyContent === "end" && styles["justify-content-end"],
        justifyContent === "center" && styles["justify-content-center"],
        justifyContent === "between" && styles["justify-content-between"],
        justifyContent === "around" && styles["justify-content-around"],
        justifyContent === "evenly" && styles["justify-content-evenly"],

        alignItems === "stretch" && styles["align-items-stretch"],
        alignItems === "start" && styles["align-items-start"],
        alignItems === "end" && styles["align-items-end"],
        alignItems === "center" && styles["align-items-center"],
        alignItems === "baseline" && styles["align-items-baseline"],

        alignContent === "start" && styles["align-content-start"],
        alignContent === "end" && styles["align-content-end"],
        alignContent === "center" && styles["align-content-center"],
        alignContent === "between" && styles["align-content-between"],
        alignContent === "around" && styles["align-content-around"],
        alignContent === "evenly" && styles["align-content-evenly"],

        justifyItems === "start" && styles["justify-items-start"],
        justifyItems === "end" && styles["justify-items-end"],
        justifyItems === "center" && styles["justify-items-center"],

        typeof columnGap === "string" && styles.columnGap(columnGap),
        typeof rowGap === "string" && styles.rowGap(rowGap),

        style,
      )}
    />
  );
};

interface GridItemProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {
  columnStart?: number;
  columnEnd?: number;
  rowStart?: number;
  rowEnd?: number;
}

export const GridItem = ({
  style,
  columnStart,
  columnEnd,
  rowStart,
  rowEnd,
  ...props
}: GridItemProps) => {
  return (
    <div
      {...props}
      {...stylex.props(
        columnStart != null && styles.columnStart(columnStart),
        columnEnd != null && styles.columnEnd(columnEnd),
        rowStart != null && styles.rowStart(rowStart),
        rowEnd != null && styles.rowEnd(rowEnd),
        style,
      )}
    />
  );
};
