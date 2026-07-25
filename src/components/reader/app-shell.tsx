"use client";

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import {
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowUpDown,
  Bookmark,
  ChevronsDownUp,
  ChevronsUpDown,
  Cog,
  Compass,
  FolderPlus,
  GripVertical,
  Home,
  Layers,
  Newspaper,
  Plus,
  Search,
} from "lucide-react";
import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useFocusRing } from "react-aria";

import { DirectionalIcon } from "#/design-system/directional-icon";
import { useAnimatedNavbar } from "#/design-system/navbar/useAnimatedNavbar";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import {
  listsQueryOptions,
  savedListsQueryOptions,
  sidebarQueryOptions,
} from "#/integrations/tanstack-query/shell-queries";
import { formatSidebarUnreadCount } from "#/lib/format-count";
import { parseInternalRoute } from "#/lib/internal-route";
import { PageReaderProvider } from "#/lib/page-reader/page-reader-provider";
import type { SidebarNavId } from "#/lib/sidebar-nav";
import { useFormatters } from "#/lib/use-formatters";
import { useCompactNav } from "#/lib/use-media-query";

import { Avatar } from "../../design-system/avatar";
import { Button } from "../../design-system/button";
import {
  Disclosure,
  DisclosurePanel,
  DisclosureTitle,
} from "../../design-system/disclosure";
import { Flex } from "../../design-system/flex";
import { IconButton } from "../../design-system/icon-button";
import { Menu, MenuItem, SubMenu } from "../../design-system/menu";
import { Skeleton } from "../../design-system/skeleton";
import { SkipLink } from "../../design-system/skip-link";
import { animationDuration } from "../../design-system/theme/animations.stylex";
import {
  focusColor,
  primaryColor,
  uiColor,
} from "../../design-system/theme/color.stylex";
import { radius } from "../../design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  size,
  verticalSpace,
} from "../../design-system/theme/semantic-spacing.stylex";
import { spacing } from "../../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "../../design-system/theme/typography.stylex";
import { ToastRegion } from "../../design-system/toast";
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
import { initials, listLinkParams, publicationLinkParams } from "./format";
import { LanguageHintPrompt } from "./language-hint-prompt";
import { ListEditModal } from "./list-edit-modal";
import { PageReaderBar } from "./page-reader-bar";
import { PublicationThemeScope } from "./publication-theme-scope";
import { ReorderListsModal } from "./reorder-lists-modal";
import { ReorderSubscriptionsModal } from "./reorder-subscriptions-modal";
import {
  SelectionDockProvider,
  useSelectionDock,
} from "./selection-dock-context";
import type { SubscriptionListGroup } from "./subscriptions-sheet";
import {
  SubscriptionsSheet,
  SubscriptionsSwitcher,
} from "./subscriptions-sheet";
import type { OrderableSubscription } from "./use-sidebar-pref";
import {
  orderGroups,
  orderSubscriptions,
  useSidebarPref,
} from "./use-sidebar-pref";

const DESKTOP = "@media (min-width: 60rem)";

