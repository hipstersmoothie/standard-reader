import * as stylex from "@stylexjs/stylex";
import { ChevronDown } from "lucide-react";
import { use } from "react";
import type {
  ButtonProps as AriaButtonProps,
  DisclosurePanelProps as AriaDisclosurePanelProps,
  DisclosureProps as AriaDisclosureProps,
} from "react-aria-components";
import {
  Disclosure as AriaDisclosure,
  DisclosurePanel as AriaDisclosurePanel,
  Button,
} from "react-aria-components";

import { SizeContext } from "../context";
import { animationDuration } from "../theme/animations.stylex";
import { focusColor, uiColor } from "../theme/color.stylex";
import { mediaQueries } from "../theme/media-queries.stylex";
import { radius } from "../theme/radius.stylex";
import { gap, size as sizeSpace } from "../theme/semantic-spacing.stylex";
import type { Size, StyleXComponentProps } from "../theme/types";
import { fontFamily, fontSize, fontWeight } from "../theme/typography.stylex";

const styles = stylex.create({
  disclosure: {
    display: "flex",
    flexDirection: "column",
  },
  title: {
    borderRadius: radius.lg,
    borderWidth: 0,
    paddingBottom: {
      ":is([data-size=lg] *)": sizeSpace["md"],
      ":is([data-size=md] *)": sizeSpace["xxs"],
      ":is([data-size=sm] *)": sizeSpace["sm"],
    },
    paddingInlineStart: {
      ":is([data-size=lg] *)": sizeSpace["md"],
      ":is([data-size=md] *)": sizeSpace["xxs"],
      ":is([data-size=sm] *)": sizeSpace["sm"],
    },
    paddingInlineEnd: {
      ":is([data-size=lg] *)": sizeSpace["md"],
      ":is([data-size=md] *)": sizeSpace["xxs"],
      ":is([data-size=sm] *)": sizeSpace["sm"],
    },
    paddingTop: {
      ":is([data-size=lg] *)": sizeSpace["md"],
      ":is([data-size=md] *)": sizeSpace["xxs"],
      ":is([data-size=sm] *)": sizeSpace["sm"],
    },

    cornerShape: "squircle",
    gap: gap["md"],
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":is([data-hovered=true])": uiColor.component2,
      ":is([data-pressed=true])": uiColor.component3,
    },
    color: uiColor.text1,
    display: "flex",
    fontFamily: fontFamily["sans"],
    fontSize: {
      ":is([data-size=lg] *)": fontSize["lg"],
      ":is([data-size=md] *)": fontSize["base"],
      ":is([data-size=sm] *)": fontSize["sm"],
    },
    fontWeight: fontWeight["medium"],
    justifyContent: "space-between",
    textAlign: "start",
    transitionDuration: animationDuration.fast,
    transitionProperty: {
      default: "background-color",
      [mediaQueries.reducedMotion]: "none",
    },
    transitionTimingFunction: "ease-in-out",
    width: "100%",
    outline: {
      default: "none",
      ":is([data-focus-visible])": `2px solid ${focusColor.ring}`,
    },
    outlineOffset: "-2px",
  },
  titleDisabled: {
    opacity: 0.5,
    pointerEvents: "none",
  },
  chevron: {
    transition: {
      default: "rotate 200ms ease-in-out",
      [mediaQueries.reducedMotion]: "none",
    },
    color: uiColor.text2,
    flexShrink: 0,
    rotate: {
      default: "0deg",
      ":is([aria-expanded=true] *)": "180deg",
    },
  },
  panel: {
    overflow: "clip",
    fontSize: {
      ":is([data-size=lg] *)": fontSize["lg"],
      ":is([data-size=md] *)": fontSize["base"],
      ":is([data-size=sm] *)": fontSize["sm"],
    },
    transitionDuration: {
      default: animationDuration.default,
      [mediaQueries.reducedMotion]: null,
    },
    transitionProperty: "height",
    transitionTimingFunction: "ease-in-out",
    height: "var(--disclosure-panel-height)",
  },
  panelContent: {
    paddingBottom: {
      ":is([data-size=lg] *)": sizeSpace["md"],
      ":is([data-size=md] *)": sizeSpace["xxs"],
      ":is([data-size=sm] *)": sizeSpace["sm"],
    },
    paddingInlineStart: {
      ":is([data-size=lg] *)": sizeSpace["md"],
      ":is([data-size=md] *)": sizeSpace["xxs"],
      ":is([data-size=sm] *)": sizeSpace["sm"],
    },
    paddingInlineEnd: {
      ":is([data-size=lg] *)": sizeSpace["md"],
      ":is([data-size=md] *)": sizeSpace["xxs"],
      ":is([data-size=sm] *)": sizeSpace["sm"],
    },
    paddingTop: {
      ":is([data-size=lg] *)": sizeSpace["md"],
      ":is([data-size=md] *)": sizeSpace["xxs"],
      ":is([data-size=sm] *)": sizeSpace["sm"],
    },
  },
});

export interface DisclosureProps extends StyleXComponentProps<
  Omit<AriaDisclosureProps, "children">
> {
  children: React.ReactNode;
  size?: Size;
}

export function Disclosure({
  children,
  style,
  size: sizeProp,
  ...props
}: DisclosureProps) {
  const size = sizeProp || use(SizeContext);

  return (
    <AriaDisclosure
      {...props}
      data-size={size}
      {...stylex.props(styles.disclosure, style)}
    >
      {children}
    </AriaDisclosure>
  );
}

export interface DisclosureTitleProps extends StyleXComponentProps<
  Omit<AriaButtonProps, "slot" | "children">
> {
  children: React.ReactNode;
  /** Style overrides for the chevron icon (e.g. a contextual color). */
  chevronStyle?: stylex.StyleXStyles;
}

export function DisclosureTitle({
  children,
  style,
  chevronStyle,
  ...props
}: DisclosureTitleProps) {
  return (
    <Button
      {...props}
      slot="trigger"
      {...stylex.props(
        styles.title,
        props.isDisabled && styles.titleDisabled,
        style,
      )}
    >
      {children}
      <ChevronDown size={16} {...stylex.props(styles.chevron, chevronStyle)} />
    </Button>
  );
}

export interface DisclosurePanelProps extends StyleXComponentProps<
  Omit<AriaDisclosurePanelProps, "children">
> {
  children: React.ReactNode;
  isQuiet?: boolean;
  /** Style overrides for the inner content wrapper (e.g. to remove padding). */
  contentStyle?: stylex.StyleXStyles;
}

export function DisclosurePanel({
  children,
  style,
  contentStyle,
  ...props
}: DisclosurePanelProps) {
  return (
    <AriaDisclosurePanel {...props} {...stylex.props(styles.panel, style)}>
      <div {...stylex.props(styles.panelContent, contentStyle)}>{children}</div>
    </AriaDisclosurePanel>
  );
}
