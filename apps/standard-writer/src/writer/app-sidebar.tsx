import { Button } from "@standard-reader/design-system/button";
import { IconButton } from "@standard-reader/design-system/icon-button";
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
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import {
  auth,
  sessionQueryOptions,
} from "../integrations/tanstack-query/api-auth.functions";
import { draftsQueryOptions } from "../integrations/tanstack-query/api-drafts.functions";
import { myPublicationsQueryOptions } from "../integrations/tanstack-query/api-publications.functions";
import { I, Ico } from "./icons";
import { NameAvatar } from "./name-avatar";
import { C } from "./tokens";
import type { Screen } from "./types";

// Sidebar chrome mirrors Standard Reader's app-shell: a brand wordmark, a flat
// primary nav, an uppercase section label with inline actions, then the list.
const styles = stylex.create({
  aside: {
    width: 264,
    flex: "none",
    height: "100%",
    borderInlineEndWidth: 1,
    borderInlineEndStyle: "solid",
    borderInlineEndColor: uiColor.border1,
    backgroundColor: uiColor.bgSubtle,
    display: "flex",
    flexDirection: "column",
  },
  scroll: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "0%",
    minHeight: 0,
    overflowY: "auto",
    overflowX: "hidden",
    paddingInline: horizontalSpace.lg,
    paddingTop: verticalSpace["3xl"],
  },
  brand: {
    fontFamily: fontFamily.serif,
    fontSize: "1.3rem",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: 1,
    color: uiColor.text2,
    paddingInline: horizontalSpace.lg,
    marginBottom: verticalSpace["6xl"],
    display: "block",
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    rowGap: gap.xxs,
  },
  navItem: {
    borderStyle: "none",
    borderRadius: radius.sm,
    textAlign: "start",
    width: "100%",
    cursor: "pointer",
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
    paddingBlock: verticalSpace.lg,
    paddingInline: horizontalSpace.lg,
  },
  navItemActive: {
    backgroundColor: primaryColor.component3,
    color: primaryColor.text2,
  },
  navLabel: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "0%",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  count: {
    borderRadius: radius.full,
    backgroundColor: primaryColor.component3,
    color: primaryColor.text2,
    fontFamily: fontFamily.mono,
    fontSize: "0.7rem",
    paddingInline: horizontalSpace.md,
  },
  sideLabel: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: "0.65rem",
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.widest,
    textTransform: "uppercase",
    paddingInline: horizontalSpace.lg,
    paddingTop: verticalSpace["3xl"],
    paddingBottom: verticalSpace.md,
  },
  footer: {
    paddingInline: horizontalSpace.md,
    paddingBlock: horizontalSpace.md,
  },
  profileButton: {
    display: "flex",
    alignItems: "center",
    gap: 11,
    paddingBlock: "8px",
    paddingInline: "10px",
    width: "100%",
    justifyContent: "flex-start",
  },
});

interface NavItemProps {
  active: boolean;
  icon: string;
  label: string;
  badge?: number;
  onClick: () => void;
}

function NavItem({ active, icon, label, badge, onClick }: NavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active || undefined}
      {...stylex.props(styles.navItem, active && styles.navItemActive)}
    >
      <Ico d={icon} s={18} />
      <span {...stylex.props(styles.navLabel)}>{label}</span>
      {badge != null && badge > 0 ? (
        <span {...stylex.props(styles.count)}>{badge}</span>
      ) : null}
    </button>
  );
}

interface AppSidebarProps {
  screen: Screen;
  pubId: string | undefined;
  go: (screen: Screen) => void;
  openPub: (id: string) => void;
}

function profileMenuItem(label: string, icon: string): ReactNode {
  return <MenuItem suffix={<Ico d={icon} s={17} />}>{label}</MenuItem>;
}

/** Session-aware footer: the signed-in author + logout, or a sign-in prompt. */
function ProfileFooter() {
  const { data: session, isPending } = useQuery(sessionQueryOptions);
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: () => auth.logout(),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      globalThis.location.href = "/login";
    },
  });

  return (
    <div {...stylex.props(styles.footer)}>
      {session ? (
        <Menu
          size="lg"
          placement="top start"
          trigger={
            <Button variant="tertiary" style={styles.profileButton}>
              <NameAvatar name={session.name} src={session.image} size="md" />
              <span
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  minWidth: 0,
                  flex: 1,
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: C.t12,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {session.name}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: C.mut,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {session.handle
                    ? `@${session.handle}`
                    : (session.did ?? "Signed in")}
                </span>
              </span>
              <Ico d={I.chevD} s={16} style={{ flex: "none", color: C.mut }} />
            </Button>
          }
        >
          {profileMenuItem("View profile", I.user)}
          {profileMenuItem("Settings", I.settings)}
          <MenuSeparator />
          <MenuItem
            variant="destructive"
            suffix={<Ico d={I.logout} s={17} />}
            onAction={() => logout.mutate()}
          >
            Log out
          </MenuItem>
        </Menu>
      ) : (
        <Button
          variant="secondary"
          style={styles.profileButton}
          isDisabled={isPending}
          onPress={() => {
            globalThis.location.href = "/login";
          }}
        >
          <Ico d={I.user} s={17} />
          <span
            style={{
              flex: 1,
              textAlign: "left",
              fontSize: 13.5,
              fontWeight: 600,
            }}
          >
            Sign in
          </span>
        </Button>
      )}
    </div>
  );
}

export function AppSidebar({ screen, pubId, go, openPub }: AppSidebarProps) {
  const { data: publications = [] } = useQuery(myPublicationsQueryOptions);
  const { data: drafts = [] } = useQuery(draftsQueryOptions);

  return (
    <div {...stylex.props(styles.aside)}>
      <div className="sw-scroll" {...stylex.props(styles.scroll)}>
        <div {...stylex.props(styles.brand)}>
          Standard <span style={{ color: C.a9 }}>Writer</span>
        </div>

        <nav {...stylex.props(styles.nav)}>
          <NavItem
            active={screen === "write"}
            icon={I.pen}
            label="Write"
            onClick={() => go("write")}
          />
          <NavItem
            active={screen === "drafts"}
            icon={I.file}
            label="Drafts"
            badge={drafts.length}
            onClick={() => go("drafts")}
          />
        </nav>

        <div {...stylex.props(styles.sideLabel)}>
          <span>Publications</span>
          <IconButton
            aria-label="New publication"
            size="sm"
            variant="tertiary"
            onPress={() => go("newpub")}
          >
            <Ico d={I.plus} s={15} />
          </IconButton>
        </div>

        <nav {...stylex.props(styles.nav)}>
          {publications.map((p) => (
            <NavItem
              key={p.uri}
              active={screen === "pub" && pubId === p.uri}
              icon={I.book}
              label={p.name}
              onClick={() => openPub(p.uri)}
            />
          ))}
        </nav>
      </div>

      <ProfileFooter />
    </div>
  );
}
