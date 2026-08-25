import * as stylex from "@stylexjs/stylex";
import { use } from "react";

import { SizeContext } from "../context";
import {
  animationDuration,
  animationTimingFunction,
  animations,
} from "../theme/animations.stylex";
import { radius } from "../theme/radius.stylex";
import { shadow } from "../theme/shadow.stylex";
import type { Size } from "../theme/types";
import { ui } from "./semantic-color.stylex";

const styles = stylex.create({
  overlay: {
    animationDuration: animationDuration.default,
    animationName: animations.fadeIn,
    animationTimingFunction: animationTimingFunction.easeIn,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    opacity: {
      default: 1,
      ":is([data-exiting])": 0,
    },
    /**
     * Pinned to the viewport, not to the page.
     *
     * The stock hip-ui overlay is `position: absolute` sized to react-aria's
     * `--page-height` (the whole document), which only covers the window while
     * the overlay is portaled to `document.body`. An app that re-points that
     * portal — as `PublicationThemeScope` does, so overlays inherit a
     * publication's palette — hands it a containing block that starts partway
     * across the window, and the scrim then stops at that column's edge,
     * leaving the app's own chrome (sidebar) undimmed and clickable beside a
     * modal that is supposed to be modal.
     *
     * `fixed` + the visual viewport resolves against the window wherever the
     * overlay is mounted, and matches how the modal itself is already
     * positioned below.
     */
    position: "fixed",
    transitionDuration: {
      ":is([data-exiting])": animationDuration.fast,
    },
    transitionProperty: "opacity",
    transitionTimingFunction: {
      default: animationTimingFunction.easeOut,
      ":is([data-exiting])": animationTimingFunction.easeIn,
    },
    zIndex: 100,
    height: "var(--visual-viewport-height, 100%)",
    insetInlineStart: 0,
    top: 0,
    width: "100vw",
  },
  modal: {
    borderRadius: radius.xl,
    cornerShape: "squircle",
    outline: "none",
    overflow: "hidden",
    boxShadow: shadow["lg"],
    display: "flex",
    flexDirection: "column",
    position: "fixed",
    translate: "-50% -50%",
    insetInlineStart: "50%",
    maxHeight: "calc(var(--visual-viewport-height) * 0.8)",
    maxWidth: "90vw",
    top: "calc(var(--visual-viewport-height) / 2)",

    animationDuration: animationDuration.slow,
    animationName: {
      ":is([data-entering])": animations.zoomIn,
      ":is([data-exiting])": animations.zoomOut,
    },
    animationTimingFunction: animationTimingFunction.easeElasticInOut,
  },
  dialog: {
    outline: "none",
    flexGrow: 1,
    minHeight: 0,
  },
  dialogFitContent: {
    flexGrow: 0,
  },
  size: (size: Size) => ({
    width: size === "sm" ? 400 : size === "md" ? 600 : 800,
  }),
});

export function useDialogStyles({ size: sizeProp }: { size?: Size }) {
  const size = sizeProp || use(SizeContext);

  return {
    overlay: styles.overlay,
    modal: [styles.modal, ui.bg, ui.text, ui.border, styles.size(size)],
    dialog: styles.dialog,
    dialogFitContent: styles.dialogFitContent,
  };
}
