"use client";

import * as stylex from "@stylexjs/stylex";
import { ArrowRightFromLineIcon } from "lucide-react";

import type { StyleXComponentProps } from "../theme/types";

import { Drawer } from "../drawer";
import { IconButton } from "../icon-button";
import { uiColor } from "../theme/color.stylex";
import { containerBreakpoints } from "../theme/media-queries.stylex";
import {
  horizontalSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";

const styles = stylex.create({
  wrapper: {
    backgroundImage: `linear-gradient(to right, ${uiColor.bgSubtle} 50%, ${uiColor.bg} 50%)`,
    position: "relative",
    width: "100cqw",
  },
  root: {
    "--page-content-max-width": "1600px",
    containerType: "inline-size",
    display: "flex",
    flexDirection: "row",
    marginLeft: "auto",
    marginRight: "auto",
    maxWidth: "var(--page-content-max-width)",
    minHeight: "100cqh",
    width: "100%",
  },
  defaultSidebar: {
    overflow: "auto",
    overscrollBehavior: "contain",
    alignSelf: "start",
    flexShrink: 0,
    position: "sticky",
    maxHeight: "100cqh",
    top: 0,
  },
  sidebar: {
    overflow: "auto",
    boxSizing: "border-box",
    display: {
      default: "none",
      [containerBreakpoints.md]: "block",
    },
    flexShrink: 0,
    position: "sticky",
    borderRightColor: uiColor.border1,
    borderRightStyle: "solid",
    borderRightWidth: 1,
    height: "100cqh",
    overflowX: "hidden",
    overflowY: "auto",
    top: 0,
  },
  visibleMd: {
    display: {
      default: "none",
      [containerBreakpoints.md]: "block",
    },
  },
  visibleLg: {
    display: {
      default: "none",
      [containerBreakpoints.lg]: "block",
    },
  },
  drawer: {
    display: {
      default: "flex",
      [containerBreakpoints.md]: "none",
    },
    position: "absolute",
    left: horizontalSpace["md"],
    top: verticalSpace["md"],
  },
  page: {
    backgroundColor: uiColor.bg,
    boxSizing: "border-box",
    containerType: "inline-size",
    flexGrow: 1,
    minHeight: 0,
    minWidth: 0,
    paddingBottom: {
      default: verticalSpace["8xl"],
      [containerBreakpoints.sm]: verticalSpace["10xl"],
      ":has(> [data-header-layout=true])": "0 !important",
    },
    paddingLeft: {
      default: horizontalSpace["3xl"],
      [containerBreakpoints.sm]: horizontalSpace["9xl"],
      ":has(> [data-header-layout=true])": "0 !important",
    },
    paddingRight: {
      default: horizontalSpace["3xl"],
      [containerBreakpoints.lg]: horizontalSpace["6xl"],
      ":has(> [data-header-layout=true])": "0 !important",
      ":last-child": {
        default: horizontalSpace["2xl"],
        [containerBreakpoints.sm]: horizontalSpace["9xl"],
      },
    },
    paddingTop: {
      default: verticalSpace["md"],
      [containerBreakpoints.sm]: verticalSpace["lg"],
      ":has(> [data-header-layout=true])": "0 !important",
    },
    width: "100%",
  },
});

/**
 * Sidebar layout root component. Main container for the sidebar layout.
 */
export interface SidebarLayoutRootProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {}

export const SidebarLayoutRoot = ({
  style,
  children,
  ...props
}: SidebarLayoutRootProps) => {
  return (
    <div
      {...props}
      {...stylex.props(styles.wrapper, style)}
      data-sidebar-layout={true}
    >
      <div {...stylex.props(styles.root)}>{children}</div>
    </div>
  );
};

/**
 * Sidebar layout sidebar component. Slot for sidebar content.
 */
export interface SidebarLayoutNavigationSidebarProps extends StyleXComponentProps<
  React.ComponentProps<"aside">
> {}

export const SidebarLayoutNavigationSidebar = ({
  style,
  children,
  ...props
}: SidebarLayoutNavigationSidebarProps) => {
  return (
    <>
      <aside {...props} {...stylex.props(styles.sidebar, style)}>
        {children}
      </aside>
      <Drawer
        trigger={
          <IconButton
            label="Open Navigation"
            variant="outline"
            style={styles.drawer as unknown as stylex.StyleXStyles}
          >
            <ArrowRightFromLineIcon />
          </IconButton>
        }
        direction="left"
        size="sm"
      >
        {children}
      </Drawer>
    </>
  );
};

export interface SidebarLayoutSidebarProps extends StyleXComponentProps<
  React.ComponentProps<"aside">
> {
  /**
   * At what breakpoint the sidebar should be visible.
   */
  visible?: "md" | "lg";
}

/**
 * A sidebar that is not part of the main content flow.
 */
export const SidebarLayoutInconsequentialSidebar = ({
  style,
  children,
  visible = "md",
  ...props
}: SidebarLayoutSidebarProps) => {
  return (
    <aside
      {...props}
      {...stylex.props(
        styles.defaultSidebar,
        visible === "md" && styles.visibleMd,
        visible === "lg" && styles.visibleLg,
        style,
      )}
    >
      {children}
    </aside>
  );
};

/**
 * Sidebar layout page component. Slot for main page content.
 */
export interface SidebarLayoutPageProps extends StyleXComponentProps<
  React.ComponentProps<"main">
> {}

export const SidebarLayoutPage = ({
  style,
  ...props
}: SidebarLayoutPageProps) => {
  return <main {...props} {...stylex.props(styles.page, style)} />;
};

/**
 * Sidebar layout component with subcomponents.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const SidebarLayout = {
  Root: SidebarLayoutRoot,
  NavigationSidebar: SidebarLayoutNavigationSidebar,
  Page: SidebarLayoutPage,
  InconsequentialSidebar: SidebarLayoutInconsequentialSidebar,
};
