"use client";

import * as stylex from "@stylexjs/stylex";
import type {
  PanelGroupProps,
  PanelProps,
  PanelResizerProps,
} from "@window-splitter/react";
import {
  Panel as BasePanel,
  PanelGroup as BasePanelGroup,
  PanelResizer as BasePanelResizer,
} from "@window-splitter/react";
import { useFocusRing, useHover } from "react-aria";

import { focusColor, primaryColor, uiColor } from "../theme/color.stylex";
import { size as sizeSpace } from "../theme/semantic-spacing.stylex";
import type { StyleXComponentProps } from "../theme/types";

const styles = stylex.create({
  panel: {
    overflow: "auto",
  },
  panelResizer: {
    backgroundColor: {
      default: uiColor.border2,
      ":is([data-hovered]):not(:is([data-state='dragging']))": uiColor.border3,
      ":is([data-state='dragging'])": primaryColor.border2,
    },
    cursor: {
      default: "col-resize",
      ":is([data-panel-group-direction=vertical])": "row-resize",
    },
    position: "relative",
    outline: {
      default: "none",
      ":is([data-focus-visible])": `2px solid ${focusColor.ring}`,
    },
    outlineOffset: "2px",
  },
  hitArea: {
    display: {
      default: "none",
      ":is([data-hovered] [data-splitter-type='handle'] > *)": "block",
    },
    position: "absolute",

    transform: {
      ":is([data-handle-orientation='horizontal'] *)": "translateX(-50%)",
      ":is([data-handle-orientation='vertical'] *)": "translateY(-50%)",
    },
    bottom: { ":is([data-handle-orientation='horizontal'] *)": 0 },
    insetInlineStart: { ":is([data-handle-orientation='vertical'] *)": 0 },
    insetInlineEnd: { ":is([data-handle-orientation='vertical'] *)": 0 },
    top: { ":is([data-handle-orientation='horizontal'] *)": 0 },

    height: {
      ":is([data-handle-orientation='horizontal'] *)": "100%",
      ":is([data-handle-orientation='vertical'] *)": sizeSpace["sm"],
    },
    width: {
      ":is([data-handle-orientation='horizontal'] *)": sizeSpace["sm"],
      ":is([data-handle-orientation='vertical'] *)": "100%",
    },
  },
});

export interface WindowSplitterPanelGroupProps extends StyleXComponentProps<PanelGroupProps> {}

export interface WindowSplitterPanelProps extends StyleXComponentProps<PanelProps> {}

export interface WindowSplitterPanelResizerProps extends StyleXComponentProps<PanelResizerProps> {}

export function PanelGroup({ style, ...props }: WindowSplitterPanelGroupProps) {
  return <BasePanelGroup {...props} {...stylex.props(style)} />;
}

export function Panel({ style, ...props }: WindowSplitterPanelProps) {
  return <BasePanel {...props} {...stylex.props(styles.panel, style)} />;
}

export function PanelResizer({
  style,
  ...props
}: WindowSplitterPanelResizerProps) {
  const { hoverProps, isHovered } = useHover({});
  const { isFocusVisible, focusProps } = useFocusRing();

  return (
    <BasePanelResizer
      {...props}
      {...(hoverProps as PanelResizerProps)}
      {...(focusProps as PanelResizerProps)}
      data-hovered={isHovered || undefined}
      data-focus-visible={isFocusVisible || undefined}
      {...stylex.props(styles.panelResizer, style)}
      size="1px"
    >
      <div {...stylex.props(styles.hitArea)} />
    </BasePanelResizer>
  );
}
