"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@standard-reader/design-system/button";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
} from "@standard-reader/design-system/dialog";
import { Flex } from "@standard-reader/design-system/flex";
import { ListBox, ListBoxItem } from "@standard-reader/design-system/listbox";
import {
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from "@standard-reader/design-system/tabs";
import { TextField } from "@standard-reader/design-system/text-field";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
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
import * as stylex from "@stylexjs/stylex";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Check, ListPlus } from "lucide-react";
import { useMemo, useState } from "react";
import type { Key } from "react-aria-components";

import { ButtonLink } from "#/components/router-links";
import { listApi } from "#/integrations/tanstack-query/api-lists.functions";
import { useLoginSearch } from "#/utils/use-login-search";

import type { SubscriptionList } from "../../integrations/tanstack-query/api-lists.functions";

const LISTS_QUERY_KEY = ["reader", "lists"] as const;
const LIST_PAGES_QUERY_KEY = ["list"] as const;

const styles = stylex.create({
  headerTitle: {
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
  },
  body: {
    width: "100%",
  },
  tabList: {
    paddingInlineStart: horizontalSpace["2xl"],
    paddingInlineEnd: horizontalSpace["2xl"],
  },
  tabPanel: {
    paddingBottom: verticalSpace["3xl"],
    paddingInlineStart: horizontalSpace.xl,
    paddingInlineEnd: horizontalSpace.xl,
    paddingTop: verticalSpace["2xl"],
  },
  list: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
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
    paddingInlineStart: horizontalSpace.xl,
    paddingInlineEnd: horizontalSpace.xl,
    paddingTop: verticalSpace.lg,
  },
  check: {
    color: uiColor.text2,
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

function invalidateListQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: LISTS_QUERY_KEY });
  void queryClient.invalidateQueries({ queryKey: LIST_PAGES_QUERY_KEY });
}

/** React Aria collection rows need an `id` key — `SubscriptionList` only has `rkey`. */
interface ListRow {
  id: string;
  list: SubscriptionList;
}

function toListRows(lists: Array<SubscriptionList>): Array<ListRow> {
  return lists.map((list) => ({ id: list.rkey, list }));
}

