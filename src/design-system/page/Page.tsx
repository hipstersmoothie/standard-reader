"use client";

/* oxlint-disable perfectionist/sort-imports -- @stylexjs vs @tanstack ordering conflicts */
import type { ComponentProps, ReactNode } from "react";

import * as stylex from "@stylexjs/stylex";
import type { LinkProps } from "@tanstack/react-router";
import { IconButtonLink } from "#/components/router-links";
import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { StyleXComponentProps } from "../theme/types";

import { Flex } from "../flex";
import type { IconButton } from "../icon-button";
import { primaryColor, uiColor } from "../theme/color.stylex";
import {
  breakpoints,
  containerBreakpoints,
} from "../theme/media-queries.stylex";
import { radius } from "../theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  size as sizeSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import { shadow } from "../theme/shadow.stylex";
import { fontFamily } from "../theme/typography.stylex";
import { Text } from "../typography/text";
import { PageContext, usePageContext } from "./context";

const smallRootStyles = stylex.create({
  root: {
    boxSizing: "border-box",
    flexGrow: 1,
    marginLeft: "auto",
    marginRight: "auto",
    maxWidth: "880px",
    paddingTop: {
      default: verticalSpace["3xl"],
      [breakpoints.sm]: verticalSpace["2xl"],
    },
    width: "100%",
  },
});

const largeRootStyles = stylex.create({
  root: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    marginLeft: "auto",
    marginRight: "auto",
    maxWidth: "var(--page-content-max-width)",
    paddingBottom: verticalSpace["11xl"],
    paddingTop: verticalSpace["2xl"],
    width: "100%",
  },
});

const smallHeaderStyles = stylex.create({
  header: {
    marginBottom: {
      default: verticalSpace["4xl"],
      ":is([data-sticky-header=true] *)": 0,
    },
    minHeight: sizeSpace["3xl"],
  },
});

const largeHeaderStyles = stylex.create({
  header: {
    gridTemplateAreas: {
      default: `
        'title actions'
      `,
      [breakpoints.sm]: {
        ":has([data-page-description])": `
          'title actions'
          'description actions'
        `,
      },
      ":has([data-page-icon])": `
        'icon title actions'
      `,
      [breakpoints.sm]: {
        ":has([data-page-description])": `
          'icon title actions'
          'icon description actions'
        `,
      },
    },
    alignItems: "center",
    columnGap: gap["2xl"],
    display: "grid",
    gridTemplateColumns: {
      default: "1fr auto",
      ":has([data-page-icon])": "auto 1fr auto",
    },
    rowGap: gap["md"],
    marginBottom: {
      default: verticalSpace["6xl"],
      ":is([data-sticky-header=true] *)": 0,
    },
    minHeight: sizeSpace["3xl"],
    paddingBottom: verticalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
  },
});

const sharedStyles = stylex.create({
  smallTitle: {
    // eslint-disable-next-line @stylexjs/valid-styles
    textBoxEdge: "cap alphabetic",
    // eslint-disable-next-line @stylexjs/valid-styles
    textBoxTrim: "trim-both",
    flexGrow: 1,
    fontFamily: fontFamily["title"],
    minWidth: 0,
  },
  largeTitle: {
    // eslint-disable-next-line @stylexjs/valid-styles
    textBoxEdge: "cap alphabetic",
    // eslint-disable-next-line @stylexjs/valid-styles
    textBoxTrim: "trim-both",
    flexGrow: 1,
    fontFamily: fontFamily["title"],
    gridColumnEnd: "title",
    gridColumnStart: "title",
    gridRowEnd: "title",
    gridRowStart: "title",
    minWidth: 0,
  },
  description: {
    display: {
      default: "none",
      [breakpoints.sm]: "block",
    },
    gridColumnEnd: "description",
    gridColumnStart: "description",
    gridRowEnd: "description",
    gridRowStart: "description",
  },
  smallActions: {
    gap: gap["xs"],
    flexShrink: 0,
  },
  largeActions: {
    gap: {
      default: gap["xs"],
      [breakpoints.sm]: sizeSpace["sm"],
    },
    gridColumnEnd: "actions",
    gridColumnStart: "actions",
    gridRowEnd: "actions",
    gridRowStart: "actions",
    minHeight: sizeSpace["3xl"],
  },
  icon: {
    borderRadius: radius.lg,
    // eslint-disable-next-line @stylexjs/valid-styles, @stylexjs/sort-keys
    cornerShape: "squircle",
    alignItems: "center",
    backgroundColor: primaryColor.solid1,
    boxShadow: shadow["lg"],
    color: primaryColor.textContrast,
    display: "flex",
    gridColumnEnd: "icon",
    gridColumnStart: "icon",
    gridRowEnd: "icon",
    gridRowStart: "icon",
    justifyContent: "center",
    height: sizeSpace["4xl"],
    width: sizeSpace["4xl"],
  },
});

