import * as stylex from "@stylexjs/stylex";

import {
  animationDuration,
  animationTimingFunction,
} from "./animations.stylex";
import { radius } from "./radius.stylex";
import { ui } from "./semantic-color.stylex";
import { size as sizeSpace } from "./semantic-spacing.stylex";
import { shadow } from "./shadow.stylex";

const styles = stylex.create({
  popover: {
    borderRadius: radius.lg,
    cornerShape: "squircle",
    outline: "none",
    overflow: "auto",
    boxShadow: shadow["md"],
  },
  animation: {
    "--origin-x": {
      ":is([data-placement=left],[data-placement=left] > *)": sizeSpace["md"],
      ":is([data-placement=right],[data-placement=right] > *)": `calc(${sizeSpace["md"]} * -1)`,
    },
    "--origin-y": {
      ":is([data-placement=bottom],[data-placement=bottom] > *)": `calc(${sizeSpace["md"]} * -1)`,
      ":is([data-placement=top],[data-placement=top] > *)": sizeSpace["md"],
    },
    opacity: {
      default: 1,
      ":is([data-entering], [data-entering] > *)": 0,
      ":is([data-exiting], [data-exiting] > *)": 0,
    },
    pointerEvents: {
      ":is([data-exiting], [data-exiting] > *)": "none",
    },
    transform: {
      ":is([data-entering], [data-entering] > *)": `scale(0.95) translate(var(--origin-x, 0), var(--origin-y, 0))`,
      ":is([data-exiting], [data-exiting] > *)":
        "scale(0.95) translate(var(--origin-x, 0), var(--origin-y, 0))",
    },
    transitionDuration: animationDuration.default,
    transitionProperty: "transform, opacity",
    transitionTimingFunction: {
      default: animationTimingFunction.easeOut,
      ":is([data-exiting], [data-exiting] > *)": animationTimingFunction.easeIn,
    },
    willChange: "transform, opacity",
  },
});

export function usePopoverStyles() {
  return {
    wrapper: [styles.popover, ui.bgSubtle, ui.text, ui.border],
    animation: styles.animation,
  };
}
