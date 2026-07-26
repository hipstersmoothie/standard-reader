"use client";

import { Plural, Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowDownWideNarrow,
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  Compass,
  FolderPlus,
  GripVertical,
  Plus,
  Settings,
} from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import type { DragAndDropHooks } from "react-aria-components";

import { formatSidebarUnreadCount } from "#/lib/format-count";
import { useFormatters } from "#/lib/use-formatters";

import { Button } from "../../design-system/button";
import {
  Drawer,
  DrawerBody,
  DrawerDescription,
  DrawerHeader,
} from "../../design-system/drawer";
import { Flex } from "../../design-system/flex";
import { IconButton } from "../../design-system/icon-button";
import { Menu, MenuItem, SubMenu } from "../../design-system/menu";
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
  tracking,
} from "../../design-system/theme/typography.stylex";
import type {
  FollowingPublication,
  FollowingUser,
} from "../../integrations/tanstack-query/api-feed.functions";
import type { SidebarPref } from "../../integrations/tanstack-query/api-sidebar-prefs.functions";
import type { TreeListNode, TreeTopNode } from "./subscriptions-tree";
import { SubscriptionsTree } from "./subscriptions-tree";

/** One sidebar list group (own or saved), precomputed by the app shell. */
export interface SubscriptionListGroup {
  key: string;
  name: string;
  /** AT-URI of the list; links the group to its public `/l/$did/$rkey` page. */
  listUri: string;
  /** Rkey of an own list (null for a saved list — not editable by this reader). */
  rkey: string | null;
  /** Whether this reader owns the list (can edit its membership). */
  editable: boolean;
  pubs: Array<FollowingPublication>;
  /** Followed users in this list (the people-in-lists grouping). */
  users: Array<FollowingUser>;
}

const styles = stylex.create({
  switcher: {
    borderColor: uiColor.border1,
    borderRadius: radius.sm,
    borderStyle: "solid",
    borderWidth: 1,
    alignItems: "center",
    backgroundColor: {
      default: uiColor.bg,
      ":active": uiColor.bgSubtle,
    },
    color: uiColor.text2,
    columnGap: gap.sm,
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    rowGap: gap.sm,
    transitionDuration: animationDuration.default,
    transitionProperty: "background-color, border-color",
    whiteSpace: "nowrap",
    height: spacing["9"],
    paddingInlineStart: horizontalSpace.lg,
    paddingInlineEnd: horizontalSpace.lg,
  },
  switcherCount: {
    borderRadius: radius.full,
    backgroundColor: uiColor.component1,
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    paddingBottom: verticalSpace.none,
    paddingInlineStart: horizontalSpace.md,
    paddingInlineEnd: horizontalSpace.md,
    paddingTop: verticalSpace.none,
  },
  actionRow: {
    columnGap: gap.sm,
    display: "flex",
    rowGap: gap.sm,
    marginBottom: verticalSpace.sm,
  },
  actionButton: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
  },
  /** Right-aligned tree actions (sort / reorder / collapse-all) menu trigger,
   * above the subscriptions tree — mirrors the desktop sidebar's header. */
  treeToolbar: {
    marginBottom: verticalSpace.sm,
  },
  discoverLink: {
    borderWidth: 0,
    alignItems: "center",
    backgroundColor: "transparent",
    color: primaryColor.text2,
    columnGap: gap.sm,
    cursor: "pointer",
    display: "flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    justifyContent: "center",
    opacity: {
      default: 1,
      ":active": 0.7,
    },
    rowGap: gap.sm,
    marginTop: verticalSpace.lg,
    paddingBottom: verticalSpace.lg,
    paddingTop: verticalSpace.lg,
    width: "100%",
  },
  sheetHeader: {
    margin: 0,
    alignItems: "flex-start",
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
    height: "auto",
    paddingBottom: verticalSpace.sm,
    paddingTop: verticalSpace.lg,
  },
  sheetSubtitle: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace.none,
    paddingBottom: verticalSpace.lg,
    paddingTop: verticalSpace.none,
  },
  emptyNote: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontStyle: "italic",
    textAlign: "center",
    paddingBottom: verticalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
  },
});

/**
 * Mobile stand-in for the sidebar's subscriptions list. The badge counts
 * *unread* articles, not subscriptions — same number the sidebar's "Latest"
 * item carries, since that's the one worth a glance from the top bar.
 */
export function SubscriptionsSwitcher({
  unreadCount,
  onPress,
}: {
  unreadCount: number | null;
  onPress: () => void;
}) {
  const { t } = useLingui();
  const fmt = useFormatters();

  return (
    <AriaButton {...stylex.props(styles.switcher)} onPress={onPress}>
      <Trans>Subscriptions</Trans>
      {unreadCount != null && unreadCount > 0 ? (
        <span
          {...stylex.props(styles.switcherCount)}
          aria-label={t`${unreadCount} unread`}
        >
          {formatSidebarUnreadCount(fmt, unreadCount)}
        </span>
      ) : null}
    </AriaButton>
  );
}

