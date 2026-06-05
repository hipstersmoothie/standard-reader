"use client";

import type { GroupProps } from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { useMemo } from "react";
import { Group } from "react-aria-components";

import type { ButtonGroupVariant, StyleXComponentProps } from "../theme/types";

import { ButtonGroupContext } from "../button/context";

const styles = stylex.create({
  group: {
    display: "flex",
  },
  horizontal: {
    alignItems: "center",
    flexDirection: "row",
  },
  vertical: {
    flexDirection: "column",
  },
});

export interface ButtonGroupProps extends StyleXComponentProps<GroupProps> {
  orientation?: "horizontal" | "vertical";
  variant?: ButtonGroupVariant;
}

export const ButtonGroup = ({
  children,
  style,
  orientation = "horizontal",
  variant = "grouped",
  ...props
}: ButtonGroupProps) => {
  const contextValue = useMemo(
    () => ({ orientation, variant }),
    [orientation, variant],
  );

  return (
    <ButtonGroupContext value={contextValue}>
      <Group
        {...stylex.props(
          styles.group,
          orientation === "horizontal" && styles.horizontal,
          orientation === "vertical" && styles.vertical,
          style,
        )}
        {...props}
      >
        {children}
      </Group>
    </ButtonGroupContext>
  );
};
