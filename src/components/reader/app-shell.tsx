"use client";

import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { feedApi } from "#/integrations/tanstack-query/api-feed.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { parseInternalRoute } from "#/lib/internal-route";
import { Compass, Home, Newspaper, Plus, Search } from "lucide-react";
import { useState } from "react";

import type { PublicationCard } from "../../integrations/tanstack-query/api-shapes";

import { Avatar } from "../../design-system/avatar";
import { Button } from "../../design-system/button";
import { Flex } from "../../design-system/flex";
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
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
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
  bottomNav: {
    backgroundColor: uiColor.bg,
    display: { [DESKTOP]: "none", default: "flex" },
    position: "sticky",
    zIndex: 30,
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    bottom: 0,
    paddingBottom: `max(${spacing["2"]}, env(safe-area-inset-bottom))`,
    paddingTop: verticalSpace.md,
  },
  bottomItem: {
    borderWidth: 0,
    textDecoration: "none",
    alignItems: "center",
    backgroundColor: "transparent",
    color: uiColor.text1,
    columnGap: gap.xs,
    cursor: "pointer",
    display: "flex",
    flexBasis: "0%",
    flexDirection: "column",
    flexGrow: "1",
    flexShrink: "1",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    rowGap: gap.xs,
    paddingBottom: verticalSpace.sm,
    paddingTop: verticalSpace.sm,
  },
  bottomItemActive: { color: primaryColor.text2 },
  bottomIconWrap: {
    placeItems: "center",
    display: "grid",
    position: "relative",
  },
  unreadDot: {
    borderRadius: radius.full,
    backgroundColor: primaryColor.text2,
    boxShadow: `0 0 0 2px ${uiColor.bg}`,
    position: "absolute",
    height: spacing["2"],
    right: `calc(-1 * ${spacing["1"]})`,
    top: `calc(-1 * ${spacing["0.5"]})`,
    width: spacing["2"],
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

function FollowRow({ pub }: { pub: PublicationCard }) {
  const params = publicationLinkParams(pub.uri);
  const avatar = (
    <FollowingAvatar
      name={pub.name}
      iconUrl={pub.iconUrl ?? pub.ownerAvatarUrl}
    />
  );
  const name = <span {...stylex.props(styles.followName)}>{pub.name}</span>;

  if (params) {
    return (
      <Link
        to="/p/$did/$rkey"
        params={params}
        {...stylex.props(styles.followRow)}
      >
        {avatar}
        {name}
      </Link>
    );
  }

  const href = pub.url;
  if (!href) {
    return (
      <div {...stylex.props(styles.followRow)}>
        {avatar}
        {name}
      </div>
    );
  }

  const internal = parseInternalRoute(href);
  if (internal?.params) {
    return (
      <Link
        to={internal.to}
        params={internal.params}
        {...stylex.props(styles.followRow)}
      >
        {avatar}
        {name}
      </Link>
    );
  }
  if (internal) {
    return (
      <Link to={internal.to} {...stylex.props(styles.followRow)}>
        {avatar}
        {name}
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
      {avatar}
      {name}
    </a>
  );
}

function BottomNavItem({
  to,
  label,
  icon,
  showUnreadDot,
}: NavLink & { showUnreadDot?: boolean }) {
  return (
    <Link
      to={to}
      activeOptions={to === "/" ? { exact: true } : undefined}
      {...stylex.props(styles.bottomItem)}
      activeProps={stylex.props(styles.bottomItem, styles.bottomItemActive)}
    >
      <span {...stylex.props(styles.bottomIconWrap)}>
        {icon}
        {showUnreadDot ? <span {...stylex.props(styles.unreadDot)} /> : null}
      </span>
      <span>{label}</span>
    </Link>
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

        <nav {...stylex.props(styles.bottomNav)}>
          {NAV.map((item) => (
            <BottomNavItem
              key={item.to}
              {...item}
              showUnreadDot={item.to === "/latest" ? hasUnread : false}
            />
          ))}
        </nav>
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
  );
}
