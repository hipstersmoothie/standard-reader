"use client";

import { Plural, Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowUpDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Compass,
  FolderPlus,
  Plus,
} from "lucide-react";
import { Button as AriaButton } from "react-aria-components";

import { AuthorProfileLink } from "#/components/reader/author-profile-link";
import { DirectionalIcon } from "#/design-system/directional-icon";
import { formatSidebarUnreadCount } from "#/lib/format-count";
import { useFormatters } from "#/lib/use-formatters";

import { Avatar } from "../../design-system/avatar";
import { Button } from "../../design-system/button";
import { ButtonGroup } from "../../design-system/button-group";
import {
  Disclosure,
  DisclosurePanel,
  DisclosureTitle,
} from "../../design-system/disclosure";
import {
  Drawer,
  DrawerBody,
  DrawerDescription,
  DrawerHeader,
} from "../../design-system/drawer";
import { IconButton } from "../../design-system/icon-button";
import { animationDuration } from "../../design-system/theme/animations.stylex";
import { primaryColor, uiColor } from "../../design-system/theme/color.stylex";
import { radius } from "../../design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  size,
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
import { parseInternalRoute } from "../../lib/internal-route";
import { initials, listLinkParams, publicationLinkParams } from "./format";
import { Handle } from "./primitives";

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
  /** Right-aligned reorder / collapse-all actions above the list groups. */
  groupToolbar: {
    justifyContent: "flex-end",
    marginTop: verticalSpace.sm,
  },
  /** No divider between grouped icon buttons. */
  toolbarIcon: {
    borderInlineEndColor: "transparent",
  },
  list: {
    display: "flex",
    flexDirection: "column",
  },
  pubRow: {
    font: "inherit",
    borderWidth: 0,
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":active": uiColor.bgSubtle,
    },
    color: "inherit",
    columnGap: gap.lg,
    cursor: "pointer",
    display: "flex",
    rowGap: gap.lg,
    textAlign: "start",
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: verticalSpace.lg,
    paddingInlineStart: horizontalSpace.sm,
    paddingInlineEnd: horizontalSpace.sm,
    paddingTop: verticalSpace.lg,
    width: "100%",
  },
  pubInfo: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  pubName: {
    overflow: "hidden",
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    lineHeight: 1.2,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  pubUnread: {
    borderRadius: radius.full,
    backgroundColor: primaryColor.component1,
    color: primaryColor.text2,
    flexShrink: 0,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textAlign: "center",
    minWidth: spacing["4"],
    paddingBottom: verticalSpace.xxs,
    paddingInlineStart: horizontalSpace.sm,
    paddingInlineEnd: horizontalSpace.sm,
    paddingTop: verticalSpace.xxs,
  },
  chevron: {
    color: uiColor.text1,
    flexShrink: 0,
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
  /** Tiny uppercase group header row (mirrors the desktop sidebar). */
  groupLabel: {
    alignItems: "center",
    color: uiColor.text1,
    columnGap: gap.sm,
    display: "flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    justifyContent: "space-between",
    letterSpacing: tracking.widest,
    rowGap: gap.sm,
    textTransform: "uppercase",
    paddingBottom: verticalSpace.xxs,
    paddingTop: verticalSpace.lg,
  },
  /** Group name as a link to the list's public page. */
  groupTitleLink: {
    textDecoration: {
      default: "none",
      ":hover": "underline",
    },
    alignItems: "center",
    color: uiColor.text1,
    display: "flex",
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  groupName: {
    overflow: "hidden",
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  },
  groupActions: {
    alignItems: "center",
    columnGap: gap.sm,
    display: "flex",
    rowGap: gap.sm,
  },
  /** Chevron-only disclosure trigger; sized to match the sm IconButton. */
  groupToggle: {
    borderRadius: radius.sm,
    justifyContent: "center",
    height: size["2xl"],
    paddingBottom: spacing["0"],
    paddingInlineStart: spacing["0"],
    paddingInlineEnd: spacing["0"],
    paddingTop: spacing["0"],
    width: size["2xl"],
  },
  groupPanelContent: {
    paddingBottom: spacing["0"],
    paddingInlineStart: spacing["0"],
    paddingInlineEnd: spacing["0"],
    paddingTop: spacing["0"],
  },
  /** Extra separation below an expanded group; collapses with the panel. */
  groupSpacer: {
    height: verticalSpace.sm,
  },
  groupEmpty: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    fontStyle: "italic",
    paddingBottom: verticalSpace.lg,
    paddingTop: verticalSpace.lg,
  },
});

