import { useLayoutEffect } from "@react-aria/utils";
import * as stylex from "@stylexjs/stylex";
import { ChevronRight } from "lucide-react";
import { createContext, use, useId, useMemo } from "react";
import { mergeProps, useHover, usePress } from "react-aria";
import {
  Button,
  Disclosure,
  DisclosurePanel,
  Heading,
} from "react-aria-components";

import type { StyleXComponentProps } from "../theme/types";

import { Flex } from "../flex";
import { animationDuration } from "../theme/animations.stylex";
import { primaryColor, uiColor } from "../theme/color.stylex";
import { mediaQueries } from "../theme/media-queries.stylex";
import { radius } from "../theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  size as sizeSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import { fontFamily, fontSize, fontWeight } from "../theme/typography.stylex";
import { Text } from "../typography/text";

interface SidebarContextType {
  headerId: string;
}

const SidebarContext = createContext<SidebarContextType>({
  headerId: "",
});

const styles = stylex.create({
  sidebar: {
    gap: gap["5xl"],
    display: "flex",
    flexDirection: "column",
    paddingBottom: verticalSpace["10xl"],
    paddingLeft: horizontalSpace["5xl"],
    paddingRight: horizontalSpace["3xl"],
    paddingTop: verticalSpace["5xl"],
    width: sizeSpace["11xl"],
  },
  sidebarHeader: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    paddingBottom: verticalSpace["xl"],
    paddingLeft: horizontalSpace["md"],
    paddingRight: horizontalSpace["md"],
    paddingTop: verticalSpace["xl"],
  },
  sidebarHeaderLink: {
    textDecoration: "none",
  },
  sidebarSectionTitle: {
    height: sizeSpace["xl"],
    paddingLeft: horizontalSpace["xl"],
    paddingRight: horizontalSpace["xl"],
    paddingTop: {
      ":is([data-sidebar-group] *)": verticalSpace["3xl"],
    },
  },
  sidebarSectionList: {
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
    marginTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    gap: gap["xs"],
    paddingRight: 0,
    display: "flex",
    paddingTop: 0,
    flexDirection: "column",
  },
  sidebarItemWrapper: {
    listStyle: "none",
  },
  sidebarItem: {
    borderRadius: radius.lg,
    borderWidth: 0,

    cornerShape: "squircle",
    textDecoration: "none",
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":is([data-hovered=true])": uiColor.component2,
      ":is([data-pressed=true])": uiColor.component3,
    },
    boxSizing: "border-box",
    color: uiColor.text2,
    display: "flex",
    fontSize: fontSize["sm"],
    fontFamily: fontFamily["sans"],
    transitionDuration: animationDuration.fast,
    transitionProperty: {
      default: "background-color",
      [mediaQueries.reducedMotion]: "none",
    },
    transitionTimingFunction: "ease-in-out",
    height: sizeSpace["3xl"],
    paddingLeft: horizontalSpace["xl"],
    paddingRight: horizontalSpace["xl"],
    width: "100%",
  },
  sidebarItemActive: {
    backgroundColor: {
      default: primaryColor.component1,
      ":is([data-hovered=true])": primaryColor.component2,
      ":is([data-pressed=true])": primaryColor.component3,
    },
    color: primaryColor.text2,
    scrollMarginTop: sizeSpace["md"],
  },
  sidebarGroupHeading: {
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
    marginTop: 0,
  },
  sidebarGroup: {
    display: "flex",
    flexDirection: "column",
  },
  sidebarGroupButton: {
    paddingBottom: 0,
    paddingLeft: 0,
    borderWidth: 0,
    paddingRight: 0,
    gap: gap["sm"],
    paddingTop: 0,
    alignItems: "center",
    backgroundColor: "transparent",
    color: uiColor.text2,
    display: "flex",
    fontFamily: fontFamily["sans"],
    fontSize: fontSize["base"],
    fontWeight: fontWeight["medium"],
    textAlign: "left",
    marginLeft: `calc(${horizontalSpace["md"]} * -1)`,
    width: "100%",
  },
  chevronIcon: {
    transition: "rotate 250ms",
    rotate: {
      default: "0deg",
      ":is([aria-expanded=true] *)": "90deg",
    },
  },
  sidebarGroupPanel: {
    overflow: "clip",
    transition: {
      default: "height 250ms",
      [mediaQueries.reducedMotion]: "none",
    },
    height: "var(--disclosure-panel-height)",
  },
  sidebarGroupPanelContent: {
    gap: gap["xs"],
    display: "flex",
    flexDirection: "column",
    paddingTop: verticalSpace["3xl"],
  },
});

