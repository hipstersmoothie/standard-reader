"use client";

import type { Key } from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { listApi } from "#/integrations/tanstack-query/api-lists.functions";
import { GripVertical, X } from "lucide-react";
import { useState } from "react";
import { useDragAndDrop, useFilter } from "react-aria-components";

import type { FollowingPublication } from "../../integrations/tanstack-query/api-feed.functions";
import type { SubscriptionList } from "../../integrations/tanstack-query/api-lists.functions";

import { Avatar } from "../../design-system/avatar";
import { Button } from "../../design-system/button";
import { ComboBox } from "../../design-system/combobox";
import { Dialog, DialogFooter, DialogHeader } from "../../design-system/dialog";
import { Flex } from "../../design-system/flex";
import { IconButton } from "../../design-system/icon-button";
import { ListBox, ListBoxItem } from "../../design-system/listbox";
import { TextField } from "../../design-system/text-field";
import { uiColor } from "../../design-system/theme/color.stylex";
import { radius } from "../../design-system/theme/radius.stylex";
import {
  horizontalSpace,
  verticalSpace,
} from "../../design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  tracking,
} from "../../design-system/theme/typography.stylex";
import { initials } from "./format";

const LISTS_QUERY_KEY = ["reader", "lists"] as const;
/** Public list pages (`/l/$did/$rkey`) keyed as ["list", did, rkey]. */
const LIST_PAGES_QUERY_KEY = ["list"] as const;

const styles = stylex.create({
  headerTitle: {
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
  },
  body: {
    paddingBottom: verticalSpace["3xl"],
    paddingLeft: horizontalSpace["3xl"],
    paddingRight: horizontalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
  },
  list: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    maxHeight: "16rem",
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
    paddingLeft: horizontalSpace.xl,
    paddingRight: horizontalSpace.xl,
    paddingTop: verticalSpace.lg,
  },
  grip: {
    color: uiColor.text1,
    flexShrink: 0,
  },
  errorNote: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
  },
  footerSpacer: {
    flexGrow: 1,
  },
});

interface MemberItem {
  id: string;
  name: string;
  iconUrl: string | null;
}

/** Reorder `uris` per a react-aria drop event (move `keys` before/after target). */
function reorderUris(
  uris: Array<string>,
  keys: Set<Key>,
  targetKey: Key,
  dropPosition: "before" | "after" | "on",
): Array<string> {
  if (dropPosition === "on" || keys.has(targetKey)) {
    return uris;
  }
  const moving = uris.filter((uri) => keys.has(uri));
  const remaining = uris.filter((uri) => !keys.has(uri));
  const targetIndex = remaining.indexOf(String(targetKey));
  if (targetIndex === -1 || moving.length === 0) {
    return uris;
  }
  const insertAt = dropPosition === "after" ? targetIndex + 1 : targetIndex;
  return [
    ...remaining.slice(0, insertAt),
    ...moving,
    ...remaining.slice(insertAt),
  ];
}

