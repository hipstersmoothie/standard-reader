"use client";

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@standard-reader/design-system/button";
import { DirectionalIcon } from "@standard-reader/design-system/directional-icon";
import { Flex } from "@standard-reader/design-system/flex";
import { IconButton } from "@standard-reader/design-system/icon-button";
import { Menu, MenuItem, SubMenu } from "@standard-reader/design-system/menu";
import { useAnimatedBottomNav } from "@standard-reader/design-system/navbar/useAnimatedBottomNav";
import { useAnimatedNavbar } from "@standard-reader/design-system/navbar/useAnimatedNavbar";
import { Skeleton } from "@standard-reader/design-system/skeleton";
import { SkipLink } from "@standard-reader/design-system/skip-link";
import { animationDuration } from "@standard-reader/design-system/theme/animations.stylex";
import {
  focusColor,
  primaryColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  size,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import { ToastRegion } from "@standard-reader/design-system/toast";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import {
  ArrowDownWideNarrow,
  ArrowLeft,
  Bookmark,
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  Compass,
  FolderPlus,
  GripVertical,
  Home,
  Layers,
  Newspaper,
  Plus,
  Search,
  Settings,
} from "lucide-react";
import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useFocusRing } from "react-aria";

import type { SubscriptionList } from "#/integrations/tanstack-query/api-lists.functions";
import { listApi } from "#/integrations/tanstack-query/api-lists.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import {
  listsQueryOptions,
  savedListsQueryOptions,
  sidebarQueryOptions,
} from "#/integrations/tanstack-query/shell-queries";
import { formatSidebarUnreadCount } from "#/lib/format-count";
import { PageReaderProvider } from "#/lib/page-reader/page-reader-provider";
import type { SidebarNavId } from "#/lib/sidebar-nav";
import { useFormatters } from "#/lib/use-formatters";
import { useCompactNav } from "#/lib/use-media-query";
import { useOnlineStatus } from "#/lib/use-online-status";

import type {
  FollowingPublication,
  FollowingUser,
} from "../../integrations/tanstack-query/api-feed.functions";
import { FeedbackDialog } from "../feedback/feedback-dialog";
import { NavbarAuth } from "../NavbarAuth";
import { SiteFooter } from "../site-footer";
import { AddPublicationModal } from "./add-publication-modal";
import { AtstoreReviewPrompt } from "./atstore-review-prompt";
import { BrandWordmark } from "./brand-wordmark";
import { LanguageHintPrompt } from "./language-hint-prompt";
import { ListEditModal } from "./list-edit-modal";
import { PageReaderBar } from "./page-reader-bar";
import { PublicationThemeScope } from "./publication-theme-scope";
import { PullToRefreshLane } from "./pull-to-refresh";
import {
  SelectionDockProvider,
  useSelectionDock,
} from "./selection-dock-context";
import type { SubscriptionListGroup } from "./subscriptions-sheet";
import {
  SubscriptionsSheet,
  SubscriptionsSwitcher,
} from "./subscriptions-sheet";
import type { FlatSubscription } from "./subscriptions-tree";
import { SubscriptionsTree } from "./subscriptions-tree";
import {
  orderGroups,
  orderSubscriptions,
  useSidebarPref,
} from "./use-sidebar-pref";
import { useSubscriptionsTree } from "./use-subscriptions-tree";

const DESKTOP = "@media (min-width: 60rem)";