export interface SidebarProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {
  children: React.ReactNode;
}

export function Sidebar({ children, style, ...props }: SidebarProps) {
  const headerId = useId();
  const contextValue = useMemo(() => ({ headerId }), [headerId]);

  useLayoutEffect(() => {
    const focusActiveItem = () => {
      const activeItem =
        document.querySelector<HTMLLIElement>("[data-active=true]");
      activeItem?.scrollIntoView({ behavior: "instant" });
    };

    document.addEventListener("keydown", focusActiveItem, { once: true });
    return () => document.removeEventListener("keydown", focusActiveItem);
  }, []);

  return (
    <SidebarContext value={contextValue}>
      <nav
        {...props}
        {...stylex.props(styles.sidebar, style)}
        aria-labelledby={headerId}
      >
        {children}
      </nav>
    </SidebarContext>
  );
}

export interface SidebarHeaderProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {
  children: React.ReactNode;
  href?: string;
  linkComponent?: React.ComponentType<React.ComponentProps<"a">>;
  action?: React.ReactNode;
}

export function SidebarHeader({
  children,
  style,
  href,
  linkComponent,
  action,
  ...props
}: SidebarHeaderProps) {
  const { headerId } = use(SidebarContext);
  const LinkComponent = linkComponent || "a";

  return (
    <header
      {...props}
      {...stylex.props(styles.sidebarHeader, style)}
      id={headerId}
    >
      {href ? (
        <LinkComponent
          href={href}
          {...stylex.props(styles.sidebarHeaderLink, style)}
        >
          {children}
        </LinkComponent>
      ) : (
        children
      )}
      {action}
    </header>
  );
}

export interface SidebarGroupProps {
  children: React.ReactNode;
  title: string;
  defaultExpanded?: boolean;
}

export function SidebarGroup({
  children,
  title,
  defaultExpanded = true,
}: SidebarGroupProps) {
  return (
    <Disclosure
      defaultExpanded={defaultExpanded}
      {...stylex.props(styles.sidebarGroup)}
    >
      <Heading {...stylex.props(styles.sidebarGroupHeading)}>
        <Button slot="trigger" {...stylex.props(styles.sidebarGroupButton)}>
          <ChevronRight size={16} {...stylex.props(styles.chevronIcon)} />
          {title}
        </Button>
      </Heading>
      <DisclosurePanel
        {...stylex.props(styles.sidebarGroupPanel)}
        data-sidebar-group
      >
        <div {...stylex.props(styles.sidebarGroupPanelContent)}>{children}</div>
      </DisclosurePanel>
    </Disclosure>
  );
}

export interface SidebarSectionProps {
  children: React.ReactNode;
  title?: string;
}

export function SidebarSection({ children, title }: SidebarSectionProps) {
  const headerId = useId();

  return (
    <Flex direction="column" gap="xs">
      {title && (
        <div {...stylex.props(styles.sidebarSectionTitle)}>
          <Text id={headerId} size="xs" weight="semibold" variant="secondary">
            {title}
          </Text>
        </div>
      )}
      <ul
        aria-labelledby={title ? headerId : undefined}
        {...stylex.props(styles.sidebarSectionList)}
      >
        {children}
      </ul>
    </Flex>
  );
}

export interface SidebarItemProps extends StyleXComponentProps<
  React.ComponentProps<"li">
> {
  children: React.ReactNode;
  isActive?: boolean;
}

export function SidebarItem({
  children,
  style,
  isActive,
  ...props
}: SidebarItemProps) {
  const { hoverProps, isHovered } = useHover({});
  const { pressProps, isPressed } = usePress({});
  const Component = "href" in props ? "a" : "button";

  return (
    <li {...stylex.props(styles.sidebarItemWrapper)}>
      <Component
        {...mergeProps(
          props as React.ComponentProps<typeof Component>,
          hoverProps,
          pressProps,
        )}
        data-hovered={isHovered || undefined}
        data-pressed={isPressed}
        data-active={isActive}
        {...stylex.props(
          styles.sidebarItem,
          isActive && styles.sidebarItemActive,
          style,
        )}
      >
        {children}
      </Component>
    </li>
  );
}
