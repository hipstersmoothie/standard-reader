"use client";

import type { ButtonProps as AriaButtonProps } from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { Button as AriaButton, Link } from "react-aria-components";

import type { ButtonVariant, Size, StyleXComponentProps } from "../theme/types";

import { useHaptics } from "../haptics";
import { ProgressCircle } from "../progress-circle";
import { animationDuration } from "../theme/animations.stylex";
import { gap } from "../theme/semantic-spacing.stylex";
import { useButtonStyles } from "../theme/useButtonStyles";

const styles = stylex.create({
  content: {
    // eslint-disable-next-line @stylexjs/valid-styles
    textBoxEdge: "cap alphabetic",
    // eslint-disable-next-line @stylexjs/valid-styles
    textBoxTrim: "trim-both",
    gap: gap["md"],
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
    transitionDuration: animationDuration.fast,
    transitionProperty: "opacity",
    transitionTimingFunction: "ease-in-out",
  },
  contentPending: {
    opacity: 0,
  },
  spinner: {
    position: "absolute",
  },
  link: {
    cursor: "pointer",
    textDecoration: "none",
  },
});

export interface ButtonProps extends StyleXComponentProps<
  Omit<AriaButtonProps, "children">
> {
  variant?: ButtonVariant;
  size?: Size | "xl";
  isPending?: boolean;
  children?: React.ReactNode;
}

export const Button = ({
  children,
  style,
  variant = "primary",
  size,
  isPending = false,
  isDisabled,
  onPress,
  ...props
}: ButtonProps) => {
  const { trigger } = useHaptics();
  const buttonStyles = useButtonStyles({ variant, size });
  const isHref = "href" in props;
  const Component = isHref ? Link : AriaButton;

  const handlePress = (e: Parameters<NonNullable<typeof onPress>>[0]) => {
    if (variant === "primary" && !isDisabled && !isPending) {
      trigger("impactLight");
    }
    onPress?.(e);
  };

  return (
    <Component
      // oxlint-disable-next-line typescript/no-explicit-any
      {...(props as any)}
      onPress={handlePress}
      {...stylex.props(buttonStyles, isHref && styles.link, style)}
      data-size={size}
      data-pending={isPending || undefined}
      isDisabled={isDisabled || isPending}
    >
      {isPending && (
        <ProgressCircle
          isIndeterminate
          size="sm"
          style={styles.spinner}
          aria-label="Loading"
        />
      )}
      <span
        {...stylex.props(styles.content, isPending && styles.contentPending)}
      >
        {children}
      </span>
    </Component>
  );
};