const stickyBaseStyles = stylex.create({
  sentinel: {
    pointerEvents: "none",
    position: "relative",
    height: 1,
    width: "100%",
  },
  largeSentinel: {
    height: 0,
  },
  stickyWrapper: {
    position: "sticky",
    zIndex: 10,
    left: 0,
    marginBottom: verticalSpace["xl"],
    marginLeft: `calc(-50vw + 50%)`,
    marginRight: `calc(-50vw + 50%)`,
    right: 0,
    top: 0,
    width: "100vw",
  },
  largeStickyWrapper: {
    zIndex: 100,
    paddingBottom: verticalSpace["sm"],
  },
  stickyWrapperStuck: {
    backgroundColor: {
      default: "light-dark(rgba(252, 252, 253, 0.8), rgba(17, 17, 19, 0.8))",
    },
    boxShadow: `${shadow.sm}, 0 0 32px 4px ${uiColor.bgSubtle}`,
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
  },
  blurContainer: {
    inset: 0,
    overflow: "hidden",
    position: "absolute",
    zIndex: 0,
  },
  blur: {
    backdropFilter: "blur(32px) saturate(500%)",
    position: "absolute",
    bottom: -48,
    left: -48,
    right: -48,
    top: -48,
  },
  smallStickyContent: {
    position: "relative",
    zIndex: 1,
    marginBottom: 0,
    marginLeft: "auto",
    marginRight: "auto",
    maxWidth: "880px",
    paddingBottom: verticalSpace["3xl"],
    paddingLeft: horizontalSpace["3xl"],
    paddingRight: horizontalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
  },
  largeStickyContent: {
    boxSizing: "border-box",
    position: "relative",
    zIndex: 1,
    marginBottom: 0,
    marginLeft: "auto",
    marginRight: "auto",
    maxWidth: "var(--page-content-max-width)",
    paddingLeft: {
      default: horizontalSpace["3xl"],
      [containerBreakpoints.sm]: horizontalSpace["6xl"],
      ":has(> [data-sidebar-layout=true])": "0 !important",
    },
    paddingRight: {
      default: horizontalSpace["3xl"],
      [containerBreakpoints.sm]: horizontalSpace["6xl"],
      ":has(> [data-sidebar-layout=true])": "0 !important",
    },
  },
});

