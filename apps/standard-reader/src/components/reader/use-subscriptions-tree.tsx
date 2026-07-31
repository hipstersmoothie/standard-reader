"use client";

import { useLingui } from "@lingui/react/macro";
import {
  primaryColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { GripVertical } from "lucide-react";
import { DropIndicator, useDragAndDrop } from "react-aria-components";

import type {
  FlatSubscription,
  SubscriptionsTreeData,
  TreeDisplayGroup,
  TreeListNode,
  TreeTopNode,
} from "./subscriptions-tree";
import { applyManualOrder } from "./use-sidebar-pref";

/** Move `draggedId` to just before/after `targetId` within `ids` (removing it
 * from its old position first). Returns `ids` unchanged if `targetId` isn't
 * present. */
function reorderIds(
  ids: Array<string>,
  draggedId: string,
  targetId: string,
  dropPosition: "before" | "after",
): Array<string> {
  const withoutDragged = ids.filter((id) => id !== draggedId);
  const targetIndex = withoutDragged.indexOf(targetId);
  if (targetIndex === -1) return ids;
  const insertAt = dropPosition === "after" ? targetIndex + 1 : targetIndex;
  return [
    ...withoutDragged.slice(0, insertAt),
    draggedId,
    ...withoutDragged.slice(insertAt),
  ];
}

const styles = stylex.create({
  /**
   * Line between rows showing where the dragged item will land. Sized 2px
   * with -1px vertical margins so it overlays the gap without shifting rows.
   */
  treeDropIndicator: {
    borderRadius: radius.full,
    outline: "none",
    backgroundColor: {
      default: "transparent",
      ":is([data-drop-target])": primaryColor.component3,
    },
    height: 2,
    marginBottom: -1,
    marginTop: -1,
  },
  /** Floating pill shown under the cursor while dragging a row. */
  treeDragPreview: {
    borderColor: uiColor.border2,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    alignItems: "center",
    backgroundColor: uiColor.bg,
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.18)",
    color: uiColor.text2,
    columnGap: horizontalSpace.md,
    display: "flex",
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    paddingInlineEnd: horizontalSpace.lg,
    paddingInlineStart: horizontalSpace.lg,
    maxWidth: "16rem",
    paddingBottom: verticalSpace.sm,
    paddingTop: verticalSpace.sm,
  },
  treeDragPreviewName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  treeDragPreviewBadge: {
    borderRadius: radius.full,
    backgroundColor: uiColor.component1,
    color: uiColor.text1,
    flexShrink: 0,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    paddingInlineEnd: horizontalSpace.md,
    paddingInlineStart: horizontalSpace.md,
  },
  treeDragPreviewGrip: {
    color: uiColor.text1,
    flexShrink: 0,
  },
});

/**
 * Builds the subscriptions tree's data (list groups + ungrouped rows as one
 * top-level order) and its `useDragAndDrop` config. Shared by the desktop
 * sidebar and the mobile sheet — each surface renders its own `<Tree>`
 * (via `SubscriptionsTree`), so each calls this hook independently rather
 * than sharing one `dragAndDropHooks` instance across two trees.
 */
