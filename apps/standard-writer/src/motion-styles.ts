import {
  animationDuration,
  animationTimingFunction,
} from "@standard-reader/design-system/theme/animations.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import * as stylex from "@stylexjs/stylex";

/**
 * The two bits of ambient motion the product uses: the hero's publication cards
 * rising in, and the envelope (and the connect flow's celebration mark) gently
 * floating.
 *
 * Both are decorative, so they respect `prefers-reduced-motion` and simply
 * don't run when it is set — nothing they animate is needed to read the page.
 */

const rise = stylex.keyframes({
  from: { opacity: 0, transform: `translateY(${spacing["2"]})` },
  to: { opacity: 1, transform: "translateY(0)" },
});

const float = stylex.keyframes({
  "0%": { transform: "translateY(0)" },
  "50%": { transform: `translateY(calc(-1 * ${spacing["2"]}))` },
  "100%": { transform: "translateY(0)" },
});

export const motion = stylex.create({
  rise: {
    animationDuration: {
      default: animationDuration.extremelySlow,
      "@media (prefers-reduced-motion: reduce)": null,
    },
    animationFillMode: "both",
    animationName: {
      default: rise,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationTimingFunction: animationTimingFunction.easeOut,
  },
  /** Offsets each card in a stack so they arrive one after another. */
  stagger: (index: number) => ({
    animationDelay: `${index * 90}ms`,
  }),
  float: {
    // The `animationDuration` scale tops out at 500ms because it is sized for
    // interaction feedback. This is an idle drift with no event behind it — at
    // any scale step it would read as a twitch, so it is the rare literal.
    // eslint-disable-next-line @stylexjs/valid-styles
    animationDuration: {
      default: "4s",
      "@media (prefers-reduced-motion: reduce)": null,
    },
    animationIterationCount: "infinite",
    animationName: {
      default: float,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationTimingFunction: animationTimingFunction.easeInOut,
  },
});