const stickyFooterBaseStyles = stylex.create({
  sentinel: {
    pointerEvents: "none",
    position: "relative",
    height: 1,
    width: "100%",
  },
  stickyWrapper: {
    position: "sticky",
    zIndex: 10,
    bottom: 0,
    left: 0,
    marginLeft: `calc(-50vw + 50%)`,
    marginRight: `calc(-50vw + 50%)`,
    marginTop: verticalSpace["md"],
    right: 0,
    width: "100vw",
  },
  stickyWrapperStuck: {
    backgroundColor: {
      default: "light-dark(rgba(252, 252, 253, 0.8), rgba(17, 17, 19, 0.8))",
    },
    boxShadow: `${shadow.sm}, 0 0 32px 4px ${uiColor.bgSubtle}`,
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
  },
  blurContainer: {
    inset: 0,
    overflow: "hidden",
    position: "absolute",
    zIndex: 0,
  },
  blur: {
    backdropFilter: "blur(32px) saturate(500%)",
    position: "absolute",
    bottom: -48,
    left: -48,
    right: -48,
    top: -48,
  },
  smallStickyContent: {
    position: "relative",
    zIndex: 1,
    marginLeft: "auto",
    marginRight: "auto",
    maxWidth: "880px",
    paddingBottom: verticalSpace["3xl"],
    paddingLeft: horizontalSpace["3xl"],
    paddingRight: horizontalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
  },
  largeStickyContent: {
    boxSizing: "border-box",
    position: "relative",
    zIndex: 1,
    marginLeft: "auto",
    marginRight: "auto",
    maxWidth: "var(--page-content-max-width)",
    paddingBottom: verticalSpace["3xl"],
    paddingLeft: {
      default: horizontalSpace["3xl"],
      [containerBreakpoints.sm]: horizontalSpace["6xl"],
      ":has(> [data-sidebar-layout=true])": "0 !important",
    },
    paddingRight: {
      default: horizontalSpace["3xl"],
      [containerBreakpoints.sm]: horizontalSpace["6xl"],
      ":has(> [data-sidebar-layout=true])": "0 !important",
    },
    paddingTop: verticalSpace["3xl"],
  },
});

export interface PageRootProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {
  /**
   * Layout variant. "small" uses a narrow max-width (880px), "large" uses full content width.
   */
  variant?: "small" | "large";
}

/**
 * Root container for a page layout.
 */
export const PageRoot = ({
  style,
  variant = "large",
  ...props
}: PageRootProps) => {
  const rootStyles =
    variant === "small" ? smallRootStyles.root : largeRootStyles.root;

  return (
    <PageContext value={variant}>
      <div
        {...props}
        data-page-variant={variant}
        {...stylex.props(rootStyles, style)}
      />
    </PageContext>
  );
};

export interface PageHeaderProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {}

/**
 * Header section for a page.
 */
export const PageHeader = ({ style, ...props }: PageHeaderProps) => {
  const variant = usePageContext();
  const isSmall = variant === "small";

  if (isSmall) {
    return (
      <Flex
        align="center"
        gap="xl"
        {...props}
        style={[smallHeaderStyles.header, style]}
      />
    );
  }

  return <div {...props} {...stylex.props(largeHeaderStyles.header, style)} />;
};

export interface PageIconProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {}

/**
 * Icon component for a large page header.
 * Only used with variant="large".
 */
export const PageIcon = ({ style, ...props }: PageIconProps) => {
  return (
    <div
      data-page-icon
      {...props}
      {...stylex.props(sharedStyles.icon, style)}
    />
  );
};

export interface PageTitleProps extends StyleXComponentProps<
  React.ComponentProps<"h1">
> {
  /** Page title content. */
  children: React.ReactNode;
}

/**
 * Title component for a page.
 */
export const PageTitle = ({ style, children, ...props }: PageTitleProps) => {
  const variant = usePageContext();
  const isSmall = variant === "small";
  const titleStyles = isSmall
    ? sharedStyles.smallTitle
    : sharedStyles.largeTitle;

  return (
    <Text
      size={
        isSmall ? { default: "xl", sm: "2xl" } : { default: "2xl", sm: "3xl" }
      }
      weight="semibold"
      {...props}
      style={[titleStyles, style]}
    >
      {children}
    </Text>
  );
};

export interface PageDescriptionProps extends StyleXComponentProps<
  React.ComponentProps<"p">
> {
  /** Description content. */
  children: React.ReactNode;
}

/**
 * Description component for a large page header.
 * Only used with variant="large".
 */
export const PageDescription = ({
  style,
  children,
  ...props
}: PageDescriptionProps) => {
  return (
    <Text
      size="sm"
      variant="secondary"
      weight="light"
      data-page-description
      {...props}
      style={[sharedStyles.description, style]}
    >
      {children}
    </Text>
  );
};

export interface PageActionsProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {}

/**
 * Actions container for header buttons and controls.
 */
export const PageActions = ({ style, ...props }: PageActionsProps) => {
  const variant = usePageContext();
  const isSmall = variant === "small";
  const actionsStyles = isSmall
    ? sharedStyles.smallActions
    : sharedStyles.largeActions;

  return <Flex align="center" {...props} style={[actionsStyles, style]} />;
};

