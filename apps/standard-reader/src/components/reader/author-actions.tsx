"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@standard-reader/design-system/button";
import { ButtonGroup } from "@standard-reader/design-system/button-group";
import { IconButton } from "@standard-reader/design-system/icon-button";
import {
  Menu,
  MenuItem,
  MenuSeparator,
  SubMenu,
} from "@standard-reader/design-system/menu";
import { primaryColor } from "@standard-reader/design-system/theme/color.stylex";
import { breakpoints } from "@standard-reader/design-system/theme/media-queries.stylex";
import { gap } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  ExternalLink,
  FileText,
  ListPlus,
  Rss,
  Settings,
} from "lucide-react";
import { useState } from "react";

import { MenuItemLink } from "#/components/router-links";
import { authorApi } from "#/integrations/tanstack-query/api-author.functions";
import type { FollowingUser } from "#/integrations/tanstack-query/api-feed.functions";
import { listApi } from "#/integrations/tanstack-query/api-lists.functions";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { useLoginSearch } from "#/utils/use-login-search";

import { BlockUserDialog, BlockUserMenuItem } from "./block-user-menu-item";
import { FollowUserButton } from "./follow-user-button";
import { MuteDialog, MuteMenuItem } from "./mute-menu-item";
import { NotifyButton } from "./notify-button";
import { RssFeedDialog } from "./rss-feed-button";
import { ShareMenuItems, useShareActions } from "./share-menu";

const MENU_ICON = 14;

const styles = stylex.create({
  /**
   * Mirrors the publication hero (`publication-actions.tsx`): the bell trails
   * the Follow split button rather than sitting inside it, because the chevron
   * is Follow's own dropdown and a third segment between them would read as one
   * three-part control.
   *
   * On desktop this row sits at the end of the hero's top row; on mobile it
   * wraps onto its own full-width line under the author's handle.
   */
  row: {
    alignItems: "center",
    columnGap: gap.sm,
    display: "flex",
    flexBasis: { default: "100%", [breakpoints.sm]: "auto" },
    flexShrink: 0,
    marginInlineStart: { default: null, [breakpoints.sm]: "auto" },
    paddingTop: { default: null, [breakpoints.sm]: spacing["1"] },
  },
  /** The split button itself. Takes the row's slack on mobile so it fills the
   * line; the bell stays square at its end. */
  group: {
    flexGrow: { default: 1, [breakpoints.sm]: 0 },
    flexShrink: 0,
  },
  /**
   * The label segment takes the slack, so on mobile it fills the row and the
   * chevron stays square. On desktop the group is content-width, so there is no
   * slack to take and this is a no-op.
   *
   * `FollowUserButton` takes a single style, not a list — passing an array here
   * leaks straight through to the DOM `style` prop, so the accent variant below
   * repeats these rules rather than layering on top of them.
   */
  follow: {
    flexGrow: 1,
    justifyContent: "center",
  },
  /**
   * Same, plus the seam. Grouped buttons drop their inline-start border, so the
   * divider is the label segment's inline-end border; on the accent state the
   * design system paints it in the accent's own border step, which all but
   * disappears against the accent fill. One step darker keeps the split legible.
   */
  followAccent: {
    borderInlineEndColor: primaryColor.border3,
    flexGrow: 1,
    justifyContent: "center",
  },
});

/**
 * List membership for this author, as a submenu off "Add to list". Each list
 * shows a check when the author is already a member; selecting toggles it.
 *
 * The lists themselves are fetched by {@link AuthorActions} rather than here —
 * menu children only render once the popover opens, and hoisting the query keeps
 * the data-fetching out of the collection render.
 */
