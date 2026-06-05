import * as stylex from "@stylexjs/stylex";

import type { Gap } from "../theme/semantic-spacing.stylex";
import type { StyleXComponentProps } from "../theme/types";

import { gap as gapSpace } from "../theme/semantic-spacing.stylex";

const styles = stylex.create({
  base: { display: "flex" },
  inline: { display: "inline-flex" },
  row: { flexDirection: "row" },
  "row-reverse": { flexDirection: "row-reverse" },
  column: { flexDirection: "column" },
  "column-reverse": { flexDirection: "column-reverse" },
  wrap: { flexWrap: "wrap" },
  "wrap-reverse": { flexWrap: "wrap-reverse" },
  "justify-start": { justifyContent: "flex-start" },
  "justify-end": { justifyContent: "flex-end" },
  "justify-center": { justifyContent: "center" },
  "justify-between": { justifyContent: "space-between" },
  "justify-around": { justifyContent: "space-around" },
  "justify-evenly": { justifyContent: "space-evenly" },
  "align-stretch": { alignItems: "stretch" },
  "align-start": { alignItems: "flex-start" },
  "align-end": { alignItems: "flex-end" },
  "align-center": { alignItems: "center" },
  "align-baseline": { alignItems: "baseline" },
  gap: (g: Gap) => ({ gap: gapSpace[g] }),
});

export interface FlexProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {
  /**
   * The direction of the flex container.
   * @default "row"
   * @type "row" | "row-reverse" | "column" | "column-reverse"
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/flex-direction
   */
  direction?: "row" | "row-reverse" | "column" | "column-reverse";
  /**
   * The flex wrap of the flex container.
   * @default false
   * @type "nowrap" | "wrap" | "wrap-reverse"
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/flex-wrap
   */
  wrap?: boolean | "reverse";
  /**
   * The flex justify content of the flex container.
   * @default "start"
   * @type "start" | "end" | "center" | "between" | "around" | "evenly"
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/justify-content
   */
  justify?: "start" | "end" | "center" | "between" | "around" | "evenly";
  /**
   * The flex align items of the flex container.
   * @default "stretch"
   * @type "stretch" | "flex-start" | "flex-end" | "center" | "baseline"
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/align-items
   */
  align?: "stretch" | "start" | "end" | "center" | "baseline";
  /**
   * The gap of the flex container (semantic spacing token).
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/gap
   */
  gap?: Gap;
  /**
   * Whether the flex container is inline.
   * @default false
   * @type boolean
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/display
   */
  inline?: boolean;
}

export const Flex = ({
  style,
  direction,
  wrap,
  justify,
  align,
  gap,
  inline,
  ...props
}: FlexProps) => {
  return (
    <div
      {...props}
      {...stylex.props(
        inline ? styles.inline : styles.base,
        direction === "row" && styles.row,
        direction === "row-reverse" && styles["row-reverse"],
        direction === "column" && styles.column,
        direction === "column-reverse" && styles["column-reverse"],

        wrap && styles.wrap,
        wrap === "reverse" && styles["wrap-reverse"],

        justify === "start" && styles["justify-start"],
        justify === "end" && styles["justify-end"],
        justify === "center" && styles["justify-center"],
        justify === "between" && styles["justify-between"],
        justify === "around" && styles["justify-around"],
        justify === "evenly" && styles["justify-evenly"],

        align === "stretch" && styles["align-stretch"],
        align === "start" && styles["align-start"],
        align === "end" && styles["align-end"],
        align === "center" && styles["align-center"],
        align === "baseline" && styles["align-baseline"],

        typeof gap === "string" && styles.gap(gap),

        style,
      )}
    />
  );
};