function FollowingAvatar({
  name,
  iconUrl,
  style,
}: {
  name: string;
  iconUrl: string | null;
  style?: stylex.StyleXStyles;
}) {
  return (
    <Avatar
      size="sm"
      src={iconUrl ?? undefined}
      fallback={initials(name)}
      alt={name}
      style={style}
    />
  );
}

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

function SheetPubRow({
  pub,
  onNavigate,
}: {
  pub: FollowingPublication;
  onNavigate: () => void;
}) {
  const { t } = useLingui();
  const fmt = useFormatters();
  const navigate = useNavigate();

  const unreadCount = pub.unreadCount;

  const openPublication = () => {
    onNavigate();
    const params = publicationLinkParams(pub.uri);
    if (params) {
      void navigate({ to: "/p/$did/$rkey", params });
      return;
    }

    const href = pub.url;
    if (!href) return;

    const internal = parseInternalRoute(href);
    if (internal?.params) {
      void navigate({ to: internal.to, params: internal.params });
      return;
    }
    if (internal) {
      void navigate({ to: internal.to });
      return;
    }

    globalThis.open(href, "_blank", "noopener,noreferrer");
  };

  return (
    <AriaButton {...stylex.props(styles.pubRow)} onPress={openPublication}>
      <FollowingAvatar
        name={pub.name}
        iconUrl={pub.iconUrl ?? pub.ownerAvatarUrl}
      />
      <div {...stylex.props(styles.pubInfo)}>
        <div {...stylex.props(styles.pubName)}>{pub.name}</div>
        {pub.ownerHandle ? (
          <AuthorProfileLink
            authorRef={pub.did}
            onClick={(event) => event.stopPropagation()}
          >
            <Handle>@{pub.ownerHandle}</Handle>
          </AuthorProfileLink>
        ) : null}
      </div>
      {pub.unreadCount > 0 ? (
        <span
          {...stylex.props(styles.pubUnread)}
          aria-label={t`${unreadCount} unread`}
        >
          {formatSidebarUnreadCount(fmt, pub.unreadCount)}
        </span>
      ) : null}
      <DirectionalIcon as={ChevronRight} size={16} style={styles.chevron} />
    </AriaButton>
  );
}

function SheetUserRow({
  user: followed,
  onNavigate,
}: {
  user: FollowingUser;
  onNavigate: () => void;
}) {
  const { t } = useLingui();
  const fmt = useFormatters();
  const navigate = useNavigate();
  const name =
    followed.displayName ??
    (followed.handle ? `@${followed.handle}` : followed.did);
  const unreadCount = followed.unreadCount ?? 0;
  return (
    <AriaButton
      {...stylex.props(styles.pubRow)}
      onPress={() => {
        onNavigate();
        void navigate({ to: "/u/$did", params: { did: followed.did } });
      }}
    >
      <FollowingAvatar name={name} iconUrl={followed.avatarUrl} />
      <div {...stylex.props(styles.pubInfo)}>
        <div {...stylex.props(styles.pubName)}>{name}</div>
        {followed.handle ? <Handle>@{followed.handle}</Handle> : null}
      </div>
      {unreadCount > 0 ? (
        <span
          {...stylex.props(styles.pubUnread)}
          aria-label={t`${unreadCount} unread`}
        >
          {formatSidebarUnreadCount(fmt, unreadCount)}
        </span>
      ) : null}
      <DirectionalIcon as={ChevronRight} size={16} style={styles.chevron} />
    </AriaButton>
  );
}