function ListsSubMenu({
  did,
  lists,
  onToggle,
}: {
  did: string;
  lists: Array<{ rkey: string; name: string; users: Array<string> }>;
  onToggle: (rkey: string, isMember: boolean) => void;
}) {
  const { t } = useLingui();

  return (
    <SubMenu
      trigger={
        <MenuItem
          suffix={<ListPlus size={MENU_ICON} />}
          textValue={t`Add to list`}
        >
          <Trans>Add to list</Trans>
        </MenuItem>
      }
    >
      {lists.length === 0 ? (
        <MenuItem isDisabled textValue={t`No lists yet`}>
          <Trans>No lists yet</Trans>
        </MenuItem>
      ) : (
        lists.map((list) => {
          const isMember = list.users.includes(did);
          return (
            <MenuItem
              key={list.rkey}
              onPress={() => onToggle(list.rkey, isMember)}
              suffix={isMember ? <Check size={MENU_ICON} /> : undefined}
              textValue={list.name}
            >
              <span dir="auto">{list.name}</span>
            </MenuItem>
          );
        })
      )}
    </SubMenu>
  );
}

/**
 * The author hero's action cluster, mirroring the publication hero: a split
 * button whose primary segment follows the author and whose chevron opens every
 * other action for the profile, then a notification bell.
 *
 * Two controls instead of six keeps the hero calm and reads the same on mobile,
 * where the split button goes full-width — the old profile shipped two separate
 * icon rows (one per breakpoint) with the same six buttons in each.
 *
 * On the reader's own profile the primary segment is "Profile settings" instead
 * of Follow, and the bell is dropped: there is nothing to follow or be notified
 * about that you don't already know.
 */
