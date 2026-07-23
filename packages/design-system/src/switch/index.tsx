import * as stylex from "@stylexjs/stylex";
import type { SwitchProps as AriaSwitchProps } from "react-aria-components";
import { Switch as AriaSwitch } from "react-aria-components";

import { useHaptics } from "../haptics";
import { animationDuration } from "../theme/animations.stylex";
import { focusColor, primaryColor, uiColor } from "../theme/color.stylex";
import { mediaQueries } from "../theme/media-queries.stylex";
import { radius } from "../theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  size as sizeSpace,
} from "../theme/semantic-spacing.stylex";
import { shadow } from "../theme/shadow.stylex";
import type { StyleXComponentProps } from "../theme/types";
import { typeramp } from "../theme/typography.stylex";

const styles = stylex.create({
  labelLeft: {
    flexGrow: 1,
    minWidth: 0,
  },
  wrapper: {
    gap: gap["xl"],
    alignItems: "center",
    display: "flex",
    // Contain react-aria's visually-hidden <input>. It's rendered absolutely
    // positioned, so without a positioned wrapper it resolves against the
    // nearest positioned ancestor (here `main`, a scroll container). Focusing
    // the switch then makes the browser scroll that distant ancestor to bring
    // the input into view, jumping the whole page and collapsing the layout on
    // Chrome/Edge. `position: relative` scopes the input to the switch itself.
    // See react-aria adobe/react-spectrum#8081 / #8091 (radio/checkbox got the
    // same treatment; Switch did not).
    position: "relative",
  },
  indicator: {
    borderRadius: radius.full,
    backgroundColor: {
      default: uiColor.component3,
      ":is([data-selected=true] *)": primaryColor.solid1,
    },
    boxShadow: "inset 0 0 6px 1px rgba(0, 0, 0, 0.13)",
    containerType: "inline-size",
    flexShrink: 0,
    opacity: {
      default: 1,
      ":is([data-disabled=true] *)": 0.5,
    },
    outline: {
      default: "none",
      ":is([data-focus-visible] *)": `2px solid ${focusColor.ring}`,
    },
    outlineOffset: "2px",
    position: "relative",
    transitionDuration: animationDuration.fast,
    transitionProperty: {
      default: "background-color",
      [mediaQueries.reducedMotion]: "none",
    },
    transitionTimingFunction: "ease-in-out",
    height: sizeSpace["xl"],
    width: sizeSpace["4xl"],
  },
  thumb: {
    borderRadius: radius.full,
    backgroundColor: uiColor.bgSubtle,
    boxShadow: shadow.lg,
    content: "''",
    position: "absolute",
    transform: {
      default: "translateY(-50%)",
      // `marginInlineStart` puts the thumb at the track's start edge, which is
      // the RIGHT edge under RTL — so the "on" travel has to run in the
      // opposite physical direction. translateX is always physical, hence the
      // --dir multiplier (see src/styles.css).
      ":is([data-selected=true] *)": `translate(calc(var(--dir) * (100cqw - (${horizontalSpace["xs"]} * 2) - ${sizeSpace.md})), -50%)`,
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: {
      default: "transform",
      [mediaQueries.reducedMotion]: "none",
    },
    transitionTimingFunction: "ease-in-out",
    height: sizeSpace.md,
    marginInlineStart: horizontalSpace["xs"],
    top: "50%",
    width: sizeSpace.md,
  },
});

interface SwitchBaseProps extends StyleXComponentProps<
  Omit<AriaSwitchProps, "children">
> {
  labelVariant?: "left" | "right";
}

interface SwitchWithChildrenProps extends SwitchBaseProps {
  children: React.ReactNode;
}

interface SwitchWithAriaLabelProps extends SwitchBaseProps {
  "aria-label": string;
  children?: never;
}

interface SwitchWithAriaLabelledbyProps extends SwitchBaseProps {
  "aria-labelledby": string;
  children?: never;
}

export type SwitchProps =
  | SwitchWithChildrenProps
  | SwitchWithAriaLabelProps
  | SwitchWithAriaLabelledbyProps;

export function Switch({
  children,
  style,
  onChange,
  labelVariant = "right",
  ...props
}: SwitchProps) {
  const { trigger } = useHaptics();

  const handleChange = (isSelected: boolean) => {
    trigger("selection");
    onChange?.(isSelected);
  };

  return (
    <AriaSwitch
      {...props}
      onChange={handleChange}
      {...stylex.props(styles.wrapper, style)}
    >
      {children != null && labelVariant === "left" && (
        <div {...stylex.props(typeramp.label, styles.labelLeft)}>
          {children}
        </div>
      )}
      <div {...stylex.props(styles.indicator)}>
        <div {...stylex.props(styles.thumb)} />
      </div>
      {children != null && labelVariant === "right" && (
        <div {...stylex.props(typeramp.label)}>{children}</div>
      )}
    </AriaSwitch>
  );
}
