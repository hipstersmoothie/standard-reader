"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Avatar } from "@standard-reader/design-system/avatar";
import {
  focusColor,
  primaryColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  size,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { useRouter } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import {
  Button as AriaButton,
  Tree,
  TreeItem,
  TreeItemContent,
} from "react-aria-components";
import type { DragAndDropHooks } from "react-aria-components";

import type {
  FollowingPublication,
  FollowingUser,
} from "../../integrations/tanstack-query/api-feed.functions";
import { formatSidebarUnreadCount } from "../../lib/format-count";
import { parseInternalRoute } from "../../lib/internal-route";
import { useFormatters } from "../../lib/use-formatters";
import { initials, listLinkParams, publicationLinkParams } from "./format";
import type { OrderableSubscription } from "./use-sidebar-pref";

/** One row in the subscriptions tree's flat (ungrouped) rows — a publication
 * or a person, normalized so `orderSubscriptions` can sort them together. */
export type FlatSubscription = OrderableSubscription &
  (
    | { kind: "publication"; pub: FollowingPublication }
    | { kind: "person"; user: FollowingUser }
  );

/** A list group as a top-level tree node — its own members (pubs + people,
 * combined into one display order) render as its children. */
export interface TreeListNode extends OrderableSubscription {
  kind: "list";
  listUri: string;
  /** Rkey of an own list; null for a saved list (not editable by this reader). */
  rkey: string | null;
  editable: boolean;
  members: Array<FlatSubscription>;
}

/** One top-level row in the subscriptions tree: a list group or an ungrouped
 * publication/person. */
export type TreeTopNode = TreeListNode | FlatSubscription;

/** A list group with its display-ready members, as produced by whichever
 * surface (desktop sidebar or mobile sheet) computes `displayGroups`. */
export interface TreeDisplayGroup {
  listUri: string;
  rkey: string | null;
  editable: boolean;
  name: string;
  unreadCount: number;
  recentAt: string | null;
  members: Array<FlatSubscription>;
}

const styles = stylex.create({
  followList: {
    columnGap: gap.none,
    display: "flex",
    flexDirection: "column",
    rowGap: gap.none,
  },
  /** A member row (publication or person) — same look whether it's a
   * top-level ungrouped row or nested inside a list; deliberately no
   * level-based indent so nested rows line up flush with top-level ones. */
  memberRow: {
    alignItems: "center",
    borderRadius: radius.sm,
    backgroundColor: {
      default: "transparent",
      ":is([data-hovered])": uiColor.component2,
    },
    outline: {
      default: "none",
      ":is([data-focus-visible])": `2px solid ${focusColor.ring}`,
    },
    outlineOffset: "-2px",
    color: "inherit",
    columnGap: gap.lg,
    cursor: "pointer",
    display: "flex",
    rowGap: gap.lg,
    paddingBottom: verticalSpace.sm,
    paddingInlineStart: horizontalSpace.lg,
    paddingInlineEnd: horizontalSpace.lg,
    paddingTop: verticalSpace.sm,
  },
  memberName: {
    unicodeBidi: "isolate",
    overflow: "hidden",
    color: uiColor.text2,
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  },
  /** A list group's header row — the same uppercase section-label look the
   * sidebar always used for group titles. */
  groupHeaderRow: {
    alignItems: "center",
    borderRadius: radius.sm,
    backgroundColor: {
      default: "transparent",
      ":is([data-hovered])": uiColor.component2,
    },
    outline: {
      default: "none",
      ":is([data-focus-visible])": `2px solid ${focusColor.ring}`,
    },
    outlineOffset: "-2px",
    cursor: "pointer",
    color: uiColor.text1,
    // Same columnGap as memberRow: with a drag handle of the same width
    // preceding both, this keeps the group name and a nested member's avatar
    // starting at the exact same x-position, whether or not dragging is on.
    columnGap: gap.lg,
    display: "flex",
    fontFamily: fontFamily.sans,
    fontSize: "0.65rem",
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.widest,
    textTransform: "uppercase",
    paddingBottom: verticalSpace.xxs,
    paddingInlineStart: horizontalSpace.lg,
    paddingInlineEnd: horizontalSpace.lg,
    paddingTop: verticalSpace.lg,
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
  /** Groups the unread count with the chevron, flush against each other (no
   * gap) — only the row's other children (drag handle, name) get the row's
   * own columnGap; matches the original sidebar's `sideLabelActions`. */
  groupHeaderActions: {
    alignItems: "center",
    display: "flex",
  },
  listEmpty: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    fontStyle: "italic",
    paddingInlineStart: horizontalSpace.lg,
    paddingInlineEnd: horizontalSpace.lg,
  },
  chevronButton: {
    alignItems: "center",
    borderWidth: 0,
    backgroundColor: "transparent",
    color: "inherit",
    display: "flex",
    flexShrink: 0,
    justifyContent: "center",
    outline: {
      default: "none",
      ":is([data-focus-visible])": `2px solid ${focusColor.ring}`,
    },
    outlineOffset: "2px",
    height: size["2xl"],
    paddingBottom: spacing["0"],
    paddingInlineStart: spacing["0"],
    paddingInlineEnd: spacing["0"],
    paddingTop: spacing["0"],
    width: size["2xl"],
  },
  dragHandle: {
    alignItems: "center",
    borderWidth: 0,
    backgroundColor: "transparent",
    color: uiColor.text1,
    cursor: "grab",
    display: "flex",
    flexShrink: 0,
    // flex-start, not center: the icon sits flush against the button's own
    // (left) edge, which is where content normally starts — centering it
    // here would visually indent the icon from that edge.
    justifyContent: "flex-start",
    outline: {
      default: "none",
      ":is([data-focus-visible])": `2px solid ${focusColor.ring}`,
    },
    outlineOffset: "2px",
    // Matches FollowingAvatar's own ("sm") height exactly, so a row's
    // cross-axis size (and therefore its total height) is identical whether
    // or not the drag handle is rendered — toggling reorder mode must never
    // make rows taller. Narrower than tall (unlike the header's "sm"
    // IconButton, size["2xl"] square) so the gap to the avatar/label that
    // follows isn't inflated by empty trailing space inside the button.
    height: size.xl,
    paddingBottom: spacing["0"],
    paddingInlineStart: spacing["0"],
    paddingInlineEnd: spacing["0"],
    paddingTop: spacing["0"],
    width: size.lg,
  },
  /** Highlights a list row while it's the active "on" drop target (dropping a
   * member INTO the list), distinct from the between-rows line indicator. */
  treeItemDropTarget: {
    borderRadius: radius.sm,
    backgroundColor: {
      default: "transparent",
      ":is([data-drop-target])": primaryColor.component2,
    },
    outline: {
      default: "none",
      ":is([data-drop-target])": `2px solid ${primaryColor.solid1}`,
    },
    outlineOffset: "-2px",
  },
  followUnread: {
    borderRadius: radius.full,
    backgroundColor: primaryColor.component3,
    color: primaryColor.text2,
    flexShrink: 0,
    fontFamily: fontFamily.mono,
    fontSize: "0.65rem",
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.none,
    textAlign: "center",
    minWidth: spacing["4"],
    paddingBottom: verticalSpace.xxs,
    paddingInlineStart: horizontalSpace.sm,
    paddingInlineEnd: horizontalSpace.sm,
    paddingTop: verticalSpace.xxs,
  },
});

export function FollowingAvatar({
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

export function UnreadBadge({ count }: { count: number }) {
  const { t } = useLingui();
  const fmt = useFormatters();
  return (
    <span
      {...stylex.props(styles.followUnread)}
      aria-label={t`${count} unread`}
    >
      {formatSidebarUnreadCount(fmt, count)}
    </span>
  );
}

/** Navigate to a publication's page (on-site route, resolved internal link, or
 * external url in a new tab) — mirrors the resolution order the old sidebar
 * `<Link>` rows used. */
function navigateToPublication(
  router: ReturnType<typeof useRouter>,
  pub: FollowingPublication,
): void {
  const params = publicationLinkParams(pub.uri);
  if (params) {
    void router.navigate({ to: "/p/$did/$rkey", params });
    return;
  }
  const href = pub.url;
  if (!href) return;
  const internal = parseInternalRoute(href);
  if (internal?.params) {
    void router.navigate({ to: internal.to, params: internal.params });
    return;
  }
  if (internal) {
    void router.navigate({ to: internal.to });
    return;
  }
  window.open(href, "_blank", "noopener,noreferrer");
}

function navigateToUser(
  router: ReturnType<typeof useRouter>,
  followed: FollowingUser,
): void {
  void router.navigate({ to: "/u/$did", params: { did: followed.did } });
}

function navigateToList(
  router: ReturnType<typeof useRouter>,
  listUri: string,
): void {
  const link = listLinkParams(listUri);
  if (link) {
    void router.navigate({ to: "/l/$did/$rkey", params: link });
  }
}

export interface SubscriptionsTreeData {
  topNodes: Array<TreeTopNode>;
  groupNodes: Array<TreeListNode>;
  groupById: Map<string, TreeListNode>;
  dragAndDropHooks: DragAndDropHooks;
}

/**
 * Renders the subscriptions tree: list groups (collapsible, own members as
 * children) and ungrouped publications/people share a single tree so they
 * can be freely drag-and-dropped relative to each other — reorder lists,
 * reorder or move members between lists, and move members in or out of
 * lists. Shared by the desktop sidebar and the mobile sheet.
 */
export function SubscriptionsTree({
  topNodes,
  groupNodes,
  dragAndDropHooks,
  dragEnabled,
  isCollapsed,
  setCollapsed,
  onNavigate,
  style,
}: {
  topNodes: Array<TreeTopNode>;
  groupNodes: Array<TreeListNode>;
  dragAndDropHooks: DragAndDropHooks;
  dragEnabled: boolean;
  isCollapsed: (listUri: string) => boolean;
  setCollapsed: (listUri: string, collapsed: boolean) => void;
  onNavigate?: () => void;
  style?: stylex.StyleXStyles;
}) {
  const { t } = useLingui();
  const fmt = useFormatters();
  const router = useRouter();

  const go = (action: () => void) => () => {
    onNavigate?.();
    action();
  };

  return (
    <Tree
      aria-label={t`Subscriptions`}
      items={topNodes}
      selectionMode="none"
      {...stylex.props(styles.followList, style)}
      dragAndDropHooks={dragAndDropHooks}
      expandedKeys={
        new Set(
          groupNodes.filter((g) => !isCollapsed(g.listUri)).map((g) => g.id),
        )
      }
      onExpandedChange={(keys) => {
        for (const g of groupNodes) {
          const shouldExpand = keys.has(g.id);
          const currentlyExpanded = !isCollapsed(g.listUri);
          if (shouldExpand !== currentlyExpanded) {
            setCollapsed(g.listUri, !shouldExpand);
          }
        }
      }}
    >
      {(node: TreeTopNode) =>
        node.kind === "list" ? (
          <TreeItem
            id={node.id}
            textValue={node.name}
            // Always has at least one child (real members or the "Empty
            // list." placeholder) — react-aria's own `hasChildItems`
            // heuristic only counts >1 children, which would hide the
            // chevron for a single-member list.
            hasChildItems
            onAction={go(() => navigateToList(router, node.listUri))}
            {...stylex.props(styles.treeItemDropTarget)}
          >
            <TreeItemContent>
              {({ hasChildItems, isExpanded }) => (
                <div {...stylex.props(styles.groupHeaderRow)}>
                  {dragEnabled ? (
                    <AriaButton
                      slot="drag"
                      {...stylex.props(styles.dragHandle)}
                    >
                      <GripVertical aria-hidden size={14} />
                    </AriaButton>
                  ) : null}
                  <span {...stylex.props(styles.groupName)}>{node.name}</span>
                  <div {...stylex.props(styles.groupHeaderActions)}>
                    {node.unreadCount > 0 ? (
                      <span aria-label={t`${node.unreadCount} unread`}>
                        {formatSidebarUnreadCount(fmt, node.unreadCount)}
                      </span>
                    ) : null}
                    {hasChildItems ? (
                      <AriaButton
                        slot="chevron"
                        {...stylex.props(styles.chevronButton)}
                      >
                        {isExpanded ? (
                          <ChevronDown aria-hidden size={14} />
                        ) : (
                          <ChevronRight aria-hidden size={14} />
                        )}
                      </AriaButton>
                    ) : null}
                  </div>
                </div>
              )}
            </TreeItemContent>
            {node.members.length === 0 ? (
              <TreeItem
                id={`${node.id}#empty`}
                textValue={t`Empty list.`}
                isDisabled
              >
                <TreeItemContent>
                  <span {...stylex.props(styles.listEmpty)}>
                    <Trans>Empty list.</Trans>
                  </span>
                </TreeItemContent>
              </TreeItem>
            ) : (
              node.members.map((member) => (
                <TreeItem
                  key={member.id}
                  id={member.id}
                  textValue={member.name}
                  onAction={go(() =>
                    member.kind === "publication"
                      ? navigateToPublication(router, member.pub)
                      : navigateToUser(router, member.user),
                  )}
                >
                  <TreeItemContent>
                    {() => (
                      <div {...stylex.props(styles.memberRow)}>
                        {dragEnabled ? (
                          <AriaButton
                            slot="drag"
                            {...stylex.props(styles.dragHandle)}
                          >
                            <GripVertical aria-hidden size={14} />
                          </AriaButton>
                        ) : null}
                        <FollowingAvatar
                          name={member.name}
                          iconUrl={
                            member.kind === "publication"
                              ? (member.pub.iconUrl ??
                                member.pub.ownerAvatarUrl)
                              : member.user.avatarUrl
                          }
                        />
                        <span {...stylex.props(styles.memberName)}>
                          {member.name}
                        </span>
                        {member.unreadCount > 0 ? (
                          <UnreadBadge count={member.unreadCount} />
                        ) : null}
                      </div>
                    )}
                  </TreeItemContent>
                </TreeItem>
              ))
            )}
          </TreeItem>
        ) : (
          <TreeItem
            id={node.id}
            textValue={node.name}
            onAction={go(() =>
              node.kind === "publication"
                ? navigateToPublication(router, node.pub)
                : navigateToUser(router, node.user),
            )}
          >
            <TreeItemContent>
              {() => (
                <div {...stylex.props(styles.memberRow)}>
                  {dragEnabled ? (
                    <AriaButton
                      slot="drag"
                      {...stylex.props(styles.dragHandle)}
                    >
                      <GripVertical aria-hidden size={14} />
                    </AriaButton>
                  ) : null}
                  <FollowingAvatar
                    name={node.name}
                    iconUrl={
                      node.kind === "publication"
                        ? (node.pub.iconUrl ?? node.pub.ownerAvatarUrl)
                        : node.user.avatarUrl
                    }
                  />
                  <span {...stylex.props(styles.memberName)}>{node.name}</span>
                  {node.unreadCount > 0 ? (
                    <UnreadBadge count={node.unreadCount} />
                  ) : null}
                </div>
              )}
            </TreeItemContent>
          </TreeItem>
        )
      }
    </Tree>
  );
}