const styles = stylex.create({
  shell: {
    // Fill the viewport when content is short, grow past it when tall — the
    // document is the scroll container now. `flex-start` keeps children pinned
    // to the top so the sticky sidebar stays viewport-tall in a taller shell
    // instead of stretching to the full document height.
    alignItems: "flex-start",
    display: "flex",
    flexDirection: "row",
    minHeight: stylex.firstThatWorks("100dvh", "100vh"),
  },
  sidebar: {
    // The sidebar itself doesn't scroll; its inner region does, so the foot
    // stays pinned outside the scrollport and content never hides behind it.
    overflow: "hidden",
    backgroundColor: uiColor.bgSubtle,
    borderInlineEndColor: uiColor.border1,
    borderInlineEndStyle: "solid",
    borderInlineEndWidth: 1,
    boxSizing: "border-box",
    display: { [DESKTOP]: "flex", default: "none" },
    flexDirection: "column",
    flexShrink: 0,
    position: "sticky",
    height: stylex.firstThatWorks("100dvh", "100vh"),
    top: 0,
    // rem, not px: the appearance text-size dial scales the root font size, and
    // a sidebar pinned in px would keep its width while the labels inside it
    // grew (264px at the default root size).
    width: "16.5rem",
  },
  sidebarScroll: {
    overscrollBehavior: "contain",
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    minHeight: 0,
    overflowY: "auto",
    paddingTop: verticalSpace["8xl"],
  },
  brandLink: {
    borderRadius: radius.sm,
    outline: {
      default: "none",
      ":is([data-focus-visible])": `2px solid ${focusColor.ring}`,
    },
    textDecoration: "none",
    // Hug the wordmark so the focus ring is tight to it, not a full-width box
    // wrapping empty space.
    alignItems: "center",
    display: "inline-flex",
    outlineOffset: "2px",
    paddingInlineEnd: horizontalSpace.xs,
    paddingInlineStart: horizontalSpace.xs,
    paddingBottom: verticalSpace.xxs,
    paddingTop: verticalSpace.xxs,
    // Anchors the offline badge to the wordmark.
    position: "relative",
    width: "fit-content",
  },
  offlineBadge: {
    borderRadius: radius.full,
    backgroundColor: uiColor.text1,
    color: uiColor.bg,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.wide,
    lineHeight: 1,
    // Superscripted off the wordmark's top-right corner: absolute so it never
    // reflows the brand, and clear of the letterforms so it annotates the logo
    // instead of covering it. Tucked back over the corner by a hair, which is
    // empty space above the cap height.
    insetBlockStart: `calc(-1 * ${verticalSpace.xs})`,
    insetInlineStart: "100%",
    marginInlineStart: `calc(-1 * ${horizontalSpace.xxs})`,
    paddingBlock: verticalSpace.xxs,
    paddingInline: horizontalSpace.xs,
    pointerEvents: "none",
    position: "absolute",
    textTransform: "lowercase",
    whiteSpace: "nowrap",
  },
  brandSidebar: {
    // Left-align in the sidebar's column flow; only relevant here — in the
    // mobile bar's row flow this would pin the wordmark to the top instead of
    // letting it center vertically.
    alignSelf: "flex-start",
    // Margin, not padding — the separation below the logo must sit outside the
    // focusable box so the focus ring hugs the wordmark.
    marginBottom: verticalSpace["7xl"],
  },
  nav: {
    columnGap: gap.xxs,
    display: "flex",
    flexDirection: "column",
    rowGap: gap.xxs,
  },
  navItem: {
    borderRadius: radius.sm,
    // Inset ring: the sidebar scroll container clips an outset outline at its
    // content edge, so draw the ring inside the row where it can't be cut off.
    outline: {
      default: "none",
      ":is([data-focus-visible])": `2px solid ${focusColor.ring}`,
    },
    textDecoration: "none",
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": uiColor.component2,
    },
    color: uiColor.text2,
    columnGap: gap.xl,
    display: "flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    outlineOffset: "-2px",
    paddingInlineEnd: horizontalSpace.lg,
    paddingInlineStart: horizontalSpace.lg,
    rowGap: gap.xl,
    paddingBottom: verticalSpace.lg,
    paddingTop: verticalSpace.lg,
  },
  navItemActive: {
    backgroundColor: primaryColor.component3,
    color: primaryColor.text2,
  },
  navLabel: {
    flexBasis: "0%",
    flexGrow: "1",
    flexShrink: "1",
    minWidth: 0,
  },
  count: {
    borderRadius: radius.full,
    backgroundColor: primaryColor.component3,
    color: primaryColor.text2,
    fontFamily: fontFamily.mono,
    fontSize: "0.7rem",
    paddingInlineEnd: horizontalSpace.md,
    paddingInlineStart: horizontalSpace.md,
    paddingBottom: verticalSpace.none,
    paddingTop: verticalSpace.none,
  },
  sideLabel: {
    alignItems: "center",
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: "0.65rem",
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.widest,
    paddingInlineEnd: horizontalSpace.lg,
    paddingInlineStart: horizontalSpace.lg,
    textTransform: "uppercase",
    paddingBottom: verticalSpace.md,
    paddingTop: verticalSpace["3xl"],
  },
  /** Inherits the label's type; only the hover/current affordance is its own. */
  sideLabelLink: {
    borderRadius: radius.sm,
    color: {
      default: "inherit",
      ":hover": uiColor.text2,
    },
    textDecorationLine: {
      default: "none",
      ":hover": "underline",
    },
    textUnderlineOffset: "0.3em",
  },
  sideLabelLinkActive: {
    color: primaryColor.text2,
  },
  /** Header icons: muted until the header row is hovered. */
  headerIcon: {
    // No divider between grouped icon buttons.
    borderInlineEndColor: "transparent",
    color: {
      default: uiColor.text1,
      ":is([data-sidebar-label]:hover *)": uiColor.text2,
    },
  },
  /** Wraps whichever of skeleton / empty-note / tree is currently showing;
   * the tree itself (`SubscriptionsTree`) applies this same flex-column
   * layout to its own root, so this only matters for the other two cases. */
  followList: {
    columnGap: gap.none,
    display: "flex",
    flexDirection: "column",
    rowGap: gap.none,
  },
  emptyNote: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    fontStyle: "italic",
    paddingInlineEnd: horizontalSpace.lg,
    paddingInlineStart: horizontalSpace.lg,
  },
  subscriptionsLoading: {
    gap: gap.sm,
    display: "flex",
    flexDirection: "column",
    paddingInlineEnd: horizontalSpace.lg,
    paddingInlineStart: horizontalSpace.lg,
    minHeight: spacing["24"],
  },
  foot: {
    backgroundColor: uiColor.bgSubtle,
    // A fixed footer pinned below the scroll region (not sticky/overlapping),
    // so list content can never hide behind it.
    columnGap: gap.xl,
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    rowGap: gap.xl,
    paddingBottom: verticalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
  },
  mobileDetailBar: {
    alignItems: "center",
    backgroundColor: uiColor.bg,
    columnGap: gap.lg,
    display: { [DESKTOP]: "none", default: "grid" },
    flexShrink: 0,
    gridTemplateColumns: `${size.lg} 1fr ${size.lg}`,
    justifyContent: "space-between",
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    // Only bites once `useAnimatedNavbar` makes the bar sticky: it then has to
    // clear positioned page content (cards, topic chips) but stay under the
    // floating dock — and under a view's own sticky header (article-view's
    // `stickyChrome`, at 20), which pins flush against this bar's bottom edge.
    // The two abut exactly, so on a fractional device-pixel grid the seam can
    // round either way; losing the tie means a stray half-pixel of this bar
    // hides behind that header instead of clipping its top edge.
    zIndex: 15,
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: verticalSpace.xl,
    paddingTop: `calc(env(safe-area-inset-top, 0px) + ${verticalSpace.xl})`,
  },
  mobileDetailTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    textAlign: "center",
  },
  mobileDetailSpacer: {
    width: size.lg,
  },
  main: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    // Focused only as the skip-link landing target (tabIndex={-1}); a ring
    // around the whole content region would be noise, not a wayfinding cue.
    outlineStyle: "none",
    position: "relative",
    // Keep the content column at least viewport-tall so the footer sits at the
    // bottom of the screen on short pages instead of floating mid-viewport.
    minHeight: stylex.firstThatWorks("100dvh", "100vh"),
    minWidth: 0,
  },
  scroller: {
    // Content column — no longer a scroll container (the document scrolls).
    // `overflow-x: clip` still contains any wide child without opening a
    // horizontal scrollport.
    display: "flex",
    flexDirection: "column",
    flexGrow: "1",
    minWidth: 0,
    // …except for views that own a sticky header. A horizontal clip anywhere
    // above a sticky element makes WebKit re-snap the clip rect to whole device
    // pixels each frame while the page scrolls at fractional (trackpad /
    // momentum) offsets, so the header jitters ~1px and leaks a sliver of
    // content along its top edge. Those views mark themselves with
    // `data-unclipped-sticky` and contain their own wide content instead.
    overflowX: {
      default: "clip",
      ":has([data-unclipped-sticky])": "visible",
    },
  },
  mobileBar: {
    alignItems: "center",
    backgroundColor: uiColor.bg,
    display: { [DESKTOP]: "none", default: "flex" },
    flexShrink: 0,
    justifyContent: "space-between",
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    // See `mobileDetailBar` — matters only while the bar is stuck to the top.
    zIndex: 15,
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: verticalSpace.xl,
    paddingTop: `calc(env(safe-area-inset-top, 0px) + ${verticalSpace.xl})`,
  },
  mobileBarActions: {
    alignItems: "center",
    columnGap: gap.lg,
    display: "flex",
    flexShrink: 0,
    rowGap: gap.lg,
  },
  // Floating dock anchored to the bottom of the content column. It stacks the
  // page-reader bar above the bottom navigation (column, bottom-anchored) so the
  // reader always floats just above the nav — and, since the nav is hidden at
  // desktop widths, drops to the same bottom offset there.
  dock: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    insetInlineEnd: 0,
    insetInlineStart: { [DESKTOP]: "264px", default: 0 },
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    pointerEvents: "none",
    // Nothing writes to this element. The bottom nav's hide-on-scroll animation
    // shifts `dockStack` inside it instead: a transform here would promote the
    // viewport-pinned dock to a composited layer, and iOS Safari answers that by
    // holding its toolbars open and shortening the dynamic viewport — the page
    // then stops short of the bottom edge with a dead strip below the content.
    // Pinned to the viewport (the document is the scroll container now, so an
    // absolute dock would ride to the bottom of the whole article instead of
    // floating above the fold). Offset by the sidebar width on desktop so the
    // floating card stays centered over the content column.
    position: "fixed",
    zIndex: 30,
    // Sit a floor of 16px above the bottom, or hug the home-indicator safe area
    // where that's larger. On iOS (standalone PWA) the ~34px safe-area inset
    // wins, so the pill hugs the home indicator with no extra float. Where there
    // is no safe area (Android, desktop) the inset resolves to 0 and the 16px
    // floor keeps the pill off the very bottom edge. `max()` — not env()'s
    // second arg, which only applies when env() is entirely unsupported.
    bottom: `max(env(safe-area-inset-bottom, 0px), ${verticalSpace["3xl"]})`,
  },
  // The dock's contents, in normal flow. This is what the hide-on-scroll
  // animation transforms — see the note on `dock`. It owns the row gap because
  // the animation measures the bar's footprint from it. Untouched on iOS, where
  // the bar fades out where it stands instead of sliding away.
  dockStack: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    pointerEvents: "none",
    rowGap: gap.lg,
    width: "100%",
  },
  bottomNav: {
    display: { [DESKTOP]: "none", default: "flex" },
    justifyContent: "center",
    pointerEvents: "none",
  },
  // Same footprint as `bottomNav` so the selection toolbar lands exactly where
  // the nav pill was, with no shift in the reader bar stacked above it.
  selectionSlot: {
    display: { [DESKTOP]: "none", default: "flex" },
    justifyContent: "center",
    pointerEvents: "none",
  },
  // Layered, soft floating shadow on boxShadow is lifted from the prototype.
  fabBar: {
    padding: spacing["1.5"],
    borderColor: uiColor.border1,
    borderRadius: radius.full,
    borderStyle: "solid",
    borderWidth: 1,
    alignItems: "center",
    backgroundColor: uiColor.bg,
    boxShadow:
      "0 1px 1px oklch(0.3 0.03 60 / 0.04), 0 6px 18px -8px oklch(0.3 0.04 60 / 0.18), 0 14px 34px -18px oklch(0.3 0.05 60 / 0.22)",
    columnGap: gap.xxs,
    display: "flex",
    pointerEvents: "auto",
    position: "relative",
    rowGap: gap.xxs,
  },
  fabIndicator: {
    borderRadius: radius.full,
    backgroundColor: primaryColor.solid1,
    boxShadow: `0 2px 8px -2px ${primaryColor.solid1}`,
    pointerEvents: "none",
    position: "absolute",
    zIndex: 0,
    height: spacing["12"],
    // Deliberately physical: the pill is positioned by an inline
    // `translateX(indicator.left)` measured from `el.offsetLeft`, which is
    // always relative to the left edge even in RTL. Pairing that with a
    // logical `insetInlineStart` would anchor right and then translate right
    // again, putting the indicator off-screen in RTL.
    left: 0,
    top: spacing["1.5"],
  },
  fabIndicatorGlide: {
    transitionDuration: animationDuration.verySlow,
    transitionProperty: "transform, width, opacity",
    transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)",
  },
  fabIndicatorHidden: {
    opacity: 0,
  },
  bottomItem: {
    borderWidth: 0,
    textDecoration: "none",
    alignItems: "center",
    backgroundColor: "transparent",
    color: uiColor.text1,
    cursor: "pointer",
    display: "flex",
    flexGrow: 0,
    flexShrink: 0,
    justifyContent: "center",
    paddingInlineEnd: horizontalSpace.xl,
    paddingInlineStart: horizontalSpace.xl,
    position: "relative",
    transitionDuration: animationDuration.verySlow,
    transitionProperty: "color",
    transitionTimingFunction: "ease",
    zIndex: 1,
    height: spacing["12"],
  },
  bottomItemActive: { color: primaryColor.textContrast },
  bottomIconWrap: {
    placeItems: "center",
    display: "grid",
    flexGrow: 0,
    flexShrink: 0,
    position: "relative",
  },
  bottomLabel: {
    overflow: "hidden",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.wide,
    marginInlineStart: 0,
    opacity: 0,
    transitionDuration: animationDuration.slow,
    transitionProperty: "opacity",
    transitionTimingFunction: "ease",
    whiteSpace: "nowrap",
    maxWidth: 0,
  },
  bottomLabelActive: {
    marginInlineStart: horizontalSpace.md,
    opacity: 1,
    maxWidth: spacing["24"],
  },
  unreadDot: {
    borderRadius: radius.full,
    backgroundColor: primaryColor.solid1,
    boxShadow: `0 0 0 2px ${uiColor.bg}`,
    insetInlineEnd: `calc(-1 * ${spacing["1"]})`,
    position: "absolute",
    height: spacing["2"],
    top: `calc(-1 * ${spacing["1"]})`,
    width: spacing["2"],
  },
  unreadDotActive: {
    backgroundColor: uiColor.bg,
    boxShadow: `0 0 0 2px ${primaryColor.solid1}`,
  },
  addTrigger: {
    width: "100%",
  },
});