const styles = stylex.create({
  shell: {
    display: "flex",
    flexDirection: "row",
    // Fill the viewport when content is short, grow past it when tall — the
    // document is the scroll container now. `flex-start` keeps children pinned
    // to the top so the sticky sidebar stays viewport-tall in a taller shell
    // instead of stretching to the full document height.
    alignItems: "flex-start",
    minHeight: stylex.firstThatWorks("100dvh", "100vh"),
  },
  sidebar: {
    backgroundColor: uiColor.bgSubtle,
    boxSizing: "border-box",
    display: { [DESKTOP]: "flex", default: "none" },
    flexDirection: "column",
    flexShrink: 0,
    position: "sticky",
    borderInlineEndColor: uiColor.border1,
    borderInlineEndStyle: "solid",
    borderInlineEndWidth: 1,
    height: stylex.firstThatWorks("100dvh", "100vh"),
    // The sidebar itself doesn't scroll; its inner region does, so the foot
    // stays pinned outside the scrollport and content never hides behind it.
    overflow: "hidden",
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
    minHeight: 0,
    overflowY: "auto",
    paddingInlineStart: horizontalSpace["3xl"],
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingTop: verticalSpace["8xl"],
  },
  brandLink: {
    textDecoration: "none",
    // Hug the wordmark so the focus ring is tight to it, not a full-width box
    // wrapping empty space.
    alignItems: "center",
    display: "inline-flex",
    width: "fit-content",
    borderRadius: radius.sm,
    paddingTop: verticalSpace.xxs,
    paddingBottom: verticalSpace.xxs,
    paddingInlineStart: horizontalSpace.xs,
    paddingInlineEnd: horizontalSpace.xs,
    outline: {
      default: "none",
      ":is([data-focus-visible])": `2px solid ${focusColor.ring}`,
    },
    outlineOffset: "2px",
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
    textDecoration: "none",
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": uiColor.component2,
    },
    // Inset ring: the sidebar scroll container clips an outset outline at its
    // content edge, so draw the ring inside the row where it can't be cut off.
    outline: {
      default: "none",
      ":is([data-focus-visible])": `2px solid ${focusColor.ring}`,
    },
    outlineOffset: "-2px",
    color: uiColor.text2,
    columnGap: gap.xl,
    display: "flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    rowGap: gap.xl,
    paddingBottom: verticalSpace.lg,
    paddingInlineStart: horizontalSpace.lg,
    paddingInlineEnd: horizontalSpace.lg,
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
    paddingBottom: verticalSpace.none,
    paddingInlineStart: horizontalSpace.md,
    paddingInlineEnd: horizontalSpace.md,
    paddingTop: verticalSpace.none,
  },
  sideLabel: {
    alignItems: "center",
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: "0.65rem",
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.widest,
    textTransform: "uppercase",
    paddingBottom: verticalSpace.md,
    paddingInlineStart: horizontalSpace.lg,
    paddingInlineEnd: horizontalSpace.lg,
    paddingTop: verticalSpace["3xl"],
  },
  sideLabelActions: {
    alignItems: "center",
    display: "flex",
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
  listLabel: {
    alignItems: "center",
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: "0.65rem",
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.widest,
    textTransform: "uppercase",
    paddingBottom: verticalSpace.xxs,
    paddingInlineStart: horizontalSpace.lg,
    paddingInlineEnd: horizontalSpace.lg,
    paddingTop: verticalSpace.lg,
  },
  /**
   * Extra separation below an *expanded* group's rows. Lives inside the
   * disclosure panel so collapsed groups stack tightly.
   */
  listGroupSpacer: {
    height: verticalSpace.sm,
  },
  listName: {
    overflow: "hidden",
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  },
  /** Group name as a link to the list's public page. */
  listTitleLink: {
    textDecoration: {
      default: "none",
      ":hover": "underline",
    },
    alignItems: "center",
    borderRadius: radius.xs,
    outline: {
      default: "none",
      ":is([data-focus-visible])": `2px solid ${focusColor.ring}`,
    },
    outlineOffset: "2px",
    color: {
      default: uiColor.text1,
      ":is([data-sidebar-label]:hover *)": uiColor.text2,
    },
    display: "flex",
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
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
  /** Chevron-only disclosure trigger; sized to match the sm IconButton. */
  listToggle: {
    borderRadius: radius.sm,
    justifyContent: "center",
    height: size["2xl"],
    paddingBottom: spacing["0"],
    paddingInlineStart: spacing["0"],
    paddingInlineEnd: spacing["0"],
    paddingTop: spacing["0"],
    width: size["2xl"],
  },
  listPanelContent: {
    paddingBottom: spacing["0"],
    paddingInlineStart: spacing["0"],
    paddingInlineEnd: spacing["0"],
    paddingTop: spacing["0"],
  },
  listEmpty: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    fontStyle: "italic",
    paddingInlineStart: horizontalSpace.lg,
    paddingInlineEnd: horizontalSpace.lg,
  },
  followList: {
    columnGap: gap.none,
    display: "flex",
    flexDirection: "column",
    rowGap: gap.none,
  },
  followRow: {
    borderRadius: radius.sm,
    textDecoration: "none",
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": uiColor.component2,
    },
    outline: {
      default: "none",
      ":is([data-focus-visible])": `2px solid ${focusColor.ring}`,
    },
    outlineOffset: "-2px",
    color: "inherit",
    columnGap: gap.lg,
    display: "flex",
    rowGap: gap.lg,
    paddingBottom: verticalSpace.sm,
    paddingInlineStart: horizontalSpace.lg,
    paddingInlineEnd: horizontalSpace.lg,
    paddingTop: verticalSpace.sm,
  },
  followName: {
    // Isolate only, no `dir="auto"`: this is a single-line NAME in a UI row.
    // It must stay aligned with the sidebar's nav labels (right-aligned under
    // RTL) while still ordering its own characters correctly. `dir="auto"`
    // here would left-align it and break the column's rhythm.
    unicodeBidi: "isolate",
    overflow: "hidden",
    color: uiColor.text2,
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  },
  followUnread: {
    borderRadius: radius.full,
    backgroundColor: primaryColor.component3,
    color: primaryColor.text2,
    flexShrink: 0,
    fontFamily: fontFamily.mono,
    fontSize: "0.65rem",
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.none,
    textAlign: "center",
    minWidth: spacing["4"],
    paddingBottom: verticalSpace.xxs,
    paddingInlineStart: horizontalSpace.sm,
    paddingInlineEnd: horizontalSpace.sm,
    paddingTop: verticalSpace.xxs,
  },
  emptyNote: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    fontStyle: "italic",
    paddingInlineStart: horizontalSpace.lg,
    paddingInlineEnd: horizontalSpace.lg,
  },
  subscriptionsLoading: {
    gap: gap.sm,
    display: "flex",
    flexDirection: "column",
    minHeight: spacing["24"],
    paddingInlineStart: horizontalSpace.lg,
    paddingInlineEnd: horizontalSpace.lg,
  },
  foot: {
    backgroundColor: uiColor.bgSubtle,
    // A fixed footer pinned below the scroll region (not sticky/overlapping),
    // so list content can never hide behind it.
    columnGap: gap.xl,
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    rowGap: gap.xl,
    paddingInlineStart: horizontalSpace["3xl"],
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingBottom: verticalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
  },
  mobileDetailBar: {
    alignItems: "center",
    backgroundColor: uiColor.bg,
    columnGap: gap.lg,
    display: { [DESKTOP]: "none", default: "grid" },
    flexShrink: 0,
    // Only bites once `useAnimatedNavbar` makes the bar sticky: it then has to
    // clear positioned page content (cards, topic chips) but stay under the
    // floating dock — and under a view's own sticky header (article-view's
    // `stickyChrome`, at 20), which pins flush against this bar's bottom edge.
    // The two abut exactly, so on a fractional device-pixel grid the seam can
    // round either way; losing the tie means a stray half-pixel of this bar
    // hides behind that header instead of clipping its top edge.
    zIndex: 15,
    gridTemplateColumns: `${size.lg} 1fr ${size.lg}`,
    justifyContent: "space-between",
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: verticalSpace.xl,
    paddingInlineStart: horizontalSpace["3xl"],
    paddingInlineEnd: horizontalSpace["3xl"],
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
    position: "relative",
    minWidth: 0,
    // Keep the content column at least viewport-tall so the footer sits at the
    // bottom of the screen on short pages instead of floating mid-viewport.
    minHeight: stylex.firstThatWorks("100dvh", "100vh"),
    // Focused only as the skip-link landing target (tabIndex={-1}); a ring
    // around the whole content region would be noise, not a wayfinding cue.
    outlineStyle: "none",
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
    // See `mobileDetailBar` — matters only while the bar is stuck to the top.
    zIndex: 15,
    justifyContent: "space-between",
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: verticalSpace.xl,
    paddingInlineStart: horizontalSpace["3xl"],
    paddingInlineEnd: horizontalSpace["3xl"],
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
    pointerEvents: "none",
    // Pinned to the viewport (the document is the scroll container now, so an
    // absolute dock would ride to the bottom of the whole article instead of
    // floating above the fold). Offset by the sidebar width on desktop so the
    // floating card stays centered over the content column.
    position: "fixed",
    rowGap: gap.lg,
    zIndex: 30,
    // Sit a floor of 16px above the bottom, or hug the home-indicator safe area
    // where that's larger. On iOS (standalone PWA) the ~34px safe-area inset
    // wins, so the pill hugs the home indicator with no extra float. Where there
    // is no safe area (Android, desktop) the inset resolves to 0 and the 16px
    // floor keeps the pill off the very bottom edge. `max()` — not env()'s
    // second arg, which only applies when env() is entirely unsupported.
    bottom: `max(env(safe-area-inset-bottom, 0px), ${verticalSpace["3xl"]})`,
    insetInlineStart: { [DESKTOP]: "264px", default: 0 },
    paddingInlineStart: horizontalSpace["3xl"],
    paddingInlineEnd: horizontalSpace["3xl"],
    insetInlineEnd: 0,
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
    position: "relative",
    transitionDuration: animationDuration.verySlow,
    transitionProperty: "color",
    transitionTimingFunction: "ease",
    zIndex: 1,
    height: spacing["12"],
    paddingInlineStart: horizontalSpace.xl,
    paddingInlineEnd: horizontalSpace.xl,
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
    opacity: 0,
    transitionDuration: animationDuration.slow,
    transitionProperty: "opacity",
    transitionTimingFunction: "ease",
    whiteSpace: "nowrap",
    marginInlineStart: 0,
    maxWidth: 0,
  },
  bottomLabelActive: {
    opacity: 1,
    marginInlineStart: horizontalSpace.md,
    maxWidth: spacing["24"],
  },
  unreadDot: {
    borderRadius: radius.full,
    backgroundColor: primaryColor.solid1,
    boxShadow: `0 0 0 2px ${uiColor.bg}`,
    position: "absolute",
    height: spacing["2"],
    insetInlineEnd: `calc(-1 * ${spacing["1"]})`,
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

/** One row in the sidebar's flat (ungrouped) subscription list — a publication
 * or a person, normalized so `orderSubscriptions` can sort them together. */
type FlatSubscription = OrderableSubscription &
  (
    | { kind: "publication"; pub: FollowingPublication }
    | { kind: "person"; user: FollowingUser }
  );

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
 * Primary nav links; inserts Saved + Collections after Latest when the reader is
 * signed in (both are personal, repo-backed surfaces).
 */
function navWithSaved(signedIn: boolean): Array<NavLink> {
  return NAV.flatMap((item) => {
    if (item.to !== "/latest" || !signedIn) return [item];
    return [item, SAVED_NAV, COLLECTIONS_NAV];
  });
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

function FollowingAvatar({
  name,
  iconUrl,
}: {
  name: string;
  iconUrl: string | null;
}) {
  return (
    <Avatar
      size="sm"
      src={iconUrl ?? undefined}
      fallback={initials(name)}
      alt={name}
    />
  );
}

function FollowRow({ pub }: { pub: FollowingPublication }) {
  const { t } = useLingui();
  const fmt = useFormatters();
  const focusRingProps = useFocusRingProps();
  const rowProps = { ...focusRingProps, ...stylex.props(styles.followRow) };
  const params = publicationLinkParams(pub.uri);
  const avatar = (
    <FollowingAvatar
      name={pub.name}
      iconUrl={pub.iconUrl ?? pub.ownerAvatarUrl}
    />
  );
  const name = <span {...stylex.props(styles.followName)}>{pub.name}</span>;
  const unreadCount = pub.unreadCount;
  const unreadBadge =
    unreadCount > 0 ? (
      <span
        {...stylex.props(styles.followUnread)}
        aria-label={t`${unreadCount} unread`}
      >
        {formatSidebarUnreadCount(fmt, pub.unreadCount)}
      </span>
    ) : null;
  const content = (
    <>
      {avatar}
      {name}
      {unreadBadge}
    </>
  );

  if (params) {
    return (
      <Link to="/p/$did/$rkey" params={params} {...rowProps}>
        {content}
      </Link>
    );
  }

  const href = pub.url;
  if (!href) {
    return <div {...stylex.props(styles.followRow)}>{content}</div>;
  }

  const internal = parseInternalRoute(href);
  if (internal?.params) {
    return (
      <Link to={internal.to} params={internal.params} {...rowProps}>
        {content}
      </Link>
    );
  }
  if (internal) {
    return (
      <Link to={internal.to} {...rowProps}>
        {content}
      </Link>
    );
  }

  return (
    <a href={href} target="_blank" rel="noreferrer" {...rowProps}>
      {content}
    </a>
  );
}

function FollowUserRow({ user: followed }: { user: FollowingUser }) {
  const { t } = useLingui();
  const fmt = useFormatters();
  const focusRingProps = useFocusRingProps();
  const rowProps = { ...focusRingProps, ...stylex.props(styles.followRow) };
  const name =
    followed.displayName ??
    (followed.handle ? `@${followed.handle}` : followed.did);
  const unread = followed.unreadCount ?? 0;
  return (
    <Link to="/u/$did" params={{ did: followed.did }} {...rowProps}>
      <FollowingAvatar name={name} iconUrl={followed.avatarUrl} />
      <span {...stylex.props(styles.followName)}>{name}</span>
      {unread > 0 ? (
        <span
          {...stylex.props(styles.followUnread)}
          aria-label={t`${unread} unread`}
        >
          {formatSidebarUnreadCount(fmt, unread)}
        </span>
      ) : null}
    </Link>
  );
}

function SidebarList({
  name,
  listUri,
  pubs,
  users,
  isExpanded,
  onExpandedChange,
}: {
  name: string;
  /** AT-URI of the list; links the group to its public `/l/$did/$rkey` page. */
  listUri: string;
  pubs: Array<FollowingPublication>;
  users: Array<FollowingUser>;
  /** Controlled expansion so "collapse all" can drive every group at once. */
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const { t } = useLingui();
  const fmt = useFormatters();
  const link = listLinkParams(listUri);
  const unreadTotal =
    pubs.reduce((sum, pub) => sum + pub.unreadCount, 0) +
    users.reduce((sum, person) => sum + (person.unreadCount ?? 0), 0);
  const titleFocusRingProps = useFocusRingProps();

  return (
    <Disclosure isExpanded={isExpanded} onExpandedChange={onExpandedChange}>
      <Flex
        align="center"
        justify="between"
        gap="sm"
        data-sidebar-label="true"
        style={styles.listLabel}
      >
        {link ? (
          <Link
            to="/l/$did/$rkey"
            params={link}
            aria-label={t`Open list ${name}`}
            {...titleFocusRingProps}
            {...stylex.props(styles.listTitleLink)}
          >
            <span {...stylex.props(styles.listName)}>{name}</span>
          </Link>
        ) : (
          <span {...stylex.props(styles.listName)}>{name}</span>
        )}
        <div {...stylex.props(styles.sideLabelActions)}>
          {unreadTotal > 0 ? (
            <span>{formatSidebarUnreadCount(fmt, unreadTotal)}</span>
          ) : null}
          <DisclosureTitle
            style={styles.listToggle}
            chevronStyle={styles.headerIcon}
            aria-label={t`Toggle list ${name}`}
          >
            {null}
          </DisclosureTitle>
        </div>
      </Flex>
      <DisclosurePanel contentStyle={styles.listPanelContent}>
        <div {...stylex.props(styles.followList)}>
          {pubs.length === 0 && users.length === 0 ? (
            <span {...stylex.props(styles.listEmpty)}>
              <Trans>Empty list.</Trans>
            </span>
          ) : (
            <>
              {pubs.map((pub) => (
                <FollowRow key={pub.uri} pub={pub} />
              ))}
              {users.map((person) => (
                <FollowUserRow key={person.did} user={person} />
              ))}
            </>
          )}
        </div>
        <div {...stylex.props(styles.listGroupSpacer)} aria-hidden />
      </DisclosurePanel>
    </Disclosure>
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
}: {
  items: Array<NavLink>;
  hasUnread: boolean;
}) {
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
    <nav {...stylex.props(styles.bottomNav)}>
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
}: {
  items: Array<NavLink>;
  hasUnread: boolean;
}) {
  const dock = useSelectionDock();

  if (dock?.isActive) {
    return <div {...stylex.props(styles.selectionSlot)} ref={dock.setSlot} />;
  }

  return <BottomNav items={items} hasUnread={hasUnread} />;
}

function Brand({
  style,
  to = "/",
}: {
  style?: stylex.StyleXStyles;
  to?: "/" | "/about";
}) {
  const focusRingProps = useFocusRingProps();
  return (
    <Link
      to={to}
      {...focusRingProps}
      {...stylex.props(styles.brandLink, style)}
    >
      <BrandWordmark />
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
  const primaryNav = navWithSaved(signedIn);
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
  const listGroups: Array<SubscriptionListGroup> = [
    ...lists.map((list) => ({
      key: list.uri,
      name: list.name,
      listUri: list.uri,
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
        [],
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
        [],
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
      return {
        ...group,
        id: group.listUri,
        unreadCount: groupUnreadCount,
        recentAt: groupRecentAt ?? null,
        pubs,
        users,
      };
    }),
    groupSort,
    [],
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
    sidebarPref.subscriptionOrder,
  );
  // Creation only — editing lives on the list's own page.
  const [newListOpen, setNewListOpen] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [reorderSubsOpen, setReorderSubsOpen] = useState(false);

  const openAddPublication = () => {
    setSubsSheetOpen(false);
    setAddModalOpen(true);
  };

  const openNewList = () => {
    setSubsSheetOpen(false);
    setNewListOpen(true);
  };

  const openReorder = () => {
    setSubsSheetOpen(false);
    setReorderOpen(true);
  };

  const openReorderSubscriptions = () => {
    setSubsSheetOpen(false);
    setReorderSubsOpen(true);
  };

  const toggleAllGroups = () => {
    sidebarPref.setAllCollapsed(groupUris, !allCollapsed);
  };

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
                {signedIn ? (
                  <Menu
                    trigger={
                      <IconButton
                        aria-label={t`Subscription list actions`}
                        size="sm"
                        variant="tertiary"
                        style={styles.headerIcon}
                      >
                        <Cog size={14} />
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
                    {hasUngrouped ? (
                      <MenuItem
                        prefix={<GripVertical size={14} />}
                        onAction={openReorderSubscriptions}
                      >
                        <Trans>Reorder subscriptions…</Trans>
                      </MenuItem>
                    ) : null}
                    {hasListGroups ? (
                      <MenuItem
                        prefix={<ArrowUpDown size={14} />}
                        isDisabled={sidebarPref.subscriptionSort !== "default"}
                        onAction={openReorder}
                      >
                        <Trans>Reorder lists…</Trans>
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
                  // People live under Subscriptions too — one grouping keeps the
                  // sidebar's information architecture simple, even though
                  // "subscribing" (publications) and "following" (people) are
                  // technically different graph edges. People sorted into a list
                  // render under that list group instead (see below). The sort
                  // mode ("recent" excepted) interleaves both kinds by name /
                  // unread count / manual order rather than keeping them in
                  // separate blocks.
                  flatSubscriptions.map((item) =>
                    item.kind === "publication" ? (
                      <FollowRow key={item.id} pub={item.pub} />
                    ) : (
                      <FollowUserRow key={item.id} user={item.user} />
                    ),
                  )
                )}
              </div>
              {displayGroups.map((group) => (
                <SidebarList
                  key={group.key}
                  name={group.name}
                  listUri={group.listUri}
                  pubs={group.pubs}
                  users={group.users}
                  isExpanded={!sidebarPref.isCollapsed(group.listUri)}
                  onExpandedChange={(expanded) =>
                    sidebarPref.setCollapsed(group.listUri, !expanded)
                  }
                />
              ))}
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
                  colors run to the bottom of the content column. */}
              <PublicationThemeScope footer={<SiteFooter />}>
                {children}
              </PublicationThemeScope>
            </div>

            <div {...stylex.props(styles.dock)}>
              <PageReaderBar />
              <BottomNavSlot items={visibleNav} hasUnread={hasUnread} />
            </div>
          </main>

          <SubscriptionsSheet
            isOpen={subsSheetOpen}
            onOpenChange={setSubsSheetOpen}
            following={following}
            ungrouped={flatSubscriptions
              .filter((item) => item.kind === "publication")
              .map((item) => item.pub)}
            groups={displayGroups}
            onAddPublication={openAddPublication}
            onNewList={signedIn ? openNewList : undefined}
            onReorder={signedIn && hasListGroups ? openReorder : undefined}
            allCollapsed={allCollapsed}
            onToggleAll={hasListGroups ? toggleAllGroups : undefined}
            isCollapsed={sidebarPref.isCollapsed}
            onSetCollapsed={sidebarPref.setCollapsed}
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
          <ReorderListsModal
            isOpen={reorderOpen}
            onOpenChange={setReorderOpen}
            groups={orderedGroups.map((group) => ({
              listUri: group.listUri,
              name: group.name,
            }))}
            onSave={sidebarPref.saveOrder}
          />
          <ReorderSubscriptionsModal
            isOpen={reorderSubsOpen}
            onOpenChange={setReorderSubsOpen}
            subscriptions={flatSubscriptions.map((item) => ({
              id: item.id,
              name: item.name,
              avatarUrl:
                item.kind === "publication"
                  ? (item.pub.iconUrl ?? item.pub.ownerAvatarUrl)
                  : item.user.avatarUrl,
            }))}
            onSave={sidebarPref.saveSubscriptionOrder}
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
