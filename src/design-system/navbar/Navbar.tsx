"use client";

import type { LinkProps } from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { Menu, X } from "lucide-react";
import * as React from "react";
import { use, useState } from "react";
import { Link } from "react-aria-components";

import type { Size, StyleXComponentProps } from "../theme/types";

import { SizeContext } from "../context";
import { IconButton } from "../icon-button";
import { Separator } from "../separator";
import { primaryColor, uiColor } from "../theme/color.stylex";
import { containerBreakpoints } from "../theme/media-queries.stylex";
import { ui } from "../theme/semantic-color.stylex";
import {
  gap,
  horizontalSpace,
  size as sizeSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import { fontFamily, fontWeight } from "../theme/typography.stylex";

const styles = stylex.create({
  wrapper: {
    zIndex: 1000,
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    top: 0,
    width: "100%",
  },
  navbar: {
    "--separator-visibility": {
      default: "none",
      ":is([data-navbar-open]):has([data-navbar-action])": "flex",
      ":has([data-always-visible])": "none",
      [containerBreakpoints.sm]: "none",
    },
    "--visibility": {
      ":is([data-navbar-open])": "flex",
      [containerBreakpoints.sm]: "none",
    },
    borderWidth: 0,
    gridTemplateAreas: {
      default: `
        "logo hamburger"
      `,
      ":is([data-navbar-open])": `
        "logo hamburger"
        "navigation navigation"
      `,
      ":is([data-navbar-open]):has([data-navbar-action])": `
        "logo hamburger"
        "navigation navigation"
        "separator separator"
        "action action"
      `,
      ":has([data-always-visible])": `
        "logo action hamburger"
      `,
      ":has([data-always-visible]):is([data-navbar-open])": `
        "logo action hamburger"
        "navigation navigation navigation"
        "separator separator separator"
      `,
      [containerBreakpoints.sm]: {
        default: `
          "logo navigation"
        `,
        ":has([data-navbar-action])": `
          "logo navigation action"
        `,
      },
    },
    overflow: {
      ":is([data-navbar-open])": "auto",
    },
    alignItems: "center",
    boxSizing: "border-box",
    columnGap: {
      default: sizeSpace["md"],
      [containerBreakpoints.sm]: sizeSpace["3xl"],
    },
    display: "grid",
    gridTemplateColumns: {
      default: "1fr auto",
      ":has([data-always-visible]):not([data-navbar-action])":
        "1fr min-content min-content",
      [containerBreakpoints.sm]: {
        default: "1fr auto",
        ":has([data-navbar-action])": "auto 1fr auto",
      },
    },
    gridTemplateRows: {
      ":is([data-navbar-open])": `min-content min-content min-content`,
      ":is([data-navbar-open]):has([data-navbar-action])": `min-content min-content min-content min-content`,
    },
    rowGap: {
      default: sizeSpace["md"],
      [containerBreakpoints.sm]: sizeSpace["3xl"],
    },
    marginLeft: "auto",
    marginRight: "auto",
    maxWidth: "var(--page-content-max-width)",
    minHeight: {
      default: sizeSpace["5xl"],
      ":is([data-navbar-open])": "100%",
      [containerBreakpoints.sm]: sizeSpace["5xl"],
    },
    paddingBottom: {
      default: verticalSpace["xl"],
      ":is([data-navbar-open]):has([data-navbar-action])": verticalSpace["2xl"],
    },
    paddingLeft: {
      default: horizontalSpace["3xl"],
      [containerBreakpoints.sm]: horizontalSpace["6xl"],
    },
    paddingRight: {
      default: horizontalSpace["3xl"],
      [containerBreakpoints.sm]: horizontalSpace["6xl"],
    },
    paddingTop: verticalSpace["xl"],
    width: "100%",
  },
  logo: {
    "--underline-opacity": {
      default: 0,
      ":is([aria-current=page])": 1,
      ":is([data-active])": 1,
      ":is([data-status=active])": 1,
    },
    gap: gap["md"],
    textDecoration: "none",
    alignItems: "center",
    color: {
      default: primaryColor.text2,
    },
    cursor: "pointer",
    display: "flex",
    fontFamily: fontFamily["sans"],
    fontWeight: fontWeight["normal"],
    position: "relative",
    width: {
      default: "100%",
      [containerBreakpoints.sm]: "auto",
    },
  },
  logoContent: {
    position: "relative",

    "::after": {
      backgroundColor: "currentColor",
      content: '""',
      display: "block",
      opacity: "var(--underline-opacity)",
      pointerEvents: "none",
      position: "absolute",
      bottom: `calc(${verticalSpace["xxs"]} * -1)`,
      height: "2px",
      left: 0,
      right: 0,
      width: "100%",
    },
  },
  logoImage: {
    display: "block",
    objectFit: "contain",
    height: "40px",
    width: "auto",
  },
  separator: {
    gridColumnEnd: 'separator',
    gridColumnStart: 'separator',
    gridRowEnd: 'separator',
    gridRowStart: 'separator',
    // eslint-disable-next-line @stylexjs/valid-styles
    display: "var(--separator-visibility, none)",
  },
  navigation: {
    gridColumnEnd: 'navigation',
    gridColumnStart: 'navigation',
    gridRowEnd: 'navigation',
    gridRowStart: 'navigation',
    gap: {
      default: gap["5xl"],
      [containerBreakpoints.sm]: sizeSpace["3xl"],
    },
    alignItems: {
      default: "start",
      [containerBreakpoints.sm]: "stretch",
    },
    display: {
      // eslint-disable-next-line @stylexjs/valid-styles
      default: "var(--visibility, none)",
      [containerBreakpoints.sm]: "flex",
    },
    flexDirection: {
      default: "column",
      [containerBreakpoints.sm]: "row",
    },
    flexGrow: 1,
  },
  navigationJustifyLeft: {
    justifyContent: "flex-start",
  },
  navigationJustifyCenter: {
    justifyContent: "center",
  },
  navigationJustifyRight: {
    justifyContent: "flex-end",
  },
  action: {
    gridColumnEnd: 'action',
    gridColumnStart: 'action',
    gridRowEnd: 'action',
    gridRowStart: 'action',
    gap: gap["md"],
    alignItems: "center",
    display: {
      // eslint-disable-next-line @stylexjs/valid-styles
      default: "var(--visibility, none)",
      [containerBreakpoints.sm]: "flex",
      ":is([data-always-visible])": "flex",
    },
  },
  hamburgerButton: {
    gridColumnEnd: 'hamburger',
    gridColumnStart: 'hamburger',
    gridRowEnd: 'hamburger',
    gridRowStart: 'hamburger',
    alignItems: "center",
    display: {
      default: "flex",
      [containerBreakpoints.sm]: "none",
    },
  },
  link: {
    "--underline-opacity": {
      default: 0,
      ":is([aria-current=page])": 1,
      ":is([aria-expanded=true])": 1,
      ":is([data-active])": 1,
      ":is([data-breadcrumb] *)": 0,
      ":is([data-hovered])": 1,
      ":is([data-status=active])": 1,
    },
    gap: gap["md"],
    textDecoration: "none",
    alignItems: "center",
    color: {
      default: primaryColor.text2,
      ":is([data-breadcrumb] *)": uiColor.text1,
      ":is([data-breadcrumb][data-current] *)": uiColor.text2,
    },
    cursor: "pointer",
    display: {
      default: "flex",
      [containerBreakpoints.sm]: "inline-flex",
    },
    fontFamily: fontFamily["sans"],
    fontWeight: fontWeight["normal"],
    position: "relative",
    width: {
      default: "100%",
      [containerBreakpoints.sm]: "auto",
    },

    // eslint-disable-next-line @stylexjs/no-legacy-contextual-styles, @stylexjs/valid-styles
    ":is(*) svg": {
      height: "1.2em",
      width: "1.2em",
    },
  },
  linkContent: {
    position: "relative",

    "::after": {
      backgroundColor: "currentColor",
      content: '""',
      display: "block",
      opacity: "var(--underline-opacity)",
      pointerEvents: "none",
      position: "absolute",
      bottom: `calc(${verticalSpace["xxs"]} * -1)`,
      height: "2px",
      left: 0,
      right: 0,
      width: "100%",
    },
  },
});

// =============================================================================
// Mobile Menu Context
// =============================================================================

interface MobileMenuContextValue {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  closeMenu: () => void;
}

const MobileMenuContext = React.createContext<MobileMenuContextValue | null>(
  null,
);

function useMobileMenu() {
  const context = use(MobileMenuContext);
  if (!context) {
    throw new Error("useMobileMenu must be used within Navbar");
  }
  return context;
}

// Define subcomponents first so they can be referenced in Navbar
export interface NavbarLogoProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {
  /**
   * Whether the logo link is currently active.
   */
  isActive?: boolean;
  /**
   * Optional logo image source. If provided, displays the image instead of text.
   */
  logoSrc?: string | null;
}

/**
 * NavbarLogo component for displaying the logo in the navbar.
 */
export const NavbarLogo = ({
  style,
  isActive,
  logoSrc,
  ...props
}: NavbarLogoProps) => {
  return (
    <div
      {...props}
      data-active={isActive}
      {...stylex.props(styles.logo, style)}
    >
      {logoSrc ? (
        <img src={logoSrc} alt="kich" {...stylex.props(styles.logoImage)} />
      ) : (
        <span {...stylex.props(styles.logoContent)}>{props.children}</span>
      )}
    </div>
  );
};

export interface NavbarNavigationProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {
  /**
   * Justify content alignment for the navigation items.
   * @default "left"
   */
  justify?: "left" | "right" | "center";
}

/**
 * NavbarNavigation component for displaying navigation items.
 * On mobile, this is hidden and shown in the hamburger menu.
 */
export const NavbarNavigation = ({
  style,
  justify = "left",
  ...props
}: NavbarNavigationProps) => {
  return (
    <div
      {...props}
      {...stylex.props(
        styles.navigation,
        justify === "left" && styles.navigationJustifyLeft,
        justify === "center" && styles.navigationJustifyCenter,
        justify === "right" && styles.navigationJustifyRight,
        style,
      )}
    >
      {props.children}
    </div>
  );
};

export interface NavbarActionProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {
  /**
   * Whether the action should be always visible on mobile.
   * @default false
   */
  alwaysVisible?: boolean;
}

/**
 * NavbarAction component for displaying action buttons.
 * On mobile, this is hidden and shown in the hamburger menu.
 */
export const NavbarAction = ({
  style,
  alwaysVisible = false,
  ...props
}: NavbarActionProps) => {
  return (
    <div
      {...props}
      data-navbar-action={true}
      data-always-visible={alwaysVisible || undefined}
      {...stylex.props(styles.action, style)}
    >
      {props.children}
    </div>
  );
};

export interface NavbarLinkProps extends StyleXComponentProps<LinkProps> {
  isActive?: boolean;
}

export function NavbarLink({ style, isActive, ...props }: NavbarLinkProps) {
  const { closeMenu } = useMobileMenu();

  return (
    <Link
      data-active={isActive || undefined}
      {...props}
      {...stylex.props(styles.link, style)}
      onPress={(e) => {
        closeMenu();
        props.onPress?.(e);
      }}
      onClick={(e) => {
        // Also handle native click events as a fallback
        closeMenu();
        props.onClick?.(e);
      }}
    >
      <span {...stylex.props(styles.linkContent)}>
        {typeof props.children === "function"
          ? props.children(
              {} as Parameters<NonNullable<typeof props.children>>[0],
            )
          : props.children}
      </span>
    </Link>
  );
}

export interface NavbarProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {
  size?: Size;
}

/**
 * Navbar component that provides a responsive navigation bar with logo, navigation, and action sections.
 * On mobile, navigation and actions are automatically contained in a hamburger menu overlay.
 */
export const Navbar = ({
  style,
  size: sizeProp,
  children,
  ...props
}: NavbarProps) => {
  const size = sizeProp || use(SizeContext);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navRef = React.useRef<HTMLElement>(null);

  const closeMenu = React.useCallback(() => {
    setIsMobileMenuOpen(false);
  }, []);

  const mobileMenuContextValue = React.useMemo<MobileMenuContextValue>(
    () => ({
      isOpen: isMobileMenuOpen,
      setIsOpen: setIsMobileMenuOpen,
      closeMenu,
    }),
    [isMobileMenuOpen, closeMenu],
  );

  // Use effect to handle click events via event delegation
  React.useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const handleClick = (e: MouseEvent) => {
      // Close menu when any link or button inside navbar is clicked
      // Exclude the hamburger button (it toggles the menu instead)
      const target = e.target as HTMLElement;
      const link = target.closest("a, button");
      const hamburgerButton = target.closest('[aria-label="Open menu"]');
      if (link && link !== nav && !hamburgerButton) {
        closeMenu();
      }
    };

    nav.addEventListener("click", handleClick);
    return () => {
      nav.removeEventListener("click", handleClick);
    };
  }, [closeMenu]);

  return (
    <SizeContext value={size}>
      <MobileMenuContext value={mobileMenuContextValue}>
        <div {...props} {...stylex.props(styles.wrapper, style)}>
          <nav
            ref={navRef}
            data-navbar-open={isMobileMenuOpen || undefined}
            {...stylex.props(styles.navbar, ui.bg, style)}
          >
            {children}
            <Separator
              style={styles.separator as unknown as stylex.StyleXStyles}
            />
            <IconButton
              size="lg"
              aria-label="Open menu"
              variant="tertiary"
              style={styles.hamburgerButton}
              onPress={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X /> : <Menu />}
            </IconButton>
          </nav>
        </div>
      </MobileMenuContext>
    </SizeContext>
  );
};
