import { useLayoutEffect } from "@react-aria/utils";
import * as stylex from "@stylexjs/stylex";
import { ChevronRight } from "lucide-react";
import { createContext, use, useId, useMemo } from "react";
import { mergeProps, useFocusRing, useHover, usePress } from "react-aria";
import {
  Button,
  Disclosure,
  DisclosurePanel,
  Heading,
} from "react-aria-components";

import { DirectionalIcon } from "../directional-icon";
import { Flex } from "../flex";
import { animationDuration } from "../theme/animations.stylex";
import { focusColor, primaryColor, uiColor } from "../theme/color.stylex";
import { mediaQueries } from "../theme/media-queries.stylex";
import { radius } from "../theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  size as sizeSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import type { StyleXComponentProps } from "../theme/types";
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
    paddingInlineStart: horizontalSpace["5xl"],
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingTop: verticalSpace["5xl"],
    width: sizeSpace["11xl"],
  },
  sidebarHeader: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    paddingBottom: verticalSpace["xl"],
    paddingInlineStart: horizontalSpace["md"],
    paddingInlineEnd: horizontalSpace["md"],
    paddingTop: verticalSpace["xl"],
  },
  sidebarHeaderLink: {
    textDecoration: "none",
  },
  sidebarSectionTitle: {
    height: sizeSpace["xl"],
    paddingInlineStart: horizontalSpace["xl"],
    paddingInlineEnd: horizontalSpace["xl"],
    paddingTop: {
      ":is([data-sidebar-group] *)": verticalSpace["3xl"],
    },
  },
  sidebarSectionList: {
    gap: gap["xs"],
    display: "flex",
    flexDirection: "column",
    marginBottom: 0,
    marginInlineStart: 0,
    marginInlineEnd: 0,
    marginTop: 0,
    paddingBottom: 0,
    paddingInlineStart: 0,
    paddingInlineEnd: 0,
    paddingTop: 0,
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
    fontFamily: fontFamily["sans"],
    fontSize: fontSize["sm"],
    transitionDuration: animationDuration.fast,
    transitionProperty: {
      default: "background-color",
      [mediaQueries.reducedMotion]: "none",
    },
    transitionTimingFunction: "ease-in-out",
    height: sizeSpace["3xl"],
    outline: {
      default: "none",
      ":is([data-focus-visible])": `2px solid ${focusColor.ring}`,
    },
    outlineOffset: "2px",
    paddingInlineStart: horizontalSpace["xl"],
    paddingInlineEnd: horizontalSpace["xl"],
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
    marginInlineStart: 0,
    marginInlineEnd: 0,
    marginTop: 0,
  },
  sidebarGroup: {
    display: "flex",
    flexDirection: "column",
  },
  sidebarGroupButton: {
    borderWidth: 0,
    gap: gap["sm"],
    alignItems: "center",
    backgroundColor: "transparent",
    color: uiColor.text2,
    display: "flex",
    fontFamily: fontFamily["sans"],
    fontSize: fontSize["base"],
    fontWeight: fontWeight["medium"],
    textAlign: "start",
    marginInlineStart: `calc(${horizontalSpace["md"]} * -1)`,
    outline: {
      default: "none",
      ":is([data-focus-visible])": `2px solid ${focusColor.ring}`,
    },
    outlineOffset: "2px",
    paddingBottom: 0,
    paddingInlineStart: 0,
    paddingInlineEnd: 0,
    paddingTop: 0,
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
          <DirectionalIcon
            as={ChevronRight}
            size={16}
            style={styles.chevronIcon}
          />
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
  const { focusProps, isFocusVisible } = useFocusRing();
  const Component = "href" in props ? "a" : "button";

  return (
    <li {...stylex.props(styles.sidebarItemWrapper)}>
      <Component
        {...mergeProps(
          props as React.ComponentProps<typeof Component>,
          hoverProps,
          pressProps,
          focusProps,
        )}
        data-hovered={isHovered || undefined}
        data-pressed={isPressed}
        data-active={isActive}
        data-focus-visible={isFocusVisible || undefined}
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