export function SubscriptionsSheet({
  isOpen,
  onOpenChange,
  following,
  topNodes,
  groupNodes,
  dragAndDropHooks,
  dragEnabled,
  onAddPublication,
  onNewList,
  allCollapsed = false,
  onToggleAll,
  isCollapsed,
  onSetCollapsed,
  subscriptionSort,
  onSetSubscriptionSort,
  reorderMode,
  onReorderModeChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  following: Array<FollowingPublication>;
  /** List groups + ungrouped rows as one top-level order — shared with the
   * desktop sidebar (see `subscriptions-tree.tsx`). */
  topNodes: Array<TreeTopNode>;
  groupNodes: Array<TreeListNode>;
  dragAndDropHooks: DragAndDropHooks;
  dragEnabled: boolean;
  onAddPublication: () => void;
  /** Opens the new-list modal; omit when signed out. */
  onNewList?: () => void;
  /** Whether every list group is currently collapsed (drives the toggle icon). */
  allCollapsed?: boolean;
  /** Collapse or expand every group at once; omit when there are no groups. */
  onToggleAll?: () => void;
  /** Whether a given group (by list AT-URI) is collapsed. */
  isCollapsed: (listUri: string) => boolean;
  /** Persist a single group's collapsed state. */
  onSetCollapsed: (listUri: string, collapsed: boolean) => void;
  subscriptionSort: SidebarPref["subscriptionSort"];
  onSetSubscriptionSort: (sort: SidebarPref["subscriptionSort"]) => void;
  /** Whether the tree is in drag-to-reorder mode (local, unpersisted — shared
   * with the desktop sidebar so only one toggle exists per reader session). */
  reorderMode: boolean;
  onReorderModeChange: (mode: boolean) => void;
}) {
  const { t } = useLingui();
  const navigate = useNavigate();

  const close = () => onOpenChange(false);

  const openDiscover = () => {
    close();
    void navigate({ to: "/discover" });
  };

  const hasContent = topNodes.length > 0;
  const hasListGroups = groupNodes.length > 0;

  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      direction="bottom"
      size="md"
      trigger={<span hidden aria-hidden />}
    >
      <DrawerHeader style={styles.sheetHeader}>
        <Trans>Subscriptions</Trans>
      </DrawerHeader>
      <DrawerDescription style={styles.sheetSubtitle}>
        <Plural
          value={following.length}
          one="# publication"
          other="# publications"
        />
      </DrawerDescription>
      <DrawerBody scroll>
        <div {...stylex.props(styles.actionRow)}>
          <Button
            variant="primary"
            style={styles.actionButton}
            onPress={onAddPublication}
            size="lg"
          >
            <Plus size={17} /> <Trans>Add publication</Trans>
          </Button>
          {onNewList ? (
            <Button
              variant="secondary"
              style={styles.actionButton}
              onPress={onNewList}
              size="lg"
            >
              <FolderPlus size={17} /> <Trans>New list</Trans>
            </Button>
          ) : null}
        </div>

        {hasContent ? (
          <>
            <Flex justify="end" style={styles.treeToolbar}>
              {reorderMode ? (
                <IconButton
                  aria-label={t`Finish reordering`}
                  size="sm"
                  variant="tertiary"
                  onPress={() => onReorderModeChange(false)}
                >
                  <Check size={14} />
                </IconButton>
              ) : (
                <Menu
                  trigger={
                    <IconButton
                      aria-label={t`Subscription list actions`}
                      size="sm"
                      variant="tertiary"
                    >
                      <Settings size={14} />
                    </IconButton>
                  }
                  placement="bottom end"
                >
                  <SubMenu
                    trigger={
                      <MenuItem prefix={<ArrowDownWideNarrow size={14} />}>
                        <Trans>Sort</Trans>
                      </MenuItem>
                    }
                    placement="left top"
                    selectionMode="single"
                    selectedKeys={new Set([subscriptionSort])}
                  >
                    <MenuItem
                      id="default"
                      onAction={() => onSetSubscriptionSort("default")}
                    >
                      <Trans>Default</Trans>
                    </MenuItem>
                    <MenuItem
                      id="recent"
                      onAction={() => onSetSubscriptionSort("recent")}
                    >
                      <Trans>Recent activity</Trans>
                    </MenuItem>
                    <MenuItem
                      id="alpha"
                      onAction={() => onSetSubscriptionSort("alpha")}
                    >
                      <Trans>A–Z</Trans>
                    </MenuItem>
                    <MenuItem
                      id="unread"
                      onAction={() => onSetSubscriptionSort("unread")}
                    >
                      <Trans>Most unread</Trans>
                    </MenuItem>
                  </SubMenu>
                  <MenuItem
                    prefix={<GripVertical size={14} />}
                    isDisabled={subscriptionSort !== "default"}
                    onAction={() => onReorderModeChange(!reorderMode)}
                  >
                    <Trans>Reorder subscriptions…</Trans>
                  </MenuItem>
                  {hasListGroups && onToggleAll ? (
                    <MenuItem
                      prefix={
                        allCollapsed ? (
                          <ChevronsUpDown size={14} />
                        ) : (
                          <ChevronsDownUp size={14} />
                        )
                      }
                      onAction={onToggleAll}
                    >
                      {allCollapsed ? (
                        <Trans>Expand all lists</Trans>
                      ) : (
                        <Trans>Collapse all lists</Trans>
                      )}
                    </MenuItem>
                  ) : null}
                </Menu>
              )}
            </Flex>
            <SubscriptionsTree
              topNodes={topNodes}
              groupNodes={groupNodes}
              dragAndDropHooks={dragAndDropHooks}
              dragEnabled={dragEnabled}
              isCollapsed={isCollapsed}
              setCollapsed={onSetCollapsed}
              onNavigate={close}
            />
          </>
        ) : (
          <p {...stylex.props(styles.emptyNote)}>
            <Trans>You aren&apos;t following anything yet.</Trans>
          </p>
        )}

        <AriaButton
          {...stylex.props(styles.discoverLink)}
          onPress={openDiscover}
        >
          <Compass size={16} />
          <Trans>Discover more publications</Trans>
        </AriaButton>
      </DrawerBody>
    </Drawer>
  );
}
