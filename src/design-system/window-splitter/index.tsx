"use client";

import type {
  PanelGroupProps,
  PanelProps,
  PanelResizerProps,
} from "@window-splitter/react";

import * as stylex from "@stylexjs/stylex";
import {
  Panel as BasePanel,
  PanelGroup as BasePanelGroup,
  PanelResizer as BasePanelResizer,
} from "@window-splitter/react";
import { useHover } from "react-aria";

import type { StyleXComponentProps } from "../theme/types";

import { primaryColor, uiColor } from "../theme/color.stylex";
import { size as sizeSpace } from "../theme/semantic-spacing.stylex";

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
    left: { ":is([data-handle-orientation='vertical'] *)": 0 },
    right: { ":is([data-handle-orientation='vertical'] *)": 0 },
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

  return (
    <BasePanelResizer
      {...props}
      {...(hoverProps as PanelResizerProps)}
      data-hovered={isHovered || undefined}
      {...stylex.props(styles.panelResizer, style)}
      size="1px"
    >
      <div {...stylex.props(styles.hitArea)} />
    </BasePanelResizer>
  );
}