export interface PageStickyHeaderProps {
  /** Content to display in the sticky header. */
  children: React.ReactNode;
  /** Optional style overrides. */
  style?: stylex.StyleXStyles;
}

/**
 * Sticky header component that becomes opaque when scrolled past.
 * Includes a sentinel element for intersection observer detection.
 */
export const PageStickyHeader = ({
  children,
  style,
}: PageStickyHeaderProps) => {
  const variant = usePageContext();
  const isSmall = variant === "small";
  const [isStuck, setIsStuck] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const header = headerRef.current;
    if (!sentinel || !header) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setIsStuck(!entry.isIntersecting);
      },
      {
        threshold: [0, 1],
        rootMargin: "0px 0px 0px 0px",
      },
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, []);

  const sentinelStyles = isSmall
    ? stickyBaseStyles.sentinel
    : [stickyBaseStyles.sentinel, stickyBaseStyles.largeSentinel];
  const wrapperStyles = isSmall
    ? stickyBaseStyles.stickyWrapper
    : [stickyBaseStyles.stickyWrapper, stickyBaseStyles.largeStickyWrapper];
  const contentStyles = isSmall
    ? stickyBaseStyles.smallStickyContent
    : stickyBaseStyles.largeStickyContent;

  return (
    <div style={{ display: "contents" }}>
      <div ref={sentinelRef} {...stylex.props(sentinelStyles)} />
      <div
        ref={headerRef}
        data-sticky-header
        {...stylex.props(
          wrapperStyles,
          isStuck && stickyBaseStyles.stickyWrapperStuck,
          style,
        )}
      >
        {isStuck && (
          <div {...stylex.props(stickyBaseStyles.blurContainer)}>
            <div {...stylex.props(stickyBaseStyles.blur)} />
          </div>
        )}
        <div {...stylex.props(contentStyles)}>{children}</div>
      </div>
    </div>
  );
};

export interface PageStickyFooterProps {
  /** Content to display in the sticky footer. */
  children: React.ReactNode;
}

/**
 * Sticky footer component that becomes opaque when scrolled past.
 * Includes a sentinel element for intersection observer detection.
 */
export const PageStickyFooter = ({ children }: PageStickyFooterProps) => {
  const variant = usePageContext();
  const isSmall = variant === "small";
  const [isStuck, setIsStuck] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const footer = footerRef.current;
    if (!sentinel || !footer) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setIsStuck(!entry.isIntersecting);
      },
      {
        threshold: [0, 1],
        rootMargin: "0px 0px 0px 0px",
      },
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, []);

  const contentStyles = isSmall
    ? stickyFooterBaseStyles.smallStickyContent
    : stickyFooterBaseStyles.largeStickyContent;

  return (
    <>
      <div
        ref={sentinelRef}
        {...stylex.props(stickyFooterBaseStyles.sentinel)}
      />
      <div
        ref={footerRef}
        data-sticky-footer
        {...stylex.props(
          stickyFooterBaseStyles.stickyWrapper,
          isStuck && stickyFooterBaseStyles.stickyWrapperStuck,
        )}
      >
        {isStuck && (
          <div {...stylex.props(stickyFooterBaseStyles.blurContainer)}>
            <div {...stylex.props(stickyFooterBaseStyles.blur)} />
          </div>
        )}
        <div {...stylex.props(contentStyles)}>{children}</div>
      </div>
    </>
  );
};

export type PageBackLinkProps = LinkProps & {
  "aria-label"?: string;
  style?: ComponentProps<typeof IconButton>["style"];
  children?: ReactNode;
};

/**
 * Back link component for navigating to the previous page.
 */
export const PageBackLink = ({
  style,
  children,
  "aria-label": ariaLabel = "Back",
  ...linkProps
}: PageBackLinkProps) => {
  return (
    <IconButtonLink
      {...(linkProps as ComponentProps<typeof IconButtonLink>)}
      aria-label={ariaLabel}
      style={style}
      variant="tertiary"
      size="lg"
    >
      {children ?? <ArrowLeft size={20} />}
    </IconButtonLink>
  );
};
