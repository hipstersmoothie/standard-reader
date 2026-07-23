"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { GripVertical } from "lucide-react";
import { useRef, useState } from "react";
import type { Key } from "react-aria-components";
import { DropIndicator, useDragAndDrop } from "react-aria-components";

import { Button } from "@standard-reader/design-system/button";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogDescription,
} from "@standard-reader/design-system/dialog";
import { ListBox, ListBoxItem } from "@standard-reader/design-system/listbox";
import { primaryColor, uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";

/** A sidebar list group as shown in the reorder dialog. */
export interface ReorderableGroup {
  /** AT-URI of the list; the stable id used for ordering. */
  listUri: string;
  name: string;
}

const styles = stylex.create({
  headerTitle: {
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
  },
  body: {
    paddingBottom: verticalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    paddingInlineEnd: horizontalSpace["3xl"],
  },
  list: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    maxHeight: "20rem",
    overflowY: "auto",
    paddingBottom: verticalSpace.xs,
    paddingTop: verticalSpace.xs,
  },
  emptyList: {
    color: uiColor.text1,
    display: "block",
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    fontStyle: "italic",
    paddingBottom: verticalSpace.lg,
    paddingInlineStart: horizontalSpace.xl,
    paddingInlineEnd: horizontalSpace.xl,
    paddingTop: verticalSpace.lg,
  },
  grip: {
    color: uiColor.text1,
    flexShrink: 0,
  },
  footerSpacer: {
    flexGrow: 1,
  },
  /** Floating pill shown under the cursor while dragging a list. */
  dragPreview: {
    alignItems: "center",
    backgroundColor: uiColor.bg,
    borderColor: uiColor.border2,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.18)",
    color: uiColor.text2,
    columnGap: horizontalSpace.md,
    display: "flex",
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    maxWidth: "16rem",
    paddingBottom: verticalSpace.sm,
    paddingInlineStart: horizontalSpace.lg,
    paddingInlineEnd: horizontalSpace.lg,
    paddingTop: verticalSpace.sm,
  },
  dragPreviewName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  dragPreviewBadge: {
    borderRadius: radius.full,
    backgroundColor: uiColor.component1,
    color: uiColor.text1,
    flexShrink: 0,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    paddingInlineStart: horizontalSpace.md,
    paddingInlineEnd: horizontalSpace.md,
  },
  /**
   * Line between rows showing where the dragged list will land. Sized 2px with
   * -1px vertical margins so it overlays the gap without shifting the rows; only
   * visible while it is the active drop target.
   */
  dropIndicator: {
    borderRadius: radius.full,
    height: 2,
    marginBottom: -1,
    marginTop: -1,
    outline: "none",
    backgroundColor: {
      default: "transparent",
      ":is([data-drop-target])": primaryColor.component3,
    },
  },
});

/** Reorder `items` per a react-aria drop event (move `keys` before/after target). */
function reorder(
  items: Array<ReorderableGroup>,
  keys: Set<Key>,
  targetKey: Key,
  dropPosition: "before" | "after" | "on",
): Array<ReorderableGroup> {
  if (dropPosition === "on" || keys.has(targetKey)) {
    return items;
  }
  const moving = items.filter((item) => keys.has(item.listUri));
  const remaining = items.filter((item) => !keys.has(item.listUri));
  const targetIndex = remaining.findIndex(
    (item) => item.listUri === String(targetKey),
  );
  if (targetIndex === -1 || moving.length === 0) {
    return items;
  }
  const insertAt = dropPosition === "after" ? targetIndex + 1 : targetIndex;
  return [
    ...remaining.slice(0, insertAt),
    ...moving,
    ...remaining.slice(insertAt),
  ];
}