function ListEditForm({
  list,
  following,
  close,
  onDeleted,
}: {
  list: SubscriptionList | null;
  following: Array<FollowingPublication>;
  close: () => void;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(list?.name ?? "");
  const [description, setDescription] = useState(list?.description ?? "");
  const [uris, setUris] = useState<Array<string>>(list?.publications ?? []);
  const [search, setSearch] = useState("");

  const saveMutation = useMutation(listApi.putListMutationOptions());
  const deleteMutation = useMutation(listApi.deleteListMutationOptions());
  const busy = saveMutation.isPending || deleteMutation.isPending;

  const pubByUri = new Map(following.map((pub) => [pub.uri, pub]));
  const inList = new Set(uris);
  const items: Array<MemberItem> = uris.map((uri) => {
    const pub = pubByUri.get(uri);
    return {
      id: uri,
      // A list can reference a publication the reader has since unfollowed —
      // keep it listed (so it can be removed) under its bare at-uri.
      name: pub?.name ?? uri.replace("at://", ""),
      iconUrl: pub?.iconUrl ?? pub?.ownerAvatarUrl ?? null,
    };
  });
  const candidates: Array<MemberItem> = following
    .filter((pub) => !inList.has(pub.uri))
    .map((pub) => ({
      id: pub.uri,
      name: pub.name,
      iconUrl: pub.iconUrl ?? pub.ownerAvatarUrl,
    }));

  const { contains } = useFilter({ sensitivity: "base" });
  // The input is controlled, so the combobox doesn't filter on its own.
  const matches = candidates.filter((item) => contains(item.name, search));
  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => [...keys].map((key) => ({ "text/plain": String(key) })),
    onReorder(event) {
      setUris((current) =>
        reorderUris(
          current,
          event.keys,
          event.target.key,
          event.target.dropPosition,
        ),
      );
    },
  });

  const removeUri = (uri: string) => {
    setUris((current) => current.filter((item) => item !== uri));
  };

  const addUri = (uri: string) => {
    setUris((current) => (current.includes(uri) ? current : [...current, uri]));
    setSearch("");
  };

  const onSettled = () => {
    void queryClient.invalidateQueries({ queryKey: LISTS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: LIST_PAGES_QUERY_KEY });
  };

  const save = () => {
    const trimmed = name.trim();
    if (trimmed.length === 0 || busy) {
      return;
    }
    saveMutation.mutate(
      {
        rkey: list?.rkey,
        name: trimmed,
        description: description.trim() || undefined,
        publications: uris,
        createdAt: list?.createdAt ?? undefined,
      },
      { onSuccess: close, onSettled },
    );
  };

  const removeList = () => {
    if (!list || busy) {
      return;
    }
    deleteMutation.mutate(list.rkey, {
      onSuccess: () => {
        close();
        onDeleted?.();
      },
      onSettled,
    });
  };

  const error = saveMutation.error ?? deleteMutation.error;

  return (
    <>
      <div {...stylex.props(styles.body)}>
        <Flex direction="column" gap="2xl">
          <TextField
            label="Name"
            placeholder="e.g. Tech, Friends, Cooking"
            value={name}
            onChange={setName}
            isRequired
          />

          <TextField
            label="Description"
            placeholder="What this list is about (shown on its public page)"
            value={description}
            onChange={setDescription}
          />

          <ListBox
            aria-label="Publications in list"
            items={items}
            selectionMode="none"
            dragAndDropHooks={dragAndDropHooks}
            style={styles.list}
            renderEmptyState={() => (
              <span {...stylex.props(styles.emptyList)}>
                No publications yet — add one below.
              </span>
            )}
          >
            {(item) => (
              <ListBoxItem
                id={item.id}
                textValue={item.name}
                prefix={
                  <Flex align="center" gap="md">
                    <GripVertical
                      aria-hidden
                      size={14}
                      {...stylex.props(styles.grip)}
                    />
                    <Avatar
                      size="sm"
                      src={item.iconUrl ?? undefined}
                      fallback={initials(item.name)}
                      alt={item.name}
                    />
                  </Flex>
                }
                suffix={
                  <IconButton
                    aria-label={`Remove ${item.name} from list`}
                    size="sm"
                    variant="tertiary"
                    onPress={() => removeUri(item.id)}
                  >
                    <X />
                  </IconButton>
                }
              >
                {item.name}
              </ListBoxItem>
            )}
          </ListBox>

          <ComboBox
            label="Add a subscription"
            placeholder="Search your subscriptions"
            items={matches}
            inputValue={search}
            onInputChange={setSearch}
            // Permanently unselected: picking an item adds it to the list and
            // the input resets, like a tag picker.
            selectedKey={null}
            onSelectionChange={(key) => {
              if (key != null) {
                addUri(String(key));
              }
            }}
            allowsEmptyCollection
            renderEmptyState={() => (
              <span {...stylex.props(styles.emptyList)}>
                {candidates.length === 0
                  ? "All subscriptions are in this list."
                  : "No matching subscriptions."}
              </span>
            )}
          >
            {(item) => (
              <ListBoxItem
                id={item.id}
                textValue={item.name}
                prefix={
                  <Avatar
                    size="sm"
                    src={item.iconUrl ?? undefined}
                    fallback={initials(item.name)}
                    alt={item.name}
                  />
                }
              >
                {item.name}
              </ListBoxItem>
            )}
          </ComboBox>

          {error ? (
            <span {...stylex.props(styles.errorNote)}>
              {error instanceof Error ? error.message : "Something went wrong."}
            </span>
          ) : null}
        </Flex>
      </div>

      <DialogFooter>
        {list ? (
          <Button
            variant="critical-outline"
            isDisabled={busy}
            onPress={removeList}
          >
            Delete list
          </Button>
        ) : null}
        <span {...stylex.props(styles.footerSpacer)} aria-hidden />
        <Button
          variant="primary"
          isDisabled={busy || name.trim().length === 0}
          onPress={save}
        >
          {list ? "Save list" : "Create list"}
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * Create / edit a publication list (`app.standard-reader.list`): rename,
 * describe, reorder (drag), remove, and add publications from the reader's
 * subscriptions.
 */
export function ListEditModal({
  isOpen,
  onOpenChange,
  list,
  following,
  onDeleted,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null creates a new list. */
  list: SubscriptionList | null;
  following: Array<FollowingPublication>;
  /** Called after a list is deleted (e.g. navigate away from its public page). */
  onDeleted?: () => void;
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
          {list ? "Edit list" : "New list"}
        </span>
      </DialogHeader>
      <ListEditForm
        key={list?.uri ?? "new"}
        list={list}
        following={following}
        close={() => onOpenChange(false)}
        onDeleted={onDeleted}
      />
    </Dialog>
  );
}
