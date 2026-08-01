import { Trans, useLingui } from "@lingui/react/macro";
import { Avatar, AvatarButton } from "@standard-reader/design-system/avatar";
import { Flex } from "@standard-reader/design-system/flex";
import { IconButton } from "@standard-reader/design-system/icon-button";
import {
  Menu,
  MenuItem,
  MenuSeparator,
} from "@standard-reader/design-system/menu";
import { animationDuration } from "@standard-reader/design-system/theme/animations.stylex";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  gap as gapSpace,
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  BookOpen,
  Globe,
  Heart,
  History,
  LogOut,
  MessageSquareText,
  Settings,
  User,
} from "lucide-react";
import { useState } from "react";
import type { PopoverProps } from "react-aria-components";
import { Button as AriaButton } from "react-aria-components";

import { ButtonLink, MenuItemLink } from "#/components/router-links";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { useTrackReadingHistory } from "#/lib/use-track-reading-history";
import { useLoginSearch } from "#/utils/use-login-search";

import { LanguageDialog } from "./reader/language-dialog";
import { Handle } from "./reader/primitives";

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
    paddingInlineEnd: horizontalSpace.lg,
    paddingInlineStart: horizontalSpace.lg,
    rowGap: gapSpace.md,
    textAlign: "start",
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
    userSelect: "none",
    paddingBottom: verticalSpace.sm,
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
  sidebarLogin: {
    width: "100%",
  },
  sidebarLoginButton: {
    flexGrow: 1,
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
  const { t } = useLingui();
  const { data: session } = useQuery(user.getSessionQueryOptions);
  const { enabled: trackReading } = useTrackReadingHistory();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const loginSearch = useLoginSearch();
  const [languageOpen, setLanguageOpen] = useState(false);

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

    const profileRef = session.user.did ?? session.user.handle;

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
        {profileRef ? (
          <MenuItemLink
            to="/u/$did"
            params={{ did: profileRef }}
            suffix={<User />}
            textValue={t`View profile`}
          >
            <Trans>View profile</Trans>
          </MenuItemLink>
        ) : null}
        {trackReading ? (
          <MenuItemLink
            to="/history"
            suffix={<History />}
            textValue={t`Reading history`}
          >
            <Trans>Reading history</Trans>
          </MenuItemLink>
        ) : null}
        <MenuItemLink
          to="/recommended"
          suffix={<Heart />}
          textValue={t`Recommended articles`}
        >
          <Trans>Recommended articles</Trans>
        </MenuItemLink>
        <MenuItemLink to="/guide" suffix={<BookOpen />} textValue={t`Guide`}>
          <Trans>Guide</Trans>
        </MenuItemLink>
        <MenuItemLink
          to="/feedback"
          suffix={<MessageSquareText />}
          textValue={t`Feedback`}
        >
          <Trans>Feedback</Trans>
        </MenuItemLink>
        <MenuItemLink
          to="/settings"
          suffix={<Settings />}
          textValue={t`Settings`}
        >
          <Trans>Settings</Trans>
        </MenuItemLink>
        <MenuSeparator />
        <MenuItem
          onPress={() => logoutMutation.mutate()}
          suffix={<LogOut />}
          textValue={t`Log out`}
        >
          <Trans>Log out</Trans>
        </MenuItem>
      </Menu>
    );
  }

  // Guests have no Settings screen, so surface a persistent language switch
  // next to the sign-in affordance — the only way for them to change the
  // interface language once the one-time indicator is gone.
  const languageButton = (
    <IconButton
      aria-label={t`Change language`}
      variant="tertiary"
      size="md"
      onPress={() => setLanguageOpen(true)}
    >
      <Globe size={18} />
    </IconButton>
  );

  if (variant === "sidebar") {
    return (
      <>
        <Flex align="center" gap="sm" style={styles.sidebarLogin}>
          <ButtonLink
            to="/login"
            search={loginSearch}
            variant="secondary"
            size="md"
            style={styles.sidebarLoginButton}
          >
            <Trans>Log in</Trans>
          </ButtonLink>
          {languageButton}
        </Flex>
        <LanguageDialog isOpen={languageOpen} onOpenChange={setLanguageOpen} />
      </>
    );
  }

  return (
    <Flex align="center" gap="sm">
      {languageButton}
      <ButtonLink
        to="/login"
        search={loginSearch}
        variant="secondary"
        size="md"
      >
        <Trans>Log in</Trans>
      </ButtonLink>
      <LanguageDialog isOpen={languageOpen} onOpenChange={setLanguageOpen} />
    </Flex>
  );
}
