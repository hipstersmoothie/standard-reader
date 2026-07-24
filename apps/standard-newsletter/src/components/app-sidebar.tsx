import { Avatar } from "@standard-reader/design-system/avatar";
import {
  Menu,
  MenuItem,
  MenuSeparator,
} from "@standard-reader/design-system/menu";
import {
  focusColor,
  primaryColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { LayoutGrid, LogOut, Mail, Plus, Settings, User } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";

import type { Publication } from "../data/publications";
import type { ViewerData } from "../server/analytics";
import { kfmt } from "../lib/format";
import { PubGlyph } from "./ui";

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

const styles = stylex.create({
  sidebar: {
    backgroundColor: uiColor.bgSubtle,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    position: "sticky",
    borderInlineEndColor: uiColor.border1,
    borderInlineEndStyle: "solid",
    borderInlineEndWidth: 1,
    height: stylex.firstThatWorks("100dvh", "100vh"),
    overflow: "hidden",
    top: 0,
    width: "264px",
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
    alignItems: "center",
    display: "inline-flex",
    width: "fit-content",
    alignSelf: "flex-start",
    borderRadius: radius.sm,
    marginBottom: verticalSpace["7xl"],
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
  wordmark: {
    fontFamily: fontFamily.serif,
    fontSize: "1.3rem",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.none,
    color: uiColor.text2,
  },
  wordmarkAccent: {
    color: primaryColor.solid2,
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
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  count: {
    borderRadius: radius.full,
    backgroundColor: uiColor.component3,
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: "0.7rem",
    paddingInlineStart: horizontalSpace.md,
    paddingInlineEnd: horizontalSpace.md,
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
  followList: {
    columnGap: gap.none,
    display: "flex",
    flexDirection: "column",
    rowGap: gap.none,
  },
  addRow: {
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
    color: uiColor.text1,
    columnGap: gap.lg,
    display: "flex",
    rowGap: gap.lg,
    paddingBottom: verticalSpace.md,
    paddingInlineStart: horizontalSpace.lg,
    paddingInlineEnd: horizontalSpace.lg,
    paddingTop: verticalSpace.md,
  },
  addLabel: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
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
    color: uiColor.text2,
    columnGap: gap.lg,
    display: "flex",
    rowGap: gap.lg,
    paddingBottom: verticalSpace.sm,
    paddingTop: verticalSpace.sm,
    paddingInlineStart: horizontalSpace.lg,
    paddingInlineEnd: horizontalSpace.lg,
  },
  followRowActive: {
    backgroundColor: primaryColor.component3,
    color: primaryColor.text2,
  },
  followName: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  foot: {
    backgroundColor: uiColor.bgSubtle,
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    rowGap: gap.xl,
    columnGap: gap.xl,
    paddingInlineStart: horizontalSpace["3xl"],
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
    paddingBottom: verticalSpace["3xl"],
  },
  trigger: {
    borderRadius: radius.sm,
    borderWidth: 0,
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":is([aria-expanded=true])": uiColor.component2,
      ":is([data-hovered=true]):not([aria-expanded=true])": uiColor.component2,
      ":is([data-pressed=true])": uiColor.component3,
    },
    color: uiColor.text2,
    columnGap: gap.md,
    rowGap: gap.md,
    display: "flex",
    fontFamily: fontFamily.sans,
    width: "100%",
    paddingTop: verticalSpace.sm,
    paddingBottom: verticalSpace.sm,
    paddingInlineStart: horizontalSpace.lg,
    paddingInlineEnd: horizontalSpace.lg,
  },
  identity: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    minWidth: 0,
    rowGap: verticalSpace.xs,
    textAlign: "start",
  },
  displayName: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.none,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  handle: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.none,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

export function AppSidebar({
  publications,
  viewer,
}: {
  publications: Array<Publication>;
  viewer: ViewerData;
}) {
  const displayName = viewer.displayName;
  const handleLine = viewer.handle ? `@${viewer.handle}` : viewer.did;
  return (
    <aside {...stylex.props(styles.sidebar)}>
      <div {...stylex.props(styles.sidebarScroll)}>
        <Link to="/" {...stylex.props(styles.brandLink)}>
          <span {...stylex.props(styles.wordmark)}>
            Standard{" "}
            <span {...stylex.props(styles.wordmarkAccent)}>Newsletter</span>
          </span>
        </Link>

        <nav {...stylex.props(styles.nav)}>
          <Link
            to="/dashboard"
            {...stylex.props(styles.navItem)}
            activeProps={stylex.props(styles.navItem, styles.navItemActive)}
          >
            <LayoutGrid size={18} />
            <span {...stylex.props(styles.navLabel)}>Dashboard</span>
          </Link>
        </nav>

        <div {...stylex.props(styles.sideLabel)}>Newsletters</div>
        <div {...stylex.props(styles.followList)}>
          {publications.length === 0 ? (
            // Nothing here until the author connects a publication, so the
            // empty slot is the invitation to do it rather than a dead note.
            <Link to="/connect" {...stylex.props(styles.addRow)}>
              <Plus size={16} />
              <span {...stylex.props(styles.addLabel)}>Add a newsletter</span>
            </Link>
          ) : (
            publications.map((p) => (
              <Link
                key={p.id}
                to="/p/$pubId"
                params={{ pubId: p.id }}
                {...stylex.props(styles.followRow)}
                activeProps={stylex.props(
                  styles.followRow,
                  styles.followRowActive,
                )}
              >
                <PubGlyph pub={p} size="sm" />
                <span {...stylex.props(styles.followName)}>{p.name}</span>
                <span {...stylex.props(styles.count)}>{kfmt(p.subs)}</span>
              </Link>
            ))
          )}
          {publications.length > 0 ? (
            <Link to="/connect" {...stylex.props(styles.addRow)}>
              <Plus size={16} />
              <span {...stylex.props(styles.addLabel)}>Add a newsletter</span>
            </Link>
          ) : null}
        </div>
      </div>

      <div {...stylex.props(styles.foot)}>
        <Menu
          size="lg"
          placement="top start"
          trigger={
            <AriaButton {...stylex.props(styles.trigger)}>
              <Avatar
                size="md"
                src={viewer?.image ?? undefined}
                fallback={initialsOf(displayName)}
                alt={displayName}
              />
              <span {...stylex.props(styles.identity)}>
                <span {...stylex.props(styles.displayName)}>{displayName}</span>
                <span {...stylex.props(styles.handle)}>{handleLine}</span>
              </span>
            </AriaButton>
          }
        >
          <MenuItem
            href={
              viewer?.handle
                ? `https://bsky.app/profile/${viewer.handle}`
                : undefined
            }
            target="_blank"
            suffix={<User size={17} />}
          >
            View profile
          </MenuItem>
          <MenuItem href="/settings" suffix={<Mail size={17} />}>
            Sender settings
          </MenuItem>
          <MenuItem href="/settings" suffix={<Settings size={17} />}>
            Settings
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            href="/api/auth/logout"
            variant="destructive"
            suffix={<LogOut size={17} />}
          >
            Log out
          </MenuItem>
        </Menu>
      </div>
    </aside>
  );
}
