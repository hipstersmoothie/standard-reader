"use client";

import * as stylex from "@stylexjs/stylex";
import { use, useMemo } from "react";
import type { ToggleButtonGroupProps as AriaToggleButtonGroupProps } from "react-aria-components";
import { ToggleButtonGroup as AriaToggleButtonGroup } from "react-aria-components";

import { ButtonGroupContext } from "../button/context";
import { useHaptics } from "../haptics";
import { size as sizeSpace } from "../theme/semantic-spacing.stylex";
import type { StyleXComponentProps } from "../theme/types";

const styles = stylex.create({
  group: {
    alignItems: "center",
    display: "flex",
  },
  horizontal: {
    flexDirection: "row",
  },
  vertical: {
    flexDirection: "column",
  },
  contents: {
    display: "contents",
  },
  horizontalGroupedContents: {
    borderEndStartRadius: { ":is(:not(:first-child))  *": "0" },
    borderEndEndRadius: { ":is(:not(:last-child))  *": "0" },
    borderInlineStartWidth: { ":is(:not(:first-child))  *": "0" },
    borderInlineEndWidth: { ":is(:not(:last-child))  *": "0" },
    borderStartStartRadius: { ":is(:not(:first-child))  *": "0" },
    borderStartEndRadius: { ":is(:not(:last-child))  *": "0" },
  },
  verticalGroupedContents: {
    // eslint-disable-next-line @stylexjs/valid-styles
    borderBottomLeftWidth: { ":is(:not(:first-child))  *": "0" },
    borderEndEndRadius: { ":is(:not(:last-child))  *": "0" },
    borderBottomWidth: { ":is(:not(:last-child))  *": "0" },
    borderStartStartRadius: { ":is(:not(:first-child))  *": "0" },
    borderStartEndRadius: { ":is(:not(:first-child))  *": "0" },
    borderTopWidth: { ":is(:not(:first-child))  *": "0" },
  },
  separate: (itemsPerRow?: number) => ({
    "--items-per-row": itemsPerRow,
    "--toggle-button-group-gap": sizeSpace["sm"],
    gap: "var(--toggle-button-group-gap)",
    flexWrap: "wrap",
  }),
});

interface ToggleButtonGroupBaseProps extends StyleXComponentProps<
  Omit<AriaToggleButtonGroupProps, "children">
> {
  orientation?: "horizontal" | "vertical";
  children?: React.ReactNode;
}

interface ToggleButtonGroupSeparateProps extends ToggleButtonGroupBaseProps {
  itemsPerRow: number;
  variant: "separate";
}

interface ToggleButtonGroupGroupedProps extends ToggleButtonGroupBaseProps {
  variant?: "grouped";
  itemsPerRow?: never;
}

type ToggleButtonGroupProps =
  | ToggleButtonGroupSeparateProps
  | ToggleButtonGroupGroupedProps;

export const ToggleButtonGroup = ({
  children,
  style,
  orientation: orientationProp = "horizontal",
  variant = "grouped",
  itemsPerRow,
  onSelectionChange,
  ...props
}: ToggleButtonGroupProps) => {
  const { trigger } = useHaptics();
  const groupOrientation = use(ButtonGroupContext);
  const isInGroup = groupOrientation?.orientation !== undefined;
  const orientation = groupOrientation?.orientation || orientationProp;

  const handleSelectionChange = (
    keys: Parameters<NonNullable<typeof onSelectionChange>>[0],
  ) => {
    trigger("selection");
    onSelectionChange?.(keys);
  };

  let stylesToApply = [];

  if (isInGroup && variant === "grouped") {
    stylesToApply = [
      styles.contents,
      orientation === "horizontal" && styles.horizontalGroupedContents,
      orientation === "vertical" && styles.verticalGroupedContents,
    ];
  } else if (isInGroup && variant === "separate") {
    stylesToApply = [styles.contents];
  } else {
    stylesToApply = [
      styles.group,
      orientation === "horizontal" && styles.horizontal,
      orientation === "vertical" && styles.vertical,
      variant === "separate" && styles.separate(itemsPerRow),
    ];
  }

  const contextValue = useMemo(
    () => ({ orientation, variant }),
    [orientation, variant],
  );

  return (
    <ButtonGroupContext value={contextValue}>
      <AriaToggleButtonGroup
        {...props}
        onSelectionChange={handleSelectionChange}
        {...stylex.props(stylesToApply, style)}
      >
        {children}
      </AriaToggleButtonGroup>
    </ButtonGroupContext>
  );
};