function AddToListForm({
  publicationUri,
  close,
}: {
  publicationUri: string;
  close: () => void;
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const { data: lists } = useSuspenseQuery(listApi.getListsQueryOptions());
  const listRows = useMemo(() => toListRows(lists), [lists]);
  const [tab, setTab] = useState<Key>("existing");
  const [newName, setNewName] = useState("");

  const saveMutation = useMutation(listApi.putListMutationOptions());
  const listsQueryKey = listApi.getListsQueryOptions().queryKey;

  const toggleListMembership = (list: SubscriptionList, include: boolean) => {
    const alreadyIncluded = list.publications.includes(publicationUri);
    if (include === alreadyIncluded) {
      return;
    }

    const publications = include
      ? [...list.publications, publicationUri]
      : list.publications.filter((uri) => uri !== publicationUri);

    const previous =
      queryClient.getQueryData<Array<SubscriptionList>>(listsQueryKey);
    queryClient.setQueryData(
      listsQueryKey,
      previous?.map((item) =>
        item.rkey === list.rkey ? { ...item, publications } : item,
      ),
    );

    saveMutation.mutate(
      {
        rkey: list.rkey,
        name: list.name,
        description: list.description || undefined,
        publications,
        createdAt: list.createdAt ?? undefined,
      },
      {
        onError: () => {
          queryClient.setQueryData(listsQueryKey, previous);
        },
        onSettled: () => {
          invalidateListQueries(queryClient);
        },
      },
    );
  };

  const createList = () => {
    const trimmed = newName.trim();
    if (trimmed.length === 0 || saveMutation.isPending) {
      return;
    }
    saveMutation.mutate(
      {
        name: trimmed,
        publications: [publicationUri],
      },
      {
        onSettled: () => invalidateListQueries(queryClient),
        onSuccess: () => {
          setNewName("");
          close();
        },
      },
    );
  };

  const error = saveMutation.error;

  return (
    <>
      <div {...stylex.props(styles.body)}>
        <Tabs
          selectedKey={tab}
          onSelectionChange={setTab}
          defaultSelectedKey="existing"
          size="sm"
        >
          <TabList aria-label={t`Add to list`} style={styles.tabList}>
            <Tab id="existing">
              <Trans>Your lists</Trans>
            </Tab>
            <Tab id="new">
              <Trans>New list</Trans>
            </Tab>
          </TabList>

          <TabPanel id="existing" style={styles.tabPanel}>
            <Flex direction="column" gap="2xl">
              <ListBox
                aria-label={t`Your lists`}
                items={listRows}
                selectionMode="none"
                size="lg"
                style={styles.list}
                onAction={(key) => {
                  const row = listRows.find((item) => item.id === String(key));
                  if (!row) {
                    return;
                  }
                  const inList = row.list.publications.includes(publicationUri);
                  toggleListMembership(row.list, !inList);
                }}
                renderEmptyState={() => (
                  <span {...stylex.props(styles.emptyList)}>
                    <Trans>
                      No lists yet — switch to New list to create one.
                    </Trans>
                  </span>
                )}
              >
                {(row) => {
                  const inList = row.list.publications.includes(publicationUri);
                  return (
                    <ListBoxItem
                      id={row.id}
                      textValue={row.list.name}
                      suffix={
                        inList ? (
                          <Check
                            aria-hidden
                            size={16}
                            {...stylex.props(styles.check)}
                          />
                        ) : undefined
                      }
                    >
                      {row.list.name}
                    </ListBoxItem>
                  );
                }}
              </ListBox>

              {error && tab === "existing" ? (
                <span {...stylex.props(styles.errorNote)}>
                  {error instanceof Error
                    ? error.message
                    : t`Something went wrong.`}
                </span>
              ) : null}
            </Flex>
          </TabPanel>

          <TabPanel id="new" style={styles.tabPanel}>
            <Flex direction="column" gap="2xl">
              <TextField
                label={t`Name`}
                placeholder={t`e.g. Tech, Friends, Cooking`}
                value={newName}
                onChange={setNewName}
                isRequired
                size="lg"
              />

              {error && tab === "new" ? (
                <span {...stylex.props(styles.errorNote)}>
                  {error instanceof Error
                    ? error.message
                    : t`Something went wrong.`}
                </span>
              ) : null}
            </Flex>
          </TabPanel>
        </Tabs>
      </div>

      {tab === "new" ? (
        <DialogFooter>
          <span {...stylex.props(styles.footerSpacer)} aria-hidden />
          <Button
            variant="primary"
            isDisabled={saveMutation.isPending || newName.trim().length === 0}
            onPress={createList}
          >
            <Trans>Create list</Trans>
          </Button>
        </DialogFooter>
      ) : null}
    </>
  );
}

export function AddToListModal({
  isOpen,
  onOpenChange,
  publicationUri,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  publicationUri: string;
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
          <Trans>Add to list</Trans>
        </span>
      </DialogHeader>
      <AddToListForm
        key={isOpen ? publicationUri : "closed"}
        publicationUri={publicationUri}
        close={() => onOpenChange(false)}
      />
    </Dialog>
  );
}

/** Opens a dialog to add `publicationUri` to one of the reader's lists. */
export function AddToListButton({
  publicationUri,
  signedIn,
  size = "md",
}: {
  publicationUri: string;
  signedIn: boolean;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const loginSearch = useLoginSearch();

  if (!signedIn) {
    return (
      <ButtonLink
        to="/login"
        search={loginSearch}
        variant="secondary"
        size={size}
      >
        <ListPlus size={14} aria-hidden /> <Trans>Add to list</Trans>
      </ButtonLink>
    );
  }

  return (
    <>
      <Button variant="secondary" size={size} onPress={() => setOpen(true)}>
        <ListPlus size={14} aria-hidden /> <Trans>Add to list</Trans>
      </Button>
      <AddToListModal
        isOpen={open}
        onOpenChange={setOpen}
        publicationUri={publicationUri}
      />
    </>
  );
}
