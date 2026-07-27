"use client";

import * as stylex from "@stylexjs/stylex";
import { use } from "react";
import type {
  TabListProps as AriaTabListProps,
  TabPanelProps as AriaTabPanelProps,
  TabProps as AriaTabProps,
  TabsProps as AriaTabsProps,
} from "react-aria-components";
import {
  Tab as AriaTab,
  TabList as AriaTabList,
  TabPanel as AriaTabPanel,
  Tabs as AriaTabs,
  SelectionIndicator,
} from "react-aria-components";

import { SizeContext } from "../context";
import { useHaptics } from "../haptics";
import { animationDuration } from "../theme/animations.stylex";
import { focusColor, primaryColor, uiColor } from "../theme/color.stylex";
import { mediaQueries } from "../theme/media-queries.stylex";
import { radius } from "../theme/radius.stylex";
import { gap, size as sizeSpace } from "../theme/semantic-spacing.stylex";
import type { Size, StyleXComponentProps } from "../theme/types";
import { fontFamily, fontSize } from "../theme/typography.stylex";

const styles = stylex.create({
  tabs: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
  },
  tabsVertical: {
    flexDirection: "row",
  },
  tabList: {
    gap: gap["xs"],
    overflow: "auto",
    alignItems: {
      ":is([data-orientation=horizontal])": "flex-start",
      ":is([data-orientation=vertical])": "stretch",
    },
    display: "flex",
    flexDirection: {
      ":is([data-orientation=horizontal])": "row",
      ":is([data-orientation=vertical])": "column",
    },
    position: "relative",
    borderBottomColor: {
      ":is([data-orientation=horizontal])": uiColor.border2,
      ":is([data-orientation=vertical])": "transparent",
    },
    borderBottomStyle: {
      ":is([data-orientation=horizontal])": "solid",
      ":is([data-orientation=vertical])": "none",
    },
    borderBottomWidth: {
      ":is([data-orientation=horizontal])": 1,
      ":is([data-orientation=vertical])": 0,
    },
    borderInlineEndColor: {
      ":is([data-orientation=horizontal])": "transparent",
      ":is([data-orientation=vertical])": uiColor.border2,
    },
    borderInlineEndStyle: {
      ":is([data-orientation=horizontal])": "none",
      ":is([data-orientation=vertical])": "solid",
    },
    borderInlineEndWidth: {
      ":is([data-orientation=horizontal])": 0,
      ":is([data-orientation=vertical])": 1,
    },
  },
  tab: {
    borderWidth: 0,
    outline: "none",
    alignItems: "center",
    backgroundColor: "transparent",
    color: {
      default: uiColor.text1,
      ":is([data-hovered],[data-focused],[data-selected])": uiColor.text2,
    },
    cursor: "default",
    display: "flex",
    fontFamily: fontFamily["sans"],
    fontSize: {
      ":is([data-size=lg] *)": fontSize["lg"],
      ":is([data-size=md] *)": fontSize["base"],
      ":is([data-size=sm] *)": fontSize["sm"],
    },
    justifyContent: "center",
    opacity: {
      default: 1,
      ":is([data-disabled])": 0.5,
    },
    position: "relative",
    transitionDuration: animationDuration.fast,
    transitionProperty: {
      default: "color",
      [mediaQueries.reducedMotion]: "none",
    },
    transitionTimingFunction: "ease-in-out",
    paddingBottom: {
      ":is([data-size=lg] *)": sizeSpace["md"],
      ":is([data-size=md] *)": sizeSpace["xxs"],
      ":is([data-size=sm] *)": sizeSpace["sm"],
    },
    paddingInlineStart: {
      ":is([data-size=lg] *)": sizeSpace["lg"],
      ":is([data-size=md] *)": sizeSpace["md"],
      ":is([data-size=sm] *)": sizeSpace["xxs"],
    },
    paddingInlineEnd: {
      ":is([data-size=lg] *)": sizeSpace["lg"],
      ":is([data-size=md] *)": sizeSpace["md"],
      ":is([data-size=sm] *)": sizeSpace["xxs"],
    },
    paddingTop: {
      ":is([data-size=lg] *)": sizeSpace["md"],
      ":is([data-size=md] *)": sizeSpace["xxs"],
      ":is([data-size=sm] *)": sizeSpace["sm"],
    },
  },
  selectionIndicator: {
    backgroundColor: "transparent",
    position: "absolute",
    transitionDuration: animationDuration.slow,
    transitionProperty: {
      default: "translate, width, height",
      [mediaQueries.reducedMotion]: "none",
    },
    transitionTimingFunction: "ease-in-out",
    borderBottomColor: {
      default: "transparent",
      ":is([data-orientation=horizontal] > [data-selected] > *)":
        primaryColor.solid1,
    },
    borderBottomStyle: {
      ":is([data-orientation=horizontal] *)": "solid",
      ":is([data-orientation=vertical])": "none",
    },
    borderBottomWidth: {
      ":is([data-orientation=horizontal] *)": 3,
      ":is([data-orientation=vertical] *)": 0,
    },
    borderInlineEndColor: {
      ":is([data-orientation=vertical] *)": "transparent",
      ":is([data-orientation=vertical] > [data-selected] > *)":
        primaryColor.solid1,
    },
    borderInlineEndStyle: {
      ":is([data-orientation=horizontal] *)": "none",
      ":is([data-orientation=vertical] *)": "solid",
    },
    borderInlineEndWidth: {
      ":is([data-orientation=horizontal] *)": 0,
      ":is([data-orientation=vertical] *)": 3,
    },
    bottom: {
      ":is([data-orientation=horizontal] *)": 0,
      ":is([data-orientation=vertical] *)": 0,
    },
    insetInlineStart: {
      ":is([data-orientation=horizontal] *)": 0,
      ":is([data-orientation=vertical] *)": "unset",
    },
    insetInlineEnd: {
      ":is([data-orientation=horizontal] *)": 0,
      ":is([data-orientation=vertical] *)": "0",
    },
    top: {
      ":is([data-orientation=horizontal] *)": "auto",
      ":is([data-orientation=vertical] *)": 0,
    },
    width: {
      ":is([data-orientation=horizontal] *)": "100%",
      ":is([data-orientation=vertical] *)": "auto",
    },
  },
  tabPanel: {
    outline: "none",
    fontSize: {
      ":is([data-size=lg] *)": fontSize["lg"],
      ":is([data-size=md] *)": fontSize["base"],
      ":is([data-size=sm] *)": fontSize["sm"],
    },
    paddingBottom: {
      ":is([data-size=lg] *)": sizeSpace["lg"],
      ":is([data-size=md] *)": sizeSpace["md"],
      ":is([data-size=sm] *)": sizeSpace["xxs"],
    },
    paddingInlineStart: {
      ":is([data-size=lg] *)": sizeSpace["lg"],
      ":is([data-size=md] *)": sizeSpace["md"],
      ":is([data-size=sm] *)": sizeSpace["xxs"],
    },
    paddingInlineEnd: {
      ":is([data-size=lg] *)": sizeSpace["lg"],
      ":is([data-size=md] *)": sizeSpace["md"],
      ":is([data-size=sm] *)": sizeSpace["xxs"],
    },
    paddingTop: {
      ":is([data-size=lg] *)": sizeSpace["lg"],
      ":is([data-size=md] *)": sizeSpace["md"],
      ":is([data-size=sm] *)": sizeSpace["xxs"],
    },
  },
  focusRing: {
    borderRadius: radius.md,
    cornerShape: "squircle",
    outline: {
      default: "none",
      ":is([data-focus-visible])": `2px solid ${focusColor.ring}`,
    },
    outlineOffset: "2px",
  },
});