interface NavLink {
  /** Stable id used by "Customize sidebar" to hide the item. */
  id: SidebarNavId;
  to: string;
  label: MessageDescriptor;
  icon: React.ReactNode;
}

const NAV: Array<NavLink> = [
  { id: "home", to: "/", label: msg`Home`, icon: <Home size={18} /> },
  {
    id: "latest",
    to: "/latest",
    label: msg`Latest`,
    icon: <Newspaper size={18} />,
  },
  {
    id: "discover",
    to: "/discover",
    label: msg`Discover`,
    icon: <Compass size={18} />,
  },
  {
    id: "search",
    to: "/search",
    label: msg`Search`,
    icon: <Search size={18} />,
  },
];

const SAVED_NAV: NavLink = {
  id: "saved",
  to: "/saved",
  label: msg`Saved for later`,
  icon: <Bookmark size={18} />,
};

/** Shorter label for the bottom nav, where horizontal room is tight. */
const SAVED_SHORT_LABEL = msg`Saved`;

const COLLECTIONS_NAV: NavLink = {
  id: "collections",
  to: "/collections",
  label: msg`Collections`,
  icon: <Layers size={18} />,
};

/**
 * Nav items that need the network, and are hidden while offline.
 *
 * Offline sync stores the reader's own reading — unread, their backlog, Saved,
 * Subscriptions — so Home, Latest and Saved keep working. These three are
 * different in kind: Discover and Search query the whole network for things the
 * reader has by definition not read, and Collections is editable. Leaving them
 * in the nav offers three taps that can only end in an error page, so they come
 * out until the connection is back.
 */
