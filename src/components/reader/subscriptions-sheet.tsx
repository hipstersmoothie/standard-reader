"use client";

import * as stylex from "@stylexjs/stylex";
import { Link, useNavigate } from "@tanstack/react-router";
import { AuthorProfileLink } from "#/components/reader/author-profile-link";
import { ChevronRight, Compass, FolderPlus, Plus } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";

import type { FollowingPublication } from "../../integrations/tanstack-query/api-feed.functions";

import { Avatar } from "../../design-system/avatar";
import { Button } from "../../design-system/button";
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
import { parseInternalRoute } from "../../lib/internal-route";
import { initials, listLinkParams, publicationLinkParams } from "./format";
import { Handle } from "./primitives";

/** One sidebar list group (own or saved), precomputed by the app shell. */
export interface SubscriptionListGroup {
  key: string;
  name: string;
  /** AT-URI of the list; links the group to its public `/l/$did/$rkey` page. */
  listUri: string;
  pubs: Array<FollowingPublication>;
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
    paddingLeft: horizontalSpace.lg,
    paddingRight: horizontalSpace.lg,
  },
  switcherCount: {
    borderRadius: radius.full,
    backgroundColor: uiColor.component1,
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    paddingBottom: verticalSpace.none,
    paddingLeft: horizontalSpace.md,
    paddingRight: horizontalSpace.md,
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
    textAlign: "left",
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: verticalSpace.lg,
    paddingLeft: horizontalSpace.sm,
    paddingRight: horizontalSpace.sm,
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
    paddingLeft: horizontalSpace.sm,
    paddingRight: horizontalSpace.sm,
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
    paddingLeft: spacing["0"],
    paddingRight: spacing["0"],
    paddingTop: spacing["0"],
    width: size["2xl"],
  },
  groupPanelContent: {
    paddingBottom: spacing["0"],
    paddingLeft: spacing["0"],
    paddingRight: spacing["0"],
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

export function SubscriptionsSwitcher({
  count,
  onPress,
}: {
  count: number;
  onPress: () => void;
}) {
  return (
    <AriaButton {...stylex.props(styles.switcher)} onPress={onPress}>
      Subscriptions
      {count > 0 ? (
        <span {...stylex.props(styles.switcherCount)}>{count}</span>
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
  const navigate = useNavigate();

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
          aria-label={`${pub.unreadCount} unread`}
        >
          {pub.unreadCount}
        </span>
      ) : null}
      <ChevronRight aria-hidden size={16} {...stylex.props(styles.chevron)} />
    </AriaButton>
  );
}

function SheetListGroup({
  group,
  onNavigate,
}: {
  group: SubscriptionListGroup;
  onNavigate: () => void;
}) {
  const link = listLinkParams(group.listUri);
  const unreadTotal = group.pubs.reduce((sum, pub) => sum + pub.unreadCount, 0);

  return (
    <Disclosure defaultExpanded>
      <div {...stylex.props(styles.groupLabel)}>
        {link ? (
          <Link
            to="/l/$did/$rkey"
            params={link}
            aria-label={`Open list ${group.name}`}
            onClick={onNavigate}
            {...stylex.props(styles.groupTitleLink)}
          >
            <span {...stylex.props(styles.groupName)}>{group.name}</span>
          </Link>
        ) : (
          <span {...stylex.props(styles.groupName)}>{group.name}</span>
        )}
        <div {...stylex.props(styles.groupActions)}>
          {unreadTotal > 0 ? <span>{unreadTotal}</span> : null}
          <DisclosureTitle
            style={styles.groupToggle}
            aria-label={`Toggle list ${group.name}`}
          >
            {null}
          </DisclosureTitle>
        </div>
      </div>
      <DisclosurePanel contentStyle={styles.groupPanelContent}>
        <div {...stylex.props(styles.list)}>
          {group.pubs.length === 0 ? (
            <span {...stylex.props(styles.groupEmpty)}>Empty list.</span>
          ) : (
            group.pubs.map((pub) => (
              <SheetPubRow key={pub.uri} pub={pub} onNavigate={onNavigate} />
            ))
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
}) {
  const navigate = useNavigate();
  const countLabel = `${following.length} publication${following.length === 1 ? "" : "s"}`;

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
      <DrawerHeader style={styles.sheetHeader}>Subscriptions</DrawerHeader>
      <DrawerDescription style={styles.sheetSubtitle}>
        {countLabel}
      </DrawerDescription>
      <DrawerBody scroll>
        <div {...stylex.props(styles.actionRow)}>
          <Button
            variant="primary"
            style={styles.actionButton}
            onPress={onAddPublication}
            size="lg"
          >
            <Plus size={17} /> Add publication
          </Button>
          {onNewList ? (
            <Button
              variant="secondary"
              style={styles.actionButton}
              onPress={onNewList}
              size="lg"
            >
              <FolderPlus size={17} /> New list
            </Button>
          ) : null}
        </div>

        <div {...stylex.props(styles.list)}>
          {following.length === 0 && groups.length === 0 ? (
            <p {...stylex.props(styles.emptyNote)}>
              You aren&apos;t following anything yet.
            </p>
          ) : (
            ungrouped.map((pub) => (
              <SheetPubRow key={pub.uri} pub={pub} onNavigate={close} />
            ))
          )}
        </div>
        {groups.map((group) => (
          <SheetListGroup key={group.key} group={group} onNavigate={close} />
        ))}

        <AriaButton
          {...stylex.props(styles.discoverLink)}
          onPress={openDiscover}
        >
          <Compass size={16} />
          Discover more publications
        </AriaButton>
      </DrawerBody>
    </Drawer>
  );
}
