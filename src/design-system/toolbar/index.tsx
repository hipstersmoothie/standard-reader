"use client";

import type {
  SeparatorProps as AriaSeparatorProps,
  ToolbarProps as AriaToolbarProps,
  GroupProps,
} from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import {
  Separator as AriaSeparator,
  Toolbar as AriaToolbar,
  Group,
} from "react-aria-components";

import type { StyleXComponentProps } from "../theme/types";

import { uiColor } from "../theme/color.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";

const styles = stylex.create({
  toolbar: {
    gap: gap["xs"],
    display: "flex",
    flexWrap: "wrap",
  },
  horizontal: {
    flexDirection: "row",
  },
  vertical: {
    flexDirection: "column",
  },
  group: {
    display: "contents",
  },
  separator: {
    borderWidth: 0,
    backgroundColor: uiColor.border2,
    height: {
      ":is([data-orientation=vertical] *)": "1px",
    },
    marginBottom: {
      ":is([data-orientation=horizontal] *)": verticalSpace["xxs"],
      ":is([data-orientation=vertical] *)": verticalSpace["sm"],
    },
    marginLeft: {
      ":is([data-orientation=horizontal] *)": horizontalSpace["sm"],
      ":is([data-orientation=vertical] *)": horizontalSpace["xxs"],
    },
    marginRight: {
      ":is([data-orientation=horizontal] *)": horizontalSpace["sm"],
      ":is([data-orientation=vertical] *)": horizontalSpace["xxs"],
    },
    marginTop: {
      ":is([data-orientation=horizontal] *)": verticalSpace["xxs"],
      ":is([data-orientation=vertical] *)": verticalSpace["sm"],
    },
    width: {
      ":is([data-orientation=horizontal] *)": "1px",
    },
  },
});

export interface ToolbarProps extends StyleXComponentProps<AriaToolbarProps> {
  /**
   * The orientation of the toolbar.
   * @default "horizontal"
   */
  orientation?: "horizontal" | "vertical";
}

export function Toolbar({
  style,
  orientation = "horizontal",
  ...props
}: ToolbarProps) {
  return (
    <AriaToolbar
      {...props}
      orientation={orientation}
      {...stylex.props(
        styles.toolbar,
        orientation === "horizontal" && styles.horizontal,
        orientation === "vertical" && styles.vertical,
        style,
      )}
    />
  );
}

export interface ToolbarGroupProps extends StyleXComponentProps<GroupProps> {}

export function ToolbarGroup({ style, ...props }: ToolbarGroupProps) {
  return <Group {...props} {...stylex.props(styles.group, style)} />;
}

export interface ToolbarSeparatorProps extends StyleXComponentProps<
  Omit<AriaSeparatorProps, "orientation">
> {}

export function ToolbarSeparator({ style, ...props }: ToolbarSeparatorProps) {
  return (
    <AriaSeparator {...props} {...stylex.props(styles.separator, style)} />
  );
}