export function AuthorActions({
  did,
  handle,
  name,
  pageUrl,
  feedUrl,
  signedIn,
  isOwnProfile,
  user,
  onOpenSettings,
}: {
  did: string;
  handle: string | null;
  /** Author display name — used in the RSS dialog copy. */
  name: string;
  pageUrl: string;
  feedUrl: string;
  signedIn: boolean;
  isOwnProfile: boolean;
  /** Byline for the optimistic sidebar "People" row when following. */
  user: FollowingUser;
  onOpenSettings: () => void;
}) {
  const { t } = useLingui();
  const loginSearch = useLoginSearch();
  const queryClient = useQueryClient();
  const share = useShareActions({ pageUrl });
  const [rssOpen, setRssOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [muteOpen, setMuteOpen] = useState(false);

  const { data: followStatus } = useQuery({
    ...readerApi.getUserFollowStatusQueryOptions(did),
    enabled: signedIn && !isOwnProfile,
  });
  // Both segments share one variant so the split button reads as a single
  // control. Following is a settled state, so the group goes quiet with it — as
  // does the signed-out group, whose Follow is really a login link, and the
  // owner's group, whose primary is a settings shortcut rather than a call.
  const variant =
    signedIn && !isOwnProfile && !followStatus?.isFollowing
      ? "primary"
      : "secondary";

  const { data: lists } = useQuery({
    ...listApi.getListsQueryOptions(),
    enabled: signedIn && !isOwnProfile,
  });
  const addToList = useMutation(listApi.addUserToListMutationOptions());
  const removeFromList = useMutation(
    listApi.removeUserFromListMutationOptions(),
  );
  const toggleList = (rkey: string, isMember: boolean) => {
    const mutation = isMember ? removeFromList : addToList;
    mutation.mutate(
      { rkey, did },
      {
        onSettled: () => {
          void queryClient.invalidateQueries({ queryKey: ["reader", "lists"] });
          void queryClient.invalidateQueries({ queryKey: ["feed", "sidebar"] });
        },
      },
    );
  };

  // The author's Sifa résumé, if they published one. Fetched here rather than in
  // the menu item so the request doesn't ride on the collection render.
  const { data: resumeUrl } = useQuery(
    authorApi.getAuthorSifaProfileQueryOptions(did, handle),
  );

  return (
    <>
      <div {...stylex.props(styles.row)}>
        <ButtonGroup style={styles.group}>
          {isOwnProfile ? (
            <Button
              variant="secondary"
              size="lg"
              onPress={onOpenSettings}
              style={styles.follow}
            >
              <Settings size={18} aria-hidden />
              <Trans>Profile settings</Trans>
            </Button>
          ) : (
            <FollowUserButton
              did={did}
              signedIn={signedIn}
              user={user}
              size="lg"
              style={
                variant === "primary" ? styles.followAccent : styles.follow
              }
            />
          )}
          <Menu
            placement="bottom end"
            trigger={
              <IconButton variant={variant} label={t`More actions`} size="lg">
                <ChevronDown size={16} />
              </IconButton>
            }
          >
            {isOwnProfile ? null : signedIn ? (
              <ListsSubMenu
                did={did}
                lists={lists ?? []}
                onToggle={toggleList}
              />
            ) : (
              <MenuItemLink
                to="/login"
                search={loginSearch}
                suffix={<ListPlus size={MENU_ICON} />}
                textValue={t`Add to list`}
              >
                <Trans>Add to list</Trans>
              </MenuItemLink>
            )}
            {isOwnProfile ? null : <MenuSeparator />}

            <ShareMenuItems share={share} />

            <MenuSeparator />

            <MenuItem
              onPress={() => setRssOpen(true)}
              suffix={<Rss size={MENU_ICON} />}
              textValue={t`RSS feed`}
            >
              <Trans>RSS feed</Trans>
            </MenuItem>
            {handle ? (
              <MenuItem
                onPress={() => {
                  globalThis.open(
                    `https://bsky.app/profile/${handle}`,
                    "_blank",
                    "noopener,noreferrer",
                  );
                }}
                suffix={<ExternalLink size={MENU_ICON} />}
                textValue={t`View on Bluesky`}
              >
                <Trans>View on Bluesky</Trans>
              </MenuItem>
            ) : null}
            {resumeUrl ? (
              <MenuItem
                onPress={() => {
                  globalThis.open(resumeUrl, "_blank", "noopener,noreferrer");
                }}
                suffix={<FileText size={MENU_ICON} />}
                textValue={t`Resume`}
              >
                <Trans>Resume</Trans>
              </MenuItem>
            ) : null}
            {/* Last, and behind their own separator: muting and blocking are
                the items here that hide things rather than opening them. Mute
                first — it's the reversible, lighter-weight of the two. */}
            {isOwnProfile || !signedIn ? null : (
              <>
                <MenuSeparator />
                <MuteMenuItem
                  subject={did}
                  name={user.displayName ?? handle}
                  iconSize={MENU_ICON}
                  onOpenDialog={() => setMuteOpen(true)}
                />
                <BlockUserMenuItem
                  name={user.displayName ?? handle}
                  iconSize={MENU_ICON}
                  onPress={() => setBlockOpen(true)}
                />
              </>
            )}
          </Menu>
        </ButtonGroup>
        {isOwnProfile ? null : (
          <NotifyButton
            subjectType="author"
            subject={did}
            signedIn={signedIn}
            size="lg"
            // Takes the same variant as the split button beside it, so the two
            // controls read as one cluster instead of two unrelated buttons.
            variant={variant}
          />
        )}
      </div>

      <RssFeedDialog
        name={name}
        feedUrl={feedUrl}
        isOpen={rssOpen}
        onOpenChange={setRssOpen}
      />

      {/* Outside `<Menu>`, like the RSS dialog above: a dialog rendered inside
          the menu unmounts with the popover the moment the item is pressed. */}
      {isOwnProfile || !signedIn ? null : (
        <>
          <MuteDialog
            subject={did}
            kind="user"
            name={user.displayName ?? handle}
            isOpen={muteOpen}
            onOpenChange={setMuteOpen}
          />
          <BlockUserDialog
            did={did}
            name={user.displayName ?? handle}
            isOpen={blockOpen}
            onOpenChange={setBlockOpen}
          />
        </>
      )}
    </>
  );
}