export function useSubscriptionsTree({
  displayGroups,
  flatSubscriptions,
  subscriptionSort,
  treeOrder,
  saveTreeOrder,
  saveListMembers,
  dragEnabled,
}: {
  displayGroups: Array<TreeDisplayGroup>;
  flatSubscriptions: Array<FlatSubscription>;
  subscriptionSort: string;
  treeOrder: Array<string>;
  saveTreeOrder: (order: Array<string>) => void;
  saveListMembers: (
    rkey: string,
    publications: Array<string>,
    users: Array<string>,
  ) => void;
  dragEnabled: boolean;
}): SubscriptionsTreeData {
  const { t } = useLingui();

  const groupNodes: Array<TreeListNode> = displayGroups.map((group) => ({
    kind: "list",
    id: group.listUri,
    name: group.name,
    listUri: group.listUri,
    rkey: group.rkey,
    editable: group.editable,
    unreadCount: group.unreadCount,
    recentAt: group.recentAt,
    members: group.members,
  }));
  const naturalTopOrder: Array<TreeTopNode> = [
    ...groupNodes,
    ...flatSubscriptions,
  ];
  const topNodes: Array<TreeTopNode> =
    subscriptionSort === "default"
      ? applyManualOrder(naturalTopOrder, treeOrder)
      : naturalTopOrder;
  const groupById = new Map(groupNodes.map((g) => [g.id, g]));
  const topLevelIds = new Set(topNodes.map((n) => n.id));
  const memberParentListUri = new Map<string, string>();
  const memberKindById = new Map<string, "publication" | "person">();
  const nameById = new Map(groupNodes.map((g) => [g.id, g.name]));
  for (const member of flatSubscriptions) {
    memberKindById.set(member.id, member.kind);
    nameById.set(member.id, member.name);
  }
  for (const group of groupNodes) {
    for (const member of group.members) {
      memberParentListUri.set(member.id, group.id);
      memberKindById.set(member.id, member.kind);
      nameById.set(member.id, member.name);
    }
  }

  const splitIdsByKind = (ids: Array<string>) => {
    const publications: Array<string> = [];
    const users: Array<string> = [];
    for (const id of ids) {
      if (memberKindById.get(id) === "person") {
        users.push(id);
      } else {
        publications.push(id);
      }
    }
    return { publications, users };
  };

  const saveGroupMemberOrder = (
    group: TreeListNode,
    memberIds: Array<string>,
  ) => {
    if (!group.rkey) return;
    const { publications, users } = splitIdsByKind(memberIds);
    saveListMembers(group.rkey, publications, users);
  };

  const removeFromGroup = (group: TreeListNode, id: string) => {
    if (!group.rkey) return;
    const remaining = group.members
      .map((m) => m.id)
      .filter((mid) => mid !== id);
    saveGroupMemberOrder(group, remaining);
  };

  const dropFromTopLevel = (id: string) => {
    saveTreeOrder(topNodes.map((n) => n.id).filter((nid) => nid !== id));
  };

  const { dragAndDropHooks } = useDragAndDrop({
    isDisabled: !dragEnabled,
    getItems: (keys) => [...keys].map((key) => ({ "text/plain": String(key) })),
    getDropOperation(target) {
      if (target.type !== "item") return "cancel";
      if (target.dropPosition === "on" && !groupById.has(String(target.key))) {
        return "cancel";
      }
      return "move";
    },
    renderDragPreview(dragItems) {
      const first = dragItems[0]?.["text/plain"];
      const name = (first && nameById.get(first)) || t`Subscription`;
      const extra = dragItems.length - 1;
      return (
        <div {...stylex.props(styles.treeDragPreview)}>
          <GripVertical
            aria-hidden
            size={14}
            {...stylex.props(styles.treeDragPreviewGrip)}
          />
          <span {...stylex.props(styles.treeDragPreviewName)}>{name}</span>
          {extra > 0 ? (
            <span {...stylex.props(styles.treeDragPreviewBadge)}>+{extra}</span>
          ) : null}
        </div>
      );
    },
    renderDropIndicator(target) {
      return (
        <DropIndicator
          target={target}
          {...stylex.props(styles.treeDropIndicator)}
        />
      );
    },
    onMove(e) {
      if (e.target.type !== "item") return;
      const draggedId = String([...e.keys][0]);
      const targetId = String(e.target.key);
      const dropPosition = e.target.dropPosition;
      if (draggedId === targetId) return;

      const draggedGroup = groupById.get(draggedId);
      const sourceListUri = draggedGroup
        ? null
        : (memberParentListUri.get(draggedId) ?? null);

      if (draggedGroup) {
        // Lists only ever live at the top level.
        if (dropPosition === "on" || !topLevelIds.has(targetId)) return;
        saveTreeOrder(
          reorderIds(
            topNodes.map((n) => n.id),
            draggedId,
            targetId,
            dropPosition,
          ),
        );
        return;
      }

      const draggedKind = memberKindById.get(draggedId);
      if (!draggedKind) return;
      const sourceGroup = sourceListUri ? groupById.get(sourceListUri) : null;
      // Can't remove a member from a list this reader doesn't own.
      if (sourceListUri && !sourceGroup?.editable) return;

      if (dropPosition === "on") {
        const targetGroup = groupById.get(targetId);
        if (!targetGroup?.editable || sourceListUri === targetGroup.id) return;
        if (sourceGroup) {
          removeFromGroup(sourceGroup, draggedId);
        } else {
          dropFromTopLevel(draggedId);
        }
        saveGroupMemberOrder(targetGroup, [
          ...targetGroup.members.map((m) => m.id),
          draggedId,
        ]);
        return;
      }

      if (topLevelIds.has(targetId)) {
        // Landing at the top level — reorder there, removing from any
        // editable source list first.
        if (sourceGroup) {
          removeFromGroup(sourceGroup, draggedId);
          saveTreeOrder(
            reorderIds(
              [draggedId, ...topNodes.map((n) => n.id)],
              draggedId,
              targetId,
              dropPosition,
            ),
          );
        } else {
          saveTreeOrder(
            reorderIds(
              topNodes.map((n) => n.id),
              draggedId,
              targetId,
              dropPosition,
            ),
          );
        }
        return;
      }

      // Target is a member nested inside some (editable) list.
      const targetListUri = memberParentListUri.get(targetId);
      const targetGroup = targetListUri ? groupById.get(targetListUri) : null;
      if (!targetGroup?.editable) return;

      if (sourceListUri === targetGroup.id) {
        saveGroupMemberOrder(
          targetGroup,
          reorderIds(
            targetGroup.members.map((m) => m.id),
            draggedId,
            targetId,
            dropPosition,
          ),
        );
        return;
      }

      if (sourceGroup) {
        removeFromGroup(sourceGroup, draggedId);
      } else {
        dropFromTopLevel(draggedId);
      }
      saveGroupMemberOrder(
        targetGroup,
        reorderIds(
          [draggedId, ...targetGroup.members.map((m) => m.id)],
          draggedId,
          targetId,
          dropPosition,
        ),
      );
    },
  });

  return { topNodes, groupNodes, groupById, dragAndDropHooks };
}
