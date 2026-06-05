import type { SwitchProps as AriaSwitchProps } from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { Switch as AriaSwitch } from "react-aria-components";

import type { StyleXComponentProps } from "../theme/types";

import { useHaptics } from "../haptics";
import { animationDuration } from "../theme/animations.stylex";
import { primaryColor, uiColor } from "../theme/color.stylex";
import { mediaQueries } from "../theme/media-queries.stylex";
import { radius } from "../theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  size as sizeSpace,
} from "../theme/semantic-spacing.stylex";
import { shadow } from "../theme/shadow.stylex";
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
      ":is([data-selected=true] *)": `translate(calc(100cqw - (${horizontalSpace["xs"]} * 2) - ${sizeSpace.md}), -50%)`,
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: {
      default: "transform",
      [mediaQueries.reducedMotion]: "none",
    },
    transitionTimingFunction: "ease-in-out",
    height: sizeSpace.md,
    marginLeft: horizontalSpace["xs"],
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