const NETWORK_ONLY_NAV: ReadonlySet<SidebarNavId> = new Set([
  "discover",
  "search",
  "collections",
]);

/**
 * Primary nav links; inserts Saved + Collections after Latest when the reader is
 * signed in (both are personal, repo-backed surfaces).
 */
function navWithSaved(signedIn: boolean, online: boolean): Array<NavLink> {
  const items = NAV.flatMap((item) => {
    if (item.to !== "/latest" || !signedIn) return [item];
    return [item, SAVED_NAV, COLLECTIONS_NAV];
  });
  return online
    ? items
    : items.filter((item) => !NETWORK_ONLY_NAV.has(item.id));
}

/**
 * Props to spread onto a plain anchor (e.g. a TanStack Router `<Link>`) to get
 * react-aria's keyboard-only focus detection: `focusProps` wires the listeners
 * and `data-focus-visible` is set only on keyboard focus. Style the ring via
 * `":is([data-focus-visible])"` — never the `:focus-visible` pseudo, so focus
 * rings stay consistent with the react-aria design system.
 */
function useFocusRingProps() {
  const { isFocusVisible, focusProps } = useFocusRing();
  return { ...focusProps, "data-focus-visible": isFocusVisible || undefined };
}

function SidebarNavItem({
  to,
  label,
  icon,
  count,
  compactCount = false,
}: NavLink & { count?: number | null; compactCount?: boolean }) {
  const { i18n } = useLingui();
  const fmt = useFormatters();
  const focusRingProps = useFocusRingProps();
  return (
    <Link
      to={to}
      activeOptions={to === "/" ? { exact: true } : undefined}
      {...focusRingProps}
      {...stylex.props(styles.navItem)}
      activeProps={stylex.props(styles.navItem, styles.navItemActive)}
    >
      {icon}
      <span {...stylex.props(styles.navLabel)}>{i18n._(label)}</span>
      {count != null && count > 0 ? (
        <span {...stylex.props(styles.count)}>
          {compactCount ? formatSidebarUnreadCount(fmt, count) : count}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * The "Subscriptions" section heading, which doubles as the entry point to the
 * `/subscriptions` directory. Signed-in only — a guest has nothing to manage,
 * and the route bounces them to login.
 */
function SubscriptionsHeading() {
  const focusRingProps = useFocusRingProps();
  return (
    <Link
      to="/subscriptions"
      {...focusRingProps}
      {...stylex.props(styles.sideLabelLink)}
      activeProps={stylex.props(
        styles.sideLabelLink,
        styles.sideLabelLinkActive,
      )}
    >
      <Trans>Subscriptions</Trans>
    </Link>
  );
}

const BottomNavItem = forwardRef<
  HTMLAnchorElement,
  NavLink & { isActive: boolean; showBadgeDot?: boolean }
>(function BottomNavItemRender(
  { to, label, icon, isActive, showBadgeDot },
  ref,
) {
  const { i18n } = useLingui();
  const labelText = i18n._(label);
  return (
    <Link
      ref={ref}
      to={to}
      aria-label={labelText}
      {...stylex.props(styles.bottomItem, isActive && styles.bottomItemActive)}
    >
      <span {...stylex.props(styles.bottomIconWrap)}>
        {icon}
        {showBadgeDot ? (
          <span
            {...stylex.props(
              styles.unreadDot,
              isActive && styles.unreadDotActive,
            )}
          />
        ) : null}
      </span>
      <span
        {...stylex.props(
          styles.bottomLabel,
          isActive && styles.bottomLabelActive,
        )}
      >
        {labelText}
      </span>
    </Link>
  );
});

function navItemActive(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

function BottomNav({
  items,
  hasUnread,
  stackRef,
}: {
  items: Array<NavLink>;
  hasUnread: boolean;
  stackRef: React.RefObject<HTMLDivElement | null>;
}) {
  // Mirror of the mobile top bar: scrolling down slides the pill out through the
  // bottom edge, scrolling up brings it back, so an article gets the full height
  // of the screen while the reader is moving through it. The hook only runs on
  // the compact layout, where this nav is the one that exists — at desktop
  // widths the sidebar replaces it and the pill is `display: none`.
  const compactNav = useCompactNav();
  const { navBarProps } = useAnimatedBottomNav({
    enabled: compactNav,
    stackTarget: stackRef,
  });
  const pathname = useRouterState({
    select: (s: { location: { pathname: string } }) => s.location.pathname,
  });
  const activeIndex = items.findIndex((item) =>
    navItemActive(pathname, item.to),
  );
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
  } | null>(null);
  // Glide is disabled for the first placement so the pill appears in position
  // instantly, then enabled so subsequent route changes animate the slide.
  const [glide, setGlide] = useState(false);

  // Article / publication routes have no matching tab (activeIndex < 0); the
  // indicator keeps its last position but fades out (see fabIndicatorHidden).
  useLayoutEffect(() => {
    if (activeIndex === -1) return;
    const el = itemRefs.current[activeIndex];
    if (!el) return;
    setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    const id = requestAnimationFrame(() => setGlide(true));
    return () => cancelAnimationFrame(id);
  }, [activeIndex]);

  useEffect(() => {
    const onResize = () => {
      if (activeIndex === -1) return;
      const el = itemRefs.current[activeIndex];
      if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [activeIndex]);

  const indicatorProps = stylex.props(
    styles.fabIndicator,
    glide && styles.fabIndicatorGlide,
    activeIndex === -1 && styles.fabIndicatorHidden,
  );

  return (
    <nav {...navBarProps} {...stylex.props(styles.bottomNav)}>
      <div {...stylex.props(styles.fabBar)}>
        {indicator ? (
          <span
            className={indicatorProps.className}
            style={{
              ...indicatorProps.style,
              transform: `translateX(${indicator.left}px)`,
              width: indicator.width,
            }}
          />
        ) : null}
        {items.map((item, i) => (
          <BottomNavItem
            key={item.to}
            {...item}
            label={item.to === "/saved" ? SAVED_SHORT_LABEL : item.label}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            isActive={i === activeIndex}
            showBadgeDot={item.to === "/latest" ? hasUnread : false}
          />
        ))}
      </div>
    </nav>
  );
}

/**
 * The bottom of the dock: normally the nav pill, but a text selection takes the
 * slot over (see `selection-dock-context`) so the reader's selection toolbar
 * sits well clear of the OS selection callout.
 */
function BottomNavSlot({
  items,
  hasUnread,
  stackRef,
}: {
  items: Array<NavLink>;
  hasUnread: boolean;
  stackRef: React.RefObject<HTMLDivElement | null>;
}) {
  const dock = useSelectionDock();

  // The selection toolbar is a response to something the reader just did, so it
  // never hides on scroll. Unmounting `BottomNav` also tears down the hook,
  // which drops the stack back to its resting offset for the toolbar.
  if (dock?.isActive) {
    return <div {...stylex.props(styles.selectionSlot)} ref={dock.setSlot} />;
  }

  return <BottomNav items={items} hasUnread={hasUnread} stackRef={stackRef} />;
}

function Brand({
  style,
  to = "/",
}: {
  style?: stylex.StyleXStyles;
  to?: "/" | "/about";
}) {
  const { t } = useLingui();
  const focusRingProps = useFocusRingProps();
  const online = useOnlineStatus();
  return (
    <Link
      to={to}
      {...focusRingProps}
      {...stylex.props(styles.brandLink, style)}
    >
      <BrandWordmark />
      {/* Pinned to the wordmark rather than shown as a banner: the state is
          persistent, not an event, and a dismissible bar would either nag or
          disappear while still being true. */}
      {online ? null : (
        <span
          role="status"
          aria-label={t`You are offline`}
          {...stylex.props(styles.offlineBadge)}
        >
          <Trans>offline</Trans>
        </span>
      )}
    </Link>
  );
}

function MobileStaticPageBar({
  ref,
  title,
}: {
  ref?: React.Ref<HTMLDivElement>;
  title: string;
}) {
  const { t } = useLingui();
  const router = useRouter();

  return (
    <div ref={ref} {...stylex.props(styles.mobileDetailBar)}>
      <IconButton
        aria-label={t`Back`}
        size="md"
        variant="tertiary"
        onPress={() => router.history.back()}
      >
        <DirectionalIcon as={ArrowLeft} size={18} />
      </IconButton>
      <span {...stylex.props(styles.mobileDetailTitle)}>{title}</span>
      <span aria-hidden {...stylex.props(styles.mobileDetailSpacer)} />
    </div>
  );
}

function SubscriptionsSkeleton() {
  const { t } = useLingui();
  return (
    <div
      {...stylex.props(styles.subscriptionsLoading)}
      aria-busy="true"
      aria-label={t`Loading subscriptions`}
    >
      <Skeleton variant="rectangle" height={spacing["8"]} width="88%" />
      <Skeleton variant="rectangle" height={spacing["8"]} width="72%" />
      <Skeleton variant="rectangle" height={spacing["8"]} width="80%" />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useLingui();
  const pathname = useRouterState({
    select: (s: { location: { pathname: string } }) => s.location.pathname,
  });
  // Scroll restoration is handled by the router's built-in window restoration
  // (`scrollRestoration: true`) now that the document itself is the scroller.
  const onAbout = pathname === "/about";
  const onPrivacyExtension = pathname === "/privacy/extension";
  const onPrivacy = pathname === "/privacy" || onPrivacyExtension;
  const onTerms = pathname === "/terms";
  const onLabelers = pathname === "/labelers";
  const onSettings = pathname === "/settings";
  const staticPageTitle = onAbout
    ? t`About`
    : onPrivacyExtension
      ? t`Extension privacy`
      : onPrivacy
        ? t`Privacy`
        : onTerms
          ? t`Terms`
          : onLabelers
            ? t`Labelers`
            : onSettings
              ? t`Settings`
              : null;
  const { data: sidebar, isPending: sidebarPending } = useQuery(
    sidebarQueryOptions(),
  );
  const { data: session } = useQuery(user.getSessionQueryOptions);
  const signedIn = Boolean(session?.user);
  const following = sidebar?.following ?? [];
  const followingUsers = sidebar?.followingUsers ?? [];
  const unreadCount = sidebar?.unreadCount ?? null;
  const hasUnread = unreadCount != null && unreadCount > 0;
  const online = useOnlineStatus();
  const primaryNav = navWithSaved(signedIn, online);
  const [subsSheetOpen, setSubsSheetOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  // The mobile top bar scrolls away with the page, then slides back in as soon
  // as you scroll up. The sidebar replaces it at desktop widths, so the hook
  // only runs where the bar exists.
  const compactNav = useCompactNav();
  // `main` carries the offset the bar publishes, so anything inside it that
  // pins its own sticky header (an open article pins a toolbar of nav controls)
  // can sit against the bar's bottom edge.
  const mainRef = useRef<HTMLElement>(null);
  const { navBarProps: mobileBarProps, sentinel: mobileBarSentinel } =
    useAnimatedNavbar({ enabled: compactNav, offsetTarget: mainRef });
  // The bottom nav slides down out of the dock as you scroll; the dock's inner
  // stack follows it partway so the page-reader transport above drops into the
  // vacated slot rather than hovering over a gap. The stack, never the dock —
  // the dock is pinned to the viewport and must stay untransformed.
  const dockStackRef = useRef<HTMLDivElement>(null);
  // The content column, which pull-to-refresh drags down with the finger. The
  // top bar and the dock stay put — only the page the gesture is refreshing
  // moves, the way it does on a phone.
  const contentRef = useRef<HTMLDivElement>(null);

  const { data: listsData, isPending: listsPending } = useQuery({
    ...listsQueryOptions(),
    enabled: signedIn,
  });
  const lists = listsData ?? [];
  const { data: savedListsData, isPending: savedListsPending } = useQuery({
    ...savedListsQueryOptions(),
    enabled: signedIn,
  });
  const savedLists = savedListsData ?? [];
  const shellSubscriptionsLoading =
    signedIn &&
    (sidebarPending ||
      listsPending ||
      savedListsPending ||
      sidebar === undefined ||
      listsData === undefined ||
      savedListsData === undefined);
  const followingByUri = new Map(following.map((pub) => [pub.uri, pub]));
  const followingUsersByDid = new Map(
    followingUsers.map((person) => [person.did, person]),
  );
  // A list member only shows in its group if you also follow them — mirrors how
  // publications only render when they're in `following`.
  const groupUsers = (dids: Array<string>) =>
    dids
      .map((did) => followingUsersByDid.get(did))
      .filter((person): person is FollowingUser => person != null);
  // Own + saved lists as render-ready groups (shared by sidebar and sheet).
  // Only own lists (`editable`) can have their membership changed by dragging
  // in the sidebar tree — a saved list's members belong to someone else.
  const listGroups: Array<SubscriptionListGroup> = [
    ...lists.map((list) => ({
      key: list.uri,
      name: list.name,
      listUri: list.uri,
      rkey: list.rkey,
      editable: true,
      pubs: list.publications
        .map((uri) => followingByUri.get(uri))
        .filter((pub): pub is FollowingPublication => pub != null),
      users: groupUsers(list.users),
    })),
    ...savedLists.map((saved) => ({
      key: saved.list.uri,
      name: saved.owner.handle
        ? `${saved.list.name} · @${saved.owner.handle}`
        : saved.list.name,
      listUri: saved.list.uri,
      rkey: null,
      editable: false,
      pubs: saved.publications.map(
        (pub) => followingByUri.get(pub.uri) ?? { ...pub, unreadCount: 0 },
      ),
      users: groupUsers(saved.list.users),
    })),
  ];
  // Apply the reader's saved group order (own + saved interleaved); new lists
  // fall to the bottom until moved.
  const sidebarPref = useSidebarPref(signedIn);
  // "Customize sidebar" hides selected primary nav items (Subscriptions and its
  // list groups are never hideable). When the toggle is off, show everything.
  const visibleNav = sidebarPref.customizeNav
    ? primaryNav.filter((item) => !sidebarPref.isNavHidden(item.id))
    : primaryNav;
  const orderedGroups = orderGroups(listGroups, sidebarPref.order);
  // Groups have no per-group manual order, so "manual" has nothing to fall
  // back to — like "default", it leaves each list's own stored membership
  // order (and the reader's manual group arrangement above) untouched.
  // "alpha"/"unread"/"recent" apply the same ranking used for the flat rows
  // to each group's members and to the groups themselves.
  const groupSort =
    sidebarPref.subscriptionSort === "alpha" ||
    sidebarPref.subscriptionSort === "unread" ||
    sidebarPref.subscriptionSort === "recent"
      ? sidebarPref.subscriptionSort
      : "default";
  const displayGroups = orderSubscriptions(
    orderedGroups.map((group) => {
      const pubs = orderSubscriptions(
        group.pubs.map((pub) => ({
          ...pub,
          id: pub.uri,
          recentAt: pub.lastDocumentAt,
        })),
        groupSort,
      );
      const users = orderSubscriptions(
        group.users.map((person) => ({
          ...person,
          id: person.did,
          name: person.displayName || person.handle || person.did,
          unreadCount: person.unreadCount ?? 0,
          recentAt: person.followedAt,
        })),
        groupSort,
      );
      const groupUnreadCount =
        pubs.reduce((sum, pub) => sum + pub.unreadCount, 0) +
        users.reduce((sum, person) => sum + person.unreadCount, 0);
      // Members are already sorted most-recent-first within their own kind,
      // so the group's own recency is whichever kind's leading member is
      // newest — the same signal "recent" uses for the flat rows.
      const groupRecentAt = [pubs[0]?.recentAt, users[0]?.recentAt]
        .filter((value): value is string => value != null)
        .toSorted((a, b) => Date.parse(b) - Date.parse(a))[0];
      const members: Array<FlatSubscription> = [
        ...pubs.map(
          (pub): FlatSubscription => ({
            kind: "publication",
            pub,
            id: pub.uri,
            name: pub.name,
            unreadCount: pub.unreadCount,
            recentAt: pub.recentAt,
          }),
        ),
        ...users.map(
          (person): FlatSubscription => ({
            kind: "person",
            user: person,
            id: person.did,
            name: person.name,
            unreadCount: person.unreadCount,
            recentAt: person.recentAt,
          }),
        ),
      ];
      return {
        ...group,
        id: group.listUri,
        unreadCount: groupUnreadCount,
        recentAt: groupRecentAt ?? null,
        pubs,
        users,
        members,
      };
    }),
    groupSort,
  );
  const groupUris = orderedGroups.map((group) => group.listUri);
  const allCollapsed =
    groupUris.length > 0 &&
    groupUris.every((uri) => sidebarPref.isCollapsed(uri));
  const hasListGroups = listGroups.length > 0;
  // Subscriptions already shown in a list group stay out of the flat list.
  const groupedUris = new Set(
    listGroups.flatMap((group) => group.pubs.map((pub) => pub.uri)),
  );
  const groupedUserDids = new Set(
    listGroups.flatMap((group) => group.users.map((person) => person.did)),
  );
  // Publications owned by a followed user are represented by that person's row
  // (following a user subscribes to all their publications), so keep them out of
  // the flat list — unless the reader explicitly filed one into a list group.
  const followedUserDids = new Set(followingUsers.map((person) => person.did));
  const ungrouped = following.filter(
    (pub) => !groupedUris.has(pub.uri) && !followedUserDids.has(pub.did),
  );
  const ungroupedUsers = followingUsers.filter(
    (person) => !groupedUserDids.has(person.did),
  );
  const hasUngrouped = ungrouped.length > 0 || ungroupedUsers.length > 0;
  // "default" leaves the pubs-then-people split alone (each kind's own
  // natural/server order); "recent" interleaves both kinds by their own
  // recency signal into one combined, uniformly-ordered list.
  const flatSubscriptions: Array<FlatSubscription> = orderSubscriptions(
    [
      ...ungrouped.map(
        (pub): FlatSubscription => ({
          kind: "publication",
          pub,
          id: pub.uri,
          name: pub.name,
          unreadCount: pub.unreadCount,
          recentAt: pub.lastDocumentAt,
        }),
      ),
      ...ungroupedUsers.map(
        (followed): FlatSubscription => ({
          kind: "person",
          user: followed,
          id: followed.did,
          name: followed.displayName || followed.handle || followed.did,
          unreadCount: followed.unreadCount ?? 0,
          recentAt: followed.followedAt,
        }),
      ),
    ],
    sidebarPref.subscriptionSort,
  );
  // Creation only — editing lives on the list's own page.
  const [newListOpen, setNewListOpen] = useState(false);
  // Drag-and-drop only activates once the reader explicitly turns on
  // "Reorder subscriptions…" — it isn't implicitly on just because the sort
  // mode happens to be "default". Reset if an automatic sort takes over.
  const [reorderMode, setReorderMode] = useState(false);
  useEffect(() => {
    if (sidebarPref.subscriptionSort !== "default") {
      setReorderMode(false);
    }
  }, [sidebarPref.subscriptionSort]);

  const openAddPublication = () => {
    setSubsSheetOpen(false);
    setAddModalOpen(true);
  };

  const openNewList = () => {
    setSubsSheetOpen(false);
    setNewListOpen(true);
  };

  const toggleAllGroups = () => {
    sidebarPref.setAllCollapsed(groupUris, !allCollapsed);
  };

  // ── Subscriptions tree: one level deep (list groups + ungrouped rows),
  // fully drag-and-drop rearrangeable when subscriptionSort is "default".
  // Shared with the mobile sheet: both surfaces render the same
  // `topNodes`/`groupNodes`/`dragAndDropHooks` (a `<Tree>` per surface, but
  // one source of truth for data + drag behavior), so the desktop sidebar
  // and mobile sheet never drift apart.
  const queryClient = useQueryClient();
  const setListMembersMutation = useMutation(
    listApi.setListMembersMutationOptions(),
  );
  const saveListMembers = (
    rkey: string,
    publications: Array<string>,
    users: Array<string>,
  ) => {
    queryClient.setQueryData(
      listsQueryOptions().queryKey,
      (current: Array<SubscriptionList> | undefined) =>
        current?.map((list) =>
          list.rkey === rkey ? { ...list, publications, users } : list,
        ) ?? current,
    );
    setListMembersMutation.mutate({ rkey, publications, users });
  };
  // react-aria-components' per-item `allowsDragging` render prop reflects
  // only whether drag hooks exist at all (`!!dragState`), not `isDisabled` —
  // so it can't gate the grip handle's visibility. `dragEnabled` is computed
  // ourselves and used instead everywhere a row decides whether to show its
  // drag handle.
  const dragEnabled = reorderMode && sidebarPref.subscriptionSort === "default";
  const { topNodes, groupNodes, dragAndDropHooks } = useSubscriptionsTree({
    displayGroups,
    flatSubscriptions,
    subscriptionSort: sidebarPref.subscriptionSort,
    treeOrder: sidebarPref.treeOrder,
    saveTreeOrder: sidebarPref.saveTreeOrder,
    saveListMembers,
    dragEnabled,
  });

  return (
    <PageReaderProvider>
      <SelectionDockProvider>
        <div {...stylex.props(styles.shell)} data-app-shell>
          <SkipLink targetId="main-content" />
          <aside {...stylex.props(styles.sidebar)}>
            <div {...stylex.props(styles.sidebarScroll)}>
              <Brand style={styles.brandSidebar} to="/about" />
              <nav {...stylex.props(styles.nav)}>
                {visibleNav.map((item) => (
                  <SidebarNavItem
                    key={item.to}
                    {...item}
                    count={item.to === "/latest" ? unreadCount : null}
                    compactCount={item.to === "/latest"}
                  />
                ))}
              </nav>

              <Flex
                align="center"
                justify="between"
                data-sidebar-label="true"
                style={styles.sideLabel}
              >
                {signedIn ? (
                  <SubscriptionsHeading />
                ) : (
                  <span>
                    <Trans>Subscriptions</Trans>
                  </span>
                )}
                {signedIn && reorderMode ? (
                  <IconButton
                    aria-label={t`Finish reordering`}
                    size="sm"
                    variant="tertiary"
                    style={styles.headerIcon}
                    onPress={() => setReorderMode(false)}
                  >
                    <Check size={14} />
                  </IconButton>
                ) : null}
                {signedIn && !reorderMode ? (
                  <Menu
                    trigger={
                      <IconButton
                        aria-label={t`Subscription list actions`}
                        size="sm"
                        variant="tertiary"
                        style={styles.headerIcon}
                      >
                        <Settings size={14} />
                      </IconButton>
                    }
                    placement="bottom end"
                  >
                    {hasUngrouped || hasListGroups ? (
                      <SubMenu
                        trigger={
                          <MenuItem prefix={<ArrowDownWideNarrow size={14} />}>
                            <Trans>Sort</Trans>
                          </MenuItem>
                        }
                        placement="right top"
                        selectionMode="single"
                        selectedKeys={new Set([sidebarPref.subscriptionSort])}
                      >
                        <MenuItem
                          id="default"
                          onAction={() =>
                            sidebarPref.setSubscriptionSort("default")
                          }
                        >
                          <Trans>Default</Trans>
                        </MenuItem>
                        <MenuItem
                          id="recent"
                          onAction={() =>
                            sidebarPref.setSubscriptionSort("recent")
                          }
                        >
                          <Trans>Recent activity</Trans>
                        </MenuItem>
                        <MenuItem
                          id="alpha"
                          onAction={() =>
                            sidebarPref.setSubscriptionSort("alpha")
                          }
                        >
                          <Trans>A–Z</Trans>
                        </MenuItem>
                        <MenuItem
                          id="unread"
                          onAction={() =>
                            sidebarPref.setSubscriptionSort("unread")
                          }
                        >
                          <Trans>Most unread</Trans>
                        </MenuItem>
                      </SubMenu>
                    ) : null}
                    {hasUngrouped || hasListGroups ? (
                      <MenuItem
                        prefix={<GripVertical size={14} />}
                        isDisabled={sidebarPref.subscriptionSort !== "default"}
                        onAction={() => setReorderMode((prev) => !prev)}
                      >
                        {reorderMode ? (
                          <Trans>Done reordering</Trans>
                        ) : (
                          <Trans>Reorder subscriptions…</Trans>
                        )}
                      </MenuItem>
                    ) : null}
                    <MenuItem
                      prefix={<FolderPlus size={14} />}
                      onAction={() => setNewListOpen(true)}
                    >
                      <Trans>New list</Trans>
                    </MenuItem>
                    {hasListGroups ? (
                      <MenuItem
                        prefix={
                          allCollapsed ? (
                            <ChevronsUpDown size={14} />
                          ) : (
                            <ChevronsDownUp size={14} />
                          )
                        }
                        onAction={toggleAllGroups}
                      >
                        {allCollapsed ? (
                          <Trans>Expand all lists</Trans>
                        ) : (
                          <Trans>Collapse all lists</Trans>
                        )}
                      </MenuItem>
                    ) : null}
                  </Menu>
                ) : null}
              </Flex>
              <div {...stylex.props(styles.followList)}>
                {shellSubscriptionsLoading ? (
                  <SubscriptionsSkeleton />
                ) : following.length === 0 &&
                  !hasListGroups &&
                  followingUsers.length === 0 ? (
                  <span {...stylex.props(styles.emptyNote)}>
                    {signedIn ? (
                      <Trans>Nothing yet — go discover.</Trans>
                    ) : (
                      <Trans>Sign in to subscribe.</Trans>
                    )}
                  </span>
                ) : (
                  // One level deep: list groups (collapsible, own members as
                  // children) and ungrouped publications/people share a single
                  // tree so they can be freely drag-and-dropped relative to
                  // each other — reorder lists, reorder or move members
                  // between lists, and move members in or out of lists.
                  // Enabled only when subscriptionSort is "default"; an
                  // automatic sort computes its own arrangement instead.
                  <SubscriptionsTree
                    topNodes={topNodes}
                    groupNodes={groupNodes}
                    dragAndDropHooks={dragAndDropHooks}
                    dragEnabled={dragEnabled}
                    isCollapsed={sidebarPref.isCollapsed}
                    setCollapsed={sidebarPref.setCollapsed}
                  />
                )}
              </div>
            </div>

            <Flex direction="column" gap="lg" style={styles.foot}>
              <NavbarAuth variant="sidebar" menuPlacement="right bottom" />
              {/* Guests can't add publications, so the button is signed-in only.
                They switch language via the globe next to "Log in" (NavbarAuth). */}
              {signedIn ? (
                <Button
                  variant="primary"
                  style={styles.addTrigger}
                  onPress={() => setAddModalOpen(true)}
                >
                  <Plus size={16} /> <Trans>Add publication</Trans>
                </Button>
              ) : null}
            </Flex>
          </aside>

          <main
            id="main-content"
            ref={mainRef}
            tabIndex={-1}
            {...stylex.props(styles.main)}
          >
            {/* Both the bar and its at-the-top sentinel live outside the
                scroller: `overflow-x: clip` there makes WebKit jitter sticky
                children (see `styles.scroller`), and the bar turns sticky the
                moment it animates back in. */}
            {mobileBarSentinel}
            {staticPageTitle ? (
              <MobileStaticPageBar
                title={staticPageTitle}
                ref={mobileBarProps.ref}
              />
            ) : (
              <Flex
                ref={mobileBarProps.ref}
                align="center"
                justify="between"
                style={styles.mobileBar}
              >
                <Brand />
                <div {...stylex.props(styles.mobileBarActions)}>
                  {/* Guests have nothing to switch between — the sheet would
                      open on an empty list — so the bar is just brand + login. */}
                  {signedIn ? (
                    <SubscriptionsSwitcher
                      unreadCount={unreadCount}
                      onPress={() => setSubsSheetOpen(true)}
                    />
                  ) : null}
                  <NavbarAuth />
                </div>
              </Flex>
            )}

            <div {...stylex.props(styles.scroller)}>
              {/* The footer sits inside the themed region so a publication's
                  colors run to the bottom of the content column — and so does
                  the pull indicator, which is why the gap the gesture opens
                  shows the publication's own background rather than the app's.
                  The scope holds still; `contentRef` is what the pull drags. */}
              <PublicationThemeScope
                above={<PullToRefreshLane contentRef={contentRef} />}
                contentRef={contentRef}
                footer={<SiteFooter />}
              >
                {children}
              </PublicationThemeScope>
            </div>

            <div {...stylex.props(styles.dock)}>
              <div ref={dockStackRef} {...stylex.props(styles.dockStack)}>
                <PageReaderBar />
                <BottomNavSlot
                  items={visibleNav}
                  hasUnread={hasUnread}
                  stackRef={dockStackRef}
                />
              </div>
            </div>
          </main>

          <SubscriptionsSheet
            isOpen={subsSheetOpen}
            onOpenChange={setSubsSheetOpen}
            following={following}
            topNodes={topNodes}
            groupNodes={groupNodes}
            dragAndDropHooks={dragAndDropHooks}
            dragEnabled={dragEnabled}
            onAddPublication={openAddPublication}
            onNewList={signedIn ? openNewList : undefined}
            allCollapsed={allCollapsed}
            onToggleAll={hasListGroups ? toggleAllGroups : undefined}
            isCollapsed={sidebarPref.isCollapsed}
            onSetCollapsed={sidebarPref.setCollapsed}
            subscriptionSort={sidebarPref.subscriptionSort}
            onSetSubscriptionSort={sidebarPref.setSubscriptionSort}
            reorderMode={reorderMode}
            onReorderModeChange={setReorderMode}
          />
          <AddPublicationModal
            isOpen={addModalOpen}
            onOpenChange={setAddModalOpen}
            showTrigger={false}
          />
          <ListEditModal
            isOpen={newListOpen}
            onOpenChange={setNewListOpen}
            list={null}
            following={following}
            followingUsers={followingUsers}
          />
          <AtstoreReviewPrompt />
          <LanguageHintPrompt />
          <FeedbackDialog
            isOpen={feedbackOpen}
            onOpenChange={setFeedbackOpen}
          />
          <ToastRegion />
        </div>
      </SelectionDockProvider>
    </PageReaderProvider>
  );
}
