"use client";

import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { Link, createLink } from "@tanstack/react-router";
import { feedApi } from "#/integrations/tanstack-query/api-feed.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { Compass, Home, Newspaper, Plus, Search } from "lucide-react";

import type { PublicationCard } from "../../integrations/tanstack-query/api-shapes";

import { Avatar } from "../../design-system/avatar";
import { Button } from "../../design-system/button";
import { Flex } from "../../design-system/flex";
import { primaryColor, uiColor } from "../../design-system/theme/color.stylex";
import { radius } from "../../design-system/theme/radius.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  tracking,
} from "../../design-system/theme/typography.stylex";
import { NavbarAuth } from "../NavbarAuth";
import { initials, publicationLinkParams } from "./format";

const ButtonLink = createLink(Button);
const DESKTOP = "@media (min-width: 60rem)";

const styles = stylex.create({
  shell: {
    display: "flex",
    flexDirection: "row",
    minHeight: "100vh",
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
    height: "100vh",
    overflowY: "auto",
    paddingBottom: "1rem",
    paddingLeft: "1.1rem",
    paddingRight: "1.1rem",
    paddingTop: "1.4rem",
    top: 0,
    width: "264px",
  },
  brand: {
    textDecoration: "none",
    alignItems: "center",
    color: "inherit",
    columnGap: "0.6rem",
    display: "flex",
    rowGap: "0.6rem",
    paddingBottom: "1.1rem",
    paddingLeft: "0.5rem",
    paddingTop: "0.25rem",
  },
  brandMark: {
    borderRadius: radius.sm,
    alignItems: "center",
    backgroundColor: primaryColor.solid1,
    color: primaryColor.textContrast,
    display: "flex",
    flexShrink: 0,
    fontFamily: fontFamily.serif,
    fontSize: "1.15rem",
    fontStyle: "italic",
    fontWeight: fontWeight.semibold,
    justifyContent: "center",
    height: "30px",
    width: "30px",
  },
  brandName: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: "1.3rem",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
  },
  brandAccent: { color: primaryColor.text2 },
  nav: {
    columnGap: "0.1rem",
    display: "flex",
    flexDirection: "column",
    rowGap: "0.1rem",
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
    columnGap: "0.7rem",
    display: "flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    rowGap: "0.7rem",
    paddingBottom: "0.55rem",
    paddingLeft: "0.65rem",
    paddingRight: "0.65rem",
    paddingTop: "0.55rem",
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
    paddingBottom: "0.05rem",
    paddingLeft: "0.5rem",
    paddingRight: "0.5rem",
    paddingTop: "0.05rem",
  },
  sideLabel: {
    alignItems: "center",
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: "0.65rem",
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.widest,
    textTransform: "uppercase",
    paddingBottom: "0.5rem",
    paddingLeft: "0.65rem",
    paddingRight: "0.65rem",
    paddingTop: "1.1rem",
  },
  followList: {
    columnGap: "0.05rem",
    display: "flex",
    flexDirection: "column",
    rowGap: "0.05rem",
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
    columnGap: "0.6rem",
    display: "flex",
    rowGap: "0.6rem",
    paddingBottom: "0.35rem",
    paddingLeft: "0.65rem",
    paddingRight: "0.65rem",
    paddingTop: "0.35rem",
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
    paddingLeft: "0.65rem",
    paddingRight: "0.65rem",
  },
  foot: {
    columnGap: "0.7rem",
    display: "flex",
    flexDirection: "column",
    rowGap: "0.7rem",
    marginTop: "auto",
    paddingTop: "0.9rem",
  },
  addBtn: {
    backgroundColor: {
      default: uiColor.solid1,
      ":hover": primaryColor.solid1,
    },
    color: uiColor.textContrast,
    width: "100%",
  },
  main: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    minWidth: 0,
  },
  scroller: {
    flexBasis: "0%",
    flexGrow: "1",
    flexShrink: "1",
    minHeight: 0,
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
    paddingBottom: "0.75rem",
    paddingLeft: "1.1rem",
    paddingRight: "1.1rem",
    paddingTop: "0.75rem",
    top: 0,
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
    paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
    paddingTop: "0.4rem",
  },
  bottomItem: {
    borderWidth: 0,
    textDecoration: "none",
    alignItems: "center",
    backgroundColor: "transparent",
    color: uiColor.text1,
    columnGap: "0.2rem",
    cursor: "pointer",
    display: "flex",
    flexBasis: "0%",
    flexDirection: "column",
    flexGrow: "1",
    flexShrink: "1",
    fontFamily: fontFamily.sans,
    fontSize: "0.6rem",
    fontWeight: fontWeight.semibold,
    rowGap: "0.2rem",
    paddingBottom: "0.3rem",
    paddingTop: "0.3rem",
  },
  bottomItemActive: { color: primaryColor.text2 },
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

  return (
    <a
      href={pub.url}
      target="_blank"
      rel="noreferrer"
      {...stylex.props(styles.followRow)}
    >
      {avatar}
      {name}
    </a>
  );
}

function Brand() {
  return (
    <Link to="/" {...stylex.props(styles.brand)}>
      <span {...stylex.props(styles.brandMark)}>S</span>
      <span {...stylex.props(styles.brandName)}>
        Standard <span {...stylex.props(styles.brandAccent)}>Reader</span>
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: sidebar } = useQuery(feedApi.getSidebarQueryOptions());
  const { data: session } = useQuery(user.getSessionQueryOptions);
  const signedIn = Boolean(session?.user);
  const following = sidebar?.following ?? [];
  const unreadCount = sidebar?.unreadCount ?? null;

  return (
    <div {...stylex.props(styles.shell)}>
      <aside {...stylex.props(styles.sidebar)}>
        <Brand />
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
          <span>Following</span>
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
          <NavbarAuth />
          <ButtonLink to="/discover" style={styles.addBtn}>
            <Plus size={16} /> Add publication
          </ButtonLink>
        </Flex>
      </aside>

      <main {...stylex.props(styles.main)}>
        <Flex align="center" justify="between" style={styles.mobileBar}>
          <Brand />
          <NavbarAuth />
        </Flex>

        <div {...stylex.props(styles.scroller)}>{children}</div>

        <nav {...stylex.props(styles.bottomNav)}>
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={item.to === "/" ? { exact: true } : undefined}
              {...stylex.props(styles.bottomItem)}
              activeProps={stylex.props(
                styles.bottomItem,
                styles.bottomItemActive,
              )}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
}