function ReorderForm({
  groups,
  onSave,
  close,
}: {
  groups: Array<ReorderableGroup>;
  onSave: (orderedUris: Array<string>) => void;
  close: () => void;
}) {
  const { t } = useLingui();
  const [items, setItems] = useState<Array<ReorderableGroup>>(groups);
  const nameByUri = new Map(groups.map((group) => [group.listUri, group.name]));
  const bodyRef = useRef<HTMLDivElement>(null);
  // Whether the in-progress drag was started by pointer (vs keyboard). react-aria
  // force-sets keyboard modality after any drop when selectionMode is "none", so a
  // mouse drop leaves a focus ring on the landed item; we clear it for pointer drops.
  const pointerDragRef = useRef(false);

  const clearPointerFocusRing = () => {
    if (!pointerDragRef.current) {
      return;
    }
    // Run after react-aria's post-drop focus effect so the blur wins.
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && bodyRef.current?.contains(active)) {
        active.blur();
      }
    });
  };

  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => [...keys].map((key) => ({ "text/plain": String(key) })),
    onReorder(event) {
      setItems((current) =>
        reorder(
          current,
          event.keys,
          event.target.key,
          event.target.dropPosition,
        ),
      );
      clearPointerFocusRing();
    },
    renderDragPreview(dragItems) {
      const first = dragItems[0]?.["text/plain"];
      const name = (first && nameByUri.get(first)) || t`List`;
      const extra = dragItems.length - 1;
      return (
        <div {...stylex.props(styles.dragPreview)}>
          <GripVertical aria-hidden size={14} {...stylex.props(styles.grip)} />
          <span {...stylex.props(styles.dragPreviewName)}>{name}</span>
          {extra > 0 ? (
            <span {...stylex.props(styles.dragPreviewBadge)}>+{extra}</span>
          ) : null}
        </div>
      );
    },
    renderDropIndicator(target) {
      return (
        <DropIndicator
          target={target}
          {...stylex.props(styles.dropIndicator)}
        />
      );
    },
  });

  const save = () => {
    onSave(items.map((item) => item.listUri));
    close();
  };

  return (
    <>
      <div
        ref={bodyRef}
        // Track how the drag was initiated so we only clear the focus ring for
        // pointer drops: a keyboard drop fires keydown (Enter) right before the
        // reorder; a mouse drag's last capture event is the pointerdown.
        onPointerDownCapture={() => {
          pointerDragRef.current = true;
        }}
        onKeyDownCapture={() => {
          pointerDragRef.current = false;
        }}
        {...stylex.props(styles.body)}
      >
        <ListBox
          aria-label={t`Sidebar lists`}
          size="lg"
          items={items.map((item) => ({ ...item, id: item.listUri }))}
          selectionMode="none"
          dragAndDropHooks={dragAndDropHooks}
          style={styles.list}
          renderEmptyState={() => (
            <span {...stylex.props(styles.emptyList)}>
              <Trans>You don&apos;t have any lists to reorder yet.</Trans>
            </span>
          )}
        >
          {(item) => (
            <ListBoxItem
              id={item.listUri}
              textValue={item.name}
              prefix={
                <GripVertical
                  aria-hidden
                  size={14}
                  {...stylex.props(styles.grip)}
                />
              }
            >
              <span dir="auto">{item.name}</span>
            </ListBoxItem>
          )}
        </ListBox>
      </div>

      <DialogFooter>
        <Button variant="tertiary" onPress={close}>
          <Trans>Cancel</Trans>
        </Button>
        <span {...stylex.props(styles.footerSpacer)} aria-hidden />
        <Button variant="primary" onPress={save}>
          <Trans>Save order</Trans>
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * Reorder the reader's sidebar list groups (own + saved) by drag-and-drop.
 * Saving persists the new order to `app.standard-reader.sidebarPref`.
 */
export function ReorderListsModal({
  isOpen,
  onOpenChange,
  groups,
  onSave,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  groups: Array<ReorderableGroup>;
  onSave: (orderedUris: Array<string>) => void;
}) {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="md"
      fitContent
      trigger={<span hidden aria-hidden />}
    >
      <DialogHeader>
        <span {...stylex.props(styles.headerTitle)}>
          <Trans>Reorder lists</Trans>
        </span>
      </DialogHeader>
      <DialogDescription>
        <Trans>
          Drag to change the order your lists appear in the sidebar.
        </Trans>
      </DialogDescription>
      {/* Reset local drag state whenever the dialog reopens with fresh groups. */}
      <ReorderForm
        key={isOpen ? groups.map((g) => g.listUri).join("|") : "closed"}
        groups={groups}
        onSave={onSave}
        close={() => onOpenChange(false)}
      />
    </Dialog>
  );
}