export interface TabsProps extends StyleXComponentProps<
  Omit<AriaTabsProps, "children">
> {
  children: React.ReactNode;
  size?: Size;
  orientation?: "horizontal" | "vertical";
}

export function Tabs({
  children,
  style,
  size: sizeProp,
  orientation = "horizontal",
  onSelectionChange,
  ...props
}: TabsProps) {
  const { trigger } = useHaptics();
  const size = sizeProp || use(SizeContext);

  const handleSelectionChange = (
    key: Parameters<NonNullable<typeof onSelectionChange>>[0],
  ) => {
    trigger("selection");
    onSelectionChange?.(key);
  };

  return (
    <SizeContext value={size}>
      <AriaTabs
        {...props}
        onSelectionChange={handleSelectionChange}
        orientation={orientation}
        data-size={size}
        {...stylex.props(
          styles.tabs,
          orientation === "vertical" && styles.tabsVertical,
          style,
        )}
      >
        {children}
      </AriaTabs>
    </SizeContext>
  );
}

export interface TabListProps extends StyleXComponentProps<
  Omit<AriaTabListProps<object>, "children">
> {
  children: React.ReactNode;
}

export function TabList({ children, style, ...props }: TabListProps) {
  return (
    <AriaTabList {...props} {...stylex.props(styles.tabList, style)}>
      {children}
    </AriaTabList>
  );
}

export interface TabProps extends StyleXComponentProps<
  Omit<AriaTabProps, "children">
> {
  children: React.ReactNode;
}

export function Tab({ children, style, ...props }: TabProps) {
  return (
    <AriaTab {...props} {...stylex.props(styles.tab, styles.focusRing, style)}>
      <SelectionIndicator {...stylex.props(styles.selectionIndicator)} />
      {children}
    </AriaTab>
  );
}

export interface TabPanelProps extends StyleXComponentProps<
  Omit<AriaTabPanelProps, "children">
> {
  children: React.ReactNode;
}

export function TabPanel({ children, style, ...props }: TabPanelProps) {
  return (
    <AriaTabPanel
      {...props}
      {...stylex.props(styles.tabPanel, styles.focusRing, style)}
    >
      {children}
    </AriaTabPanel>
  );
}