function SheetListGroup({
  group,
  onNavigate,
  isExpanded,
  onExpandedChange,
}: {
  group: SubscriptionListGroup;
  onNavigate: () => void;
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const { t } = useLingui();
  const fmt = useFormatters();
  const link = listLinkParams(group.listUri);
  const listName = group.name;
  const unreadTotal =
    group.pubs.reduce((sum, pub) => sum + pub.unreadCount, 0) +
    group.users.reduce((sum, person) => sum + (person.unreadCount ?? 0), 0);

  return (
    <Disclosure isExpanded={isExpanded} onExpandedChange={onExpandedChange}>
      <div {...stylex.props(styles.groupLabel)}>
        {link ? (
          <Link
            to="/l/$did/$rkey"
            params={link}
            aria-label={t`Open list ${listName}`}
            onClick={onNavigate}
            {...stylex.props(styles.groupTitleLink)}
          >
            <span {...stylex.props(styles.groupName)}>{group.name}</span>
          </Link>
        ) : (
          <span {...stylex.props(styles.groupName)}>{group.name}</span>
        )}
        <div {...stylex.props(styles.groupActions)}>
          {unreadTotal > 0 ? (
            <span>{formatSidebarUnreadCount(fmt, unreadTotal)}</span>
          ) : null}
          <DisclosureTitle
            style={styles.groupToggle}
            aria-label={t`Toggle list ${listName}`}
          >
            {null}
          </DisclosureTitle>
        </div>
      </div>
      <DisclosurePanel contentStyle={styles.groupPanelContent}>
        <div {...stylex.props(styles.list)}>
          {group.pubs.length === 0 && group.users.length === 0 ? (
            <span {...stylex.props(styles.groupEmpty)}>
              <Trans>Empty list.</Trans>
            </span>
          ) : (
            <>
              {group.pubs.map((pub) => (
                <SheetPubRow key={pub.uri} pub={pub} onNavigate={onNavigate} />
              ))}
              {group.users.map((person) => (
                <SheetUserRow
                  key={person.did}
                  user={person}
                  onNavigate={onNavigate}
                />
              ))}
            </>
          )}
        </div>
        <div {...stylex.props(styles.groupSpacer)} aria-hidden />
      </DisclosurePanel>
    </Disclosure>
  );
}

export function SubscriptionsSheet({
  isOpen,
  onOpenChange,
  following,
  ungrouped,
  groups,
  onAddPublication,
  onNewList,
  onReorder,
  allCollapsed = false,
  onToggleAll,
  isCollapsed,
  onSetCollapsed,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  following: Array<FollowingPublication>;
  /** Follows not shown inside a list group (rendered flat, no label). */
  ungrouped: Array<FollowingPublication>;
  groups: Array<SubscriptionListGroup>;
  onAddPublication: () => void;
  /** Opens the new-list modal; omit when signed out. */
  onNewList?: () => void;
  /** Opens the reorder-lists dialog; omit when unavailable (signed out / no lists). */
  onReorder?: () => void;
  /** Whether every list group is currently collapsed (drives the toggle icon). */
  allCollapsed?: boolean;
  /** Collapse or expand every group at once; omit when there are no groups. */
  onToggleAll?: () => void;
  /** Whether a given group (by list AT-URI) is collapsed. */
  isCollapsed?: (listUri: string) => boolean;
  /** Persist a single group's collapsed state. */
  onSetCollapsed?: (listUri: string, collapsed: boolean) => void;
}) {
  const { t } = useLingui();
  const navigate = useNavigate();

  const close = () => onOpenChange(false);

  const openDiscover = () => {
    close();
    void navigate({ to: "/discover" });
  };

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

        <div {...stylex.props(styles.list)}>
          {following.length === 0 && groups.length === 0 ? (
            <p {...stylex.props(styles.emptyNote)}>
              <Trans>You aren&apos;t following anything yet.</Trans>
            </p>
          ) : (
            ungrouped.map((pub) => (
              <SheetPubRow key={pub.uri} pub={pub} onNavigate={close} />
            ))
          )}
        </div>
        {groups.length > 0 && (onToggleAll || onReorder) ? (
          <ButtonGroup
            aria-label={t`Subscription list actions`}
            style={styles.groupToolbar}
          >
            {onReorder ? (
              <IconButton
                aria-label={t`Reorder lists`}
                size="sm"
                variant="tertiary"
                style={styles.toolbarIcon}
                onPress={onReorder}
              >
                <ArrowUpDown size={16} />
              </IconButton>
            ) : null}
            {onToggleAll ? (
              <IconButton
                aria-label={
                  allCollapsed ? t`Expand all lists` : t`Collapse all lists`
                }
                size="sm"
                variant="tertiary"
                style={styles.toolbarIcon}
                onPress={onToggleAll}
              >
                {allCollapsed ? (
                  <ChevronsUpDown size={16} />
                ) : (
                  <ChevronsDownUp size={16} />
                )}
              </IconButton>
            ) : null}
          </ButtonGroup>
        ) : null}
        {groups.map((group) => (
          <SheetListGroup
            key={group.key}
            group={group}
            onNavigate={close}
            isExpanded={isCollapsed ? !isCollapsed(group.listUri) : true}
            onExpandedChange={(expanded) =>
              onSetCollapsed?.(group.listUri, !expanded)
            }
          />
        ))}

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
