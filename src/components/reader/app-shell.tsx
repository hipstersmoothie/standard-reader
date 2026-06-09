"use client";

import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { feedApi } from "#/integrations/tanstack-query/api-feed.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { parseInternalRoute } from "#/lib/internal-route";
import { PageReaderProvider } from "#/lib/page-reader/page-reader-provider";
import { Compass, Home, Newspaper, Plus, Search } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { FollowingPublication } from "../../integrations/tanstack-query/api-feed.functions";

import { Avatar } from "../../design-system/avatar";
import { Button } from "../../design-system/button";
import { Flex } from "../../design-system/flex";
import { animationDuration } from "../../design-system/theme/animations.stylex";
import { primaryColor, uiColor } from "../../design-system/theme/color.stylex";
import { radius } from "../../design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
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
import { NavbarAuth } from "../NavbarAuth";
import { AddPublicationModal } from "./add-publication-modal";
import { initials, publicationLinkParams } from "./format";
import { PageReaderBar } from "./page-reader-bar";
import {
  SubscriptionsSheet,
  SubscriptionsSwitcher,
} from "./subscriptions-sheet";

const DESKTOP = "@media (min-width: 60rem)";

const styles = stylex.create({
  shell: {
    overflow: "hidden",
    display: "flex",
    flexDirection: "row",
    height: stylex.firstThatWorks("100dvh", "100vh"),
  },
  sidebar: {
    backgroundColor: uiColor.bgSubtle,
    boxSizing: "border-box",
    display: { [DESKTOP]: "flex", default: "none" },
    flexDirection: "column",
    flexShrink: 0,
    position: "sticky",
    borderRightColor: uiColor.border1,
    borderRightStyle: "solid",
    borderRightWidth: 1,
    height: stylex.firstThatWorks("100dvh", "100vh"),
    overflowY: "auto",
    paddingBottom: verticalSpace["3xl"],
    paddingLeft: horizontalSpace["3xl"],
    paddingRight: horizontalSpace["3xl"],
    paddingTop: verticalSpace["8xl"],
    top: 0,
    width: "264px",
  },
  brand: {
    // eslint-disable-next-line @stylexjs/valid-styles
    textBoxEdge: "cap alphabetic",
    // eslint-disable-next-line @stylexjs/valid-styles
    textBoxTrim: "trim-both",
    textDecoration: "none",
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: "1.3rem",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.none,
  },
  brandSidebar: {
    paddingBottom: verticalSpace["7xl"],
    paddingLeft: horizontalSpace.md,
  },
  brandAccent: { color: primaryColor.text2 },
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
      ":hover": uiColor.component1,
    },
    color: uiColor.text2,
    columnGap: gap.xl,
    display: "flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    rowGap: gap.xl,
    paddingBottom: verticalSpace.lg,
    paddingLeft: horizontalSpace.lg,
    paddingRight: horizontalSpace.lg,
    paddingTop: verticalSpace.lg,
  },
  navItemActive: {
    backgroundColor: primaryColor.component1,
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
    backgroundColor: uiColor.component1,
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: "0.7rem",
    paddingBottom: verticalSpace.none,
    paddingLeft: horizontalSpace.md,
    paddingRight: horizontalSpace.md,
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
    paddingLeft: horizontalSpace.lg,
    paddingRight: horizontalSpace.lg,
    paddingTop: verticalSpace["3xl"],
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
      ":hover": uiColor.component1,
    },
    color: "inherit",
    columnGap: gap.lg,
    display: "flex",
    rowGap: gap.lg,
    paddingBottom: verticalSpace.sm,
    paddingLeft: horizontalSpace.lg,
    paddingRight: horizontalSpace.lg,
    paddingTop: verticalSpace.sm,
  },
  followName: {
    overflow: "hidden",
    color: uiColor.text2,
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  },
  followUnread: {
    borderRadius: radius.full,
    backgroundColor: primaryColor.component1,
    color: primaryColor.text2,
    flexShrink: 0,
    fontFamily: fontFamily.mono,
    fontSize: "0.65rem",
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.none,
    textAlign: "center",
    minWidth: spacing["4"],
    paddingBottom: verticalSpace.xxs,
    paddingLeft: horizontalSpace.sm,
    paddingRight: horizontalSpace.sm,
    paddingTop: verticalSpace.xxs,
  },
  emptyNote: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    fontStyle: "italic",
    paddingLeft: horizontalSpace.lg,
    paddingRight: horizontalSpace.lg,
  },
  foot: {
    columnGap: gap.xl,
    display: "flex",
    flexDirection: "column",
    rowGap: gap.xl,
    marginTop: "auto",
    paddingTop: verticalSpace["3xl"],
  },
  main: {
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    position: "relative",
    minHeight: 0,
    minWidth: 0,
  },
  scroller: {
    display: "flex",
    flexBasis: "0%",
    flexDirection: "column",
    flexGrow: "1",
    flexShrink: "1",
    minHeight: 0,
    overflowY: "auto",
  },
  mobileBar: {
    alignItems: "center",
    backgroundColor: uiColor.bg,
    display: { [DESKTOP]: "none", default: "flex" },
    justifyContent: "space-between",
    position: "sticky",
    zIndex: 30,
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: verticalSpace.xl,
    paddingLeft: horizontalSpace["3xl"],
    paddingRight: horizontalSpace["3xl"],
    paddingTop: verticalSpace.xl,
    top: 0,
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
    position: "absolute",
    rowGap: gap.lg,
    zIndex: 30,
    bottom: `calc(env(safe-area-inset-bottom, 0px) + ${verticalSpace["3xl"]})`,
    left: 0,
    paddingLeft: horizontalSpace["3xl"],
    paddingRight: horizontalSpace["3xl"],
    right: 0,
  },
  bottomNav: {
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
    left: 0,
    top: spacing["1.5"],
  },
  fabIndicatorGlide: {
    transitionDuration: animationDuration.verySlow,
    transitionProperty: "transform, width",
    transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)",
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
    paddingLeft: horizontalSpace.xl,
    paddingRight: horizontalSpace.xl,
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
    marginLeft: 0,
    maxWidth: 0,
  },
  bottomLabelActive: {
    opacity: 1,
    marginLeft: horizontalSpace.md,
    maxWidth: spacing["24"],
  },
  unreadDot: {
    borderRadius: radius.full,
    backgroundColor: primaryColor.solid1,
    boxShadow: `0 0 0 2px ${uiColor.bg}`,
    position: "absolute",
    height: spacing["2"],
    right: `calc(-1 * ${spacing["1"]})`,
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
  to: string;
  label: string;
  icon: React.ReactNode;
}

