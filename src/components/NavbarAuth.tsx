import type { PopoverProps } from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createLink, useNavigate } from "@tanstack/react-router";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { Bookmark, LogOut } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";

import { Avatar, AvatarButton } from "../design-system/avatar";
import { Button } from "../design-system/button";
import { Flex } from "../design-system/flex";
import { Menu, MenuItem, MenuSeparator } from "../design-system/menu";
import { animationDuration } from "../design-system/theme/animations.stylex";
import { uiColor } from "../design-system/theme/color.stylex";
import { radius } from "../design-system/theme/radius.stylex";
import {
  gap as gapSpace,
  horizontalSpace,
  verticalSpace,
} from "../design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "../design-system/theme/typography.stylex";
import { Handle } from "./reader/primitives";
import { ThemeSubMenu } from "./ThemeMenu";

const ButtonLink = createLink(Button);
const MenuItemLink = createLink(MenuItem);

const styles = stylex.create({
  sidebarTrigger: {
    borderRadius: radius.sm,
    borderWidth: 0,
    outline: {
      default: "none",
      ":is([data-focused='true'][data-focus-visible='true'])": "revert",
    },
    alignItems: "center",
    // eslint-disable-next-line @stylexjs/valid-styles
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":is([aria-expanded=true])": uiColor.component2,
      ":is([aria-expanded=true][data-hovered=true])": uiColor.component3,
      ":is([aria-expanded=true][data-pressed=true])": uiColor.component3,
      ":is([data-hovered=true]):not([aria-expanded=true])": uiColor.component2,
      ":is([data-pressed=true]):not([aria-expanded=true])": uiColor.component3,
    },
    boxSizing: "border-box",
    color: uiColor.text2,
    columnGap: gapSpace.md,
    cursor: "pointer",
    display: "flex",
    flexShrink: 0,
    fontFamily: fontFamily.sans,
    justifyContent: "flex-start",
    rowGap: gapSpace.md,
    textAlign: "left",
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
    userSelect: "none",
    paddingBottom: verticalSpace.sm,
    paddingLeft: horizontalSpace.lg,
    paddingRight: horizontalSpace.lg,
    paddingTop: verticalSpace.sm,
    width: "100%",
  },
  identity: {
    overflow: "hidden",
    display: "flex",
    flexBasis: "0%",
    flexDirection: "column",
    flexGrow: "1",
    flexShrink: "1",
    rowGap: gapSpace.xs,
    minWidth: 0,
  },
  displayName: {
    // eslint-disable-next-line @stylexjs/valid-styles
    textBoxEdge: "cap alphabetic",
    // eslint-disable-next-line @stylexjs/valid-styles
    textBoxTrim: "trim-both",
    overflow: "hidden",
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.none,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  handleLine: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

function UserIdentity({
  name,
  handle,
}: {
  name: string;
  handle: string | null;
}) {
  return (
    <div {...stylex.props(styles.identity)}>
      <span {...stylex.props(styles.displayName)}>{name}</span>
      {handle ? (
        <span {...stylex.props(styles.handleLine)}>
          <Handle>@{handle}</Handle>
        </span>
      ) : null}
    </div>
  );
}

function SidebarMenuTrigger({
  name,
  handle,
  image,
  initial,
}: {
  name: string;
  handle: string | null;
  image: string | undefined;
  initial: string;
}) {
  return (
    <AriaButton {...stylex.props(styles.sidebarTrigger)}>
      <Avatar size="md" src={image} fallback={initial} alt={name} />
      <UserIdentity name={name} handle={handle} />
    </AriaButton>
  );
}

export function NavbarAuth({
  variant = "compact",
  menuPlacement = "bottom end",
}: {
  variant?: "compact" | "sidebar";
  menuPlacement?: PopoverProps["placement"];
}) {
  const { data: session } = useQuery(user.getSessionQueryOptions);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await user.signOut();

      queryClient.setQueryData(user.getSessionQueryOptions.queryKey, null);
      await queryClient.resetQueries();
      await navigate({ to: "/" });
    },
  });

  if (session?.user) {
    const initial = session.user.name?.charAt(0).toUpperCase() ?? "U";
    const trigger =
      variant === "sidebar" ? (
        <SidebarMenuTrigger
          name={session.user.name}
          handle={session.user.handle}
          image={session.user.image ?? undefined}
          initial={initial}
        />
      ) : (
        <AvatarButton
          size="md"
          src={session.user.image ?? undefined}
          fallback={initial}
        />
      );

    return (
      <Menu
        size="lg"
        placement={menuPlacement}
        trigger={trigger}
        header={
          variant === "compact" ? (
            <UserIdentity
              name={session.user.name}
              handle={session.user.handle}
            />
          ) : undefined
        }
      >
        <MenuItemLink to="/likes" suffix={<Bookmark />}>
          Saved articles
        </MenuItemLink>
        <MenuSeparator />
        <MenuItem
          onPress={() => {
            const did = session.user.did;
            if (did == null || did === "" || globalThis.navigator === undefined)
              return;
            void globalThis.navigator.clipboard?.writeText(did);
          }}
        >
          Copy DID
        </MenuItem>
        <MenuSeparator />
        <ThemeSubMenu />
        <MenuSeparator />
        <MenuItem onPress={() => logoutMutation.mutate()} suffix={<LogOut />}>
          Log out
        </MenuItem>
      </Menu>
    );
  }

  return (
    <Flex align="center" gap="sm">
      <ButtonLink to="/login" variant="secondary" size="md">
        Log in
      </ButtonLink>
    </Flex>
  );
}
