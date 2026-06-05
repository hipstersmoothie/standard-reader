import type { ToggleButtonProps as AriaToggleButtonProps } from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { Children, use } from "react";
import { ToggleButton as AriaToggleButton } from "react-aria-components";

import type { ButtonVariant, Size, StyleXComponentProps } from "../theme/types";

import { SizeContext } from "../context";
import { primaryColor, uiColor } from "../theme/color.stylex";
import {
  horizontalSpace,
  size as sizeSpace,
} from "../theme/semantic-spacing.stylex";
import { useButtonStyles } from "../theme/useButtonStyles";

const styles = stylex.create({
  primarySelected: {
    backgroundColor: {
      default: primaryColor.solid1,
      ":is([data-hovered])": primaryColor.solid2,
      ":is([data-pressed])": primaryColor.text1,
    },
    color: "light-dark(white, black)",
  },
  secondarySelected: {
    borderColor: {
      default: uiColor.border1,
      ":is([data-hovered])": uiColor.border2,
      ":is([data-pressed])": uiColor.border3,
    },
    backgroundColor: {
      default: uiColor.border1,
      ":is([data-hovered])": uiColor.border2,
      ":is([data-pressed])": uiColor.border3,
    },
  },
  tertiarySelected: {
    borderColor: {
      default: uiColor.border1,
      ":is([data-hovered])": uiColor.border2,
      ":is([data-pressed])": uiColor.border3,
    },
    backgroundColor: {
      default: uiColor.border1,
      ":is([data-hovered])": uiColor.border2,
      ":is([data-pressed])": uiColor.border3,
    },
  },
  outlineSelected: {
    borderColor: {
      default: uiColor.border1,
      ":is([data-hovered])": uiColor.border2,
      ":is([data-pressed])": uiColor.border3,
    },
    backgroundColor: {
      default: uiColor.border1,
      ":is([data-hovered])": uiColor.border2,
      ":is([data-pressed])": uiColor.border3,
    },
  },
  sm: {
    paddingLeft: {
      ":has(> * + *, > *:not(svg):only-child)": horizontalSpace["md"],
    },
    paddingRight: {
      ":has(> * + *, > *:not(svg):only-child)": horizontalSpace["md"],
    },
    width: {
      ":has(svg:only-child)": sizeSpace["2xl"],
    },
  },
  md: {
    paddingLeft: {
      ":has(> * + *, > *:not(svg):only-child)": horizontalSpace["xl"],
    },
    paddingRight: {
      ":has(> * + *, > *:not(svg):only-child)": horizontalSpace["xl"],
    },
    width: {
      ":has(svg:only-child)": sizeSpace["3xl"],
    },
  },
  lg: {
    paddingLeft: {
      ":has(> * + *, > *:not(svg):only-child)": horizontalSpace["3xl"],
    },
    paddingRight: {
      ":has(> * + *, > *:not(svg):only-child)": horizontalSpace["3xl"],
    },
    width: {
      ":has(svg:only-child)": sizeSpace["4xl"],
    },
  },
});

export interface ToggleButtonProps extends StyleXComponentProps<
  Omit<AriaToggleButtonProps, "children">
> {
  variant?: Exclude<ButtonVariant, "critical" | "critical-outline">;
  size?: Size;
  children?: React.ReactNode;
}

export function ToggleButton({
  style,
  variant = "primary",
  size: sizeProp,
  children,
  ...props
}: ToggleButtonProps) {
  const size = sizeProp || use(SizeContext);
  const buttonStyles = useButtonStyles({ variant, size });
  const toggleButtonStyles = (isSelected?: boolean) =>
    stylex.props(
      buttonStyles,
      size === "sm" && styles.sm,
      size === "md" && styles.md,
      size === "lg" && styles.lg,
      isSelected
        ? [
            variant === "primary" && styles.primarySelected,
            variant === "secondary" && styles.secondarySelected,
            variant === "tertiary" && styles.tertiarySelected,
            variant === "outline" && styles.outlineSelected,
          ]
        : undefined,
      style,
    );

  return (
    <AriaToggleButton
      {...props}
      {...toggleButtonStyles()}
      className={({ isSelected }) =>
        toggleButtonStyles(isSelected).className || ""
      }
    >
      {Children.map(children, (child, index) =>
        typeof child === "string" ? (
          <span key={`${child}-${index.toString()}`}>{child}</span>
        ) : (
          child
        ),
      )}
    </AriaToggleButton>
  );
}
