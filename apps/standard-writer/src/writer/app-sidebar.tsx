import { Button } from "@standard-reader/design-system/button";
import {
  Menu,
  MenuItem,
  MenuSeparator,
} from "@standard-reader/design-system/menu";
import {
  Sidebar,
  SidebarSection,
  SidebarItem,
} from "@standard-reader/design-system/sidebar";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import {
  auth,
  sessionQueryOptions,
} from "../integrations/tanstack-query/api-auth.functions";
import { PUBS } from "./data";
import { I, Ico } from "./icons";
import { NameAvatar } from "./name-avatar";
import { C } from "./tokens";
import type { Screen } from "./types";

// DS components accept StyleX styles (not raw objects) for `style`.
const dsStyles = stylex.create({
  nav: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
    paddingTop: "4px",
    paddingRight: "12px",
    paddingBottom: "24px",
    paddingLeft: "12px",
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
    <SidebarItem isActive={active} onClick={onClick}>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          minWidth: 0,
        }}
      >
        <Ico d={icon} />
        <span
          style={{
            flex: 1,
            minWidth: 0,
            textAlign: "left",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {label}
        </span>
        {badge != null && (
          <span
            style={{
              flex: "none",
              fontSize: 11,
              color: C.mut,
              background: C.ui3,
              borderRadius: 20,
              padding: "1px 8px",
            }}
          >
            {badge}
          </span>
        )}
      </span>
    </SidebarItem>
  );
}

interface AppSidebarProps {
  screen: Screen;
  pubId: string;
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
    <div style={{ padding: "8px 12px 12px", borderTop: `1px solid ${C.b6}` }}>
      {session ? (
        <Menu
          size="lg"
          placement="top start"
          trigger={
            <Button variant="tertiary" style={dsStyles.profileButton}>
              <NameAvatar name={session.name} size="md" />
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
                  {session.did ?? "Signed in"}
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
          style={dsStyles.profileButton}
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
  return (
    <div
      style={{
        width: 266,
        flex: "none",
        height: "100%",
        borderRight: `1px solid ${C.b6}`,
        background: C.warm,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "22px 20px 14px 24px",
          display: "flex",
          alignItems: "center",
        }}
      >
        <div
          style={{
            fontFamily: C.serif,
            fontSize: "1.3rem",
            fontWeight: 500,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            color: C.t12,
          }}
        >
          Standard <span style={{ color: C.a9 }}>Writer</span>
        </div>
      </div>

      <div
        className="sw-scroll"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        <Sidebar style={dsStyles.nav}>
          <SidebarSection title="Compose">
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
              badge={4}
              onClick={() => go("drafts")}
            />
          </SidebarSection>
          <SidebarSection title="Publications">
            {PUBS.map((p) => (
              <NavItem
                key={p.id}
                active={screen === "pub" && pubId === p.id}
                icon={I.book}
                label={p.name}
                onClick={() => openPub(p.id)}
              />
            ))}
            <NavItem
              active={screen === "newpub"}
              icon={I.plus}
              label="New publication"
              onClick={() => go("newpub")}
            />
          </SidebarSection>
        </Sidebar>
      </div>

      <ProfileFooter />
    </div>
  );
}