const NAV: Array<NavLink> = [
  { to: "/", label: "Home", icon: <Home size={18} /> },
  { to: "/latest", label: "Latest", icon: <Newspaper size={18} /> },
  { to: "/discover", label: "Discover", icon: <Compass size={18} /> },
  { to: "/search", label: "Search", icon: <Search size={18} /> },
];

function SidebarNavItem({
  to,
  label,
  icon,
  count,
}: NavLink & { count?: number | null }) {
  return (
    <Link
      to={to}
      activeOptions={to === "/" ? { exact: true } : undefined}
      {...stylex.props(styles.navItem)}
      activeProps={stylex.props(styles.navItem, styles.navItemActive)}
    >
      {icon}
      <span {...stylex.props(styles.navLabel)}>{label}</span>
      {count != null && count > 0 ? (
        <span {...stylex.props(styles.count)}>{count}</span>
      ) : null}
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
  const params = publicationLinkParams(pub.uri);
  const avatar = (
    <FollowingAvatar
      name={pub.name}
      iconUrl={pub.iconUrl ?? pub.ownerAvatarUrl}
    />
  );
  const name = <span {...stylex.props(styles.followName)}>{pub.name}</span>;
  const unreadBadge =
    pub.unreadCount > 0 ? (
      <span
        {...stylex.props(styles.followUnread)}
        aria-label={`${pub.unreadCount} unread`}
      >
        {pub.unreadCount}
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
      <Link
        to="/p/$did/$rkey"
        params={params}
        {...stylex.props(styles.followRow)}
      >
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
      <Link
        to={internal.to}
        params={internal.params}
        {...stylex.props(styles.followRow)}
      >
        {content}
      </Link>
    );
  }
  if (internal) {
    return (
      <Link to={internal.to} {...stylex.props(styles.followRow)}>
        {content}
      </Link>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      {...stylex.props(styles.followRow)}
    >
      {content}
    </a>
  );
}

const BottomNavItem = forwardRef<
  HTMLAnchorElement,
  NavLink & { isActive: boolean; showUnreadDot?: boolean }
>(function BottomNavItemRender(
  { to, label, icon, isActive, showUnreadDot },
  ref,
) {
  return (
    <Link
      ref={ref}
      to={to}
      aria-label={label}
      {...stylex.props(styles.bottomItem, isActive && styles.bottomItemActive)}
    >
      <span {...stylex.props(styles.bottomIconWrap)}>
        {icon}
        {showUnreadDot ? (
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
        {label}
      </span>
    </Link>
  );
});

function navItemActive(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

function BottomNav({ hasUnread }: { hasUnread: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeIndex = NAV.findIndex((item) => navItemActive(pathname, item.to));
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
  } | null>(null);
  // Glide is disabled for the first placement so the pill appears in position
  // instantly, then enabled so subsequent route changes animate the slide.
  const [glide, setGlide] = useState(false);

  // Article / publication routes have no matching tab (activeIndex < 0); in
  // that case we intentionally leave the indicator where it last settled.
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
        {NAV.map((item, i) => (
          <BottomNavItem
            key={item.to}
            {...item}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            isActive={i === activeIndex}
            showUnreadDot={item.to === "/latest" ? hasUnread : false}
          />
        ))}
      </div>
    </nav>
  );
}

function Brand({ style }: { style?: stylex.StyleXStyles }) {
  return (
    <Link to="/" {...stylex.props(styles.brand, style)}>
      Standard <span {...stylex.props(styles.brandAccent)}>Reader</span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: sidebar } = useQuery(feedApi.getSidebarQueryOptions());
  const { data: session } = useQuery(user.getSessionQueryOptions);
  const signedIn = Boolean(session?.user);
  const following = sidebar?.following ?? [];
  const unreadCount = sidebar?.unreadCount ?? null;
  const hasUnread = unreadCount != null && unreadCount > 0;
  const [subsSheetOpen, setSubsSheetOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);

  const openAddPublication = () => {
    setSubsSheetOpen(false);
    setAddModalOpen(true);
  };

  return (
    <PageReaderProvider>
      <div {...stylex.props(styles.shell)}>
        <aside {...stylex.props(styles.sidebar)}>
          <Brand style={styles.brandSidebar} />
          <nav {...stylex.props(styles.nav)}>
            {NAV.map((item) => (
              <SidebarNavItem
                key={item.to}
                {...item}
                count={item.to === "/latest" ? unreadCount : null}
              />
            ))}
          </nav>

          <Flex align="center" justify="between" style={styles.sideLabel}>
            <span>Subscriptions</span>
            {following.length > 0 ? <span>{following.length}</span> : null}
          </Flex>
          <div {...stylex.props(styles.followList)}>
            {following.length === 0 ? (
              <span {...stylex.props(styles.emptyNote)}>
                {signedIn ? "Nothing yet — go discover." : "Sign in to follow."}
              </span>
            ) : (
              following.map((pub) => <FollowRow key={pub.uri} pub={pub} />)
            )}
          </div>

          <Flex direction="column" gap="lg" style={styles.foot}>
            <NavbarAuth variant="sidebar" menuPlacement="right bottom" />
            <Button
              variant="primary"
              style={styles.addTrigger}
              onPress={() => setAddModalOpen(true)}
            >
              <Plus size={16} /> Add publication
            </Button>
          </Flex>
        </aside>

        <main {...stylex.props(styles.main)}>
          <Flex align="center" justify="between" style={styles.mobileBar}>
            <Brand />
            <div {...stylex.props(styles.mobileBarActions)}>
              <SubscriptionsSwitcher
                count={following.length}
                onPress={() => setSubsSheetOpen(true)}
              />
              <NavbarAuth />
            </div>
          </Flex>

          <div {...stylex.props(styles.scroller)} data-app-scroller>
            {children}
          </div>

          <div {...stylex.props(styles.dock)}>
            <PageReaderBar />
            <BottomNav hasUnread={hasUnread} />
          </div>
        </main>

        <SubscriptionsSheet
          isOpen={subsSheetOpen}
          onOpenChange={setSubsSheetOpen}
          following={following}
          onAddPublication={openAddPublication}
        />
        <AddPublicationModal
          isOpen={addModalOpen}
          onOpenChange={setAddModalOpen}
          showTrigger={false}
        />
      </div>
    </PageReaderProvider>
  );
}
