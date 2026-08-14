"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import {
  AlertDialog,
  AlertDialogActionButton,
  AlertDialogCancelButton,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@standard-reader/design-system/alert-dialog";
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
import { useQuery } from "@tanstack/react-query";
import {
  CheckCheck,
  ChevronDown,
  ExternalLink,
  ListPlus,
  Rss,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { Key } from "react-aria-components";

import { MenuItemLink } from "#/components/router-links";
import type {
  PublicationDocumentFilter,
  PublicationEmbedMeta,
} from "#/integrations/tanstack-query/api-publication.functions";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import type { ArchiveOrder } from "#/lib/publication/archive-order";
import { useLoginSearch } from "#/utils/use-login-search";

import type { PublicationCard } from "../../integrations/tanstack-query/api-shapes";
import { AddToListModal } from "./add-to-list-modal";
import { FollowButton } from "./cards";
import { MuteDialog, MuteMenuItem } from "./mute-menu-item";
import { NotifyButton } from "./notify-button";
import { RssFeedDialog } from "./rss-feed-button";
import { ShareMenuItems, useShareActions } from "./share-menu";

const MENU_ICON = 14;

const styles = stylex.create({
  /**
   * The bell trails the Subscribe split button rather than sitting inside it:
   * the chevron is Subscribe's own dropdown, so a third segment wedged between
   * them would break that pairing and read as one three-part control.
   *
   * On desktop this row sits at the end of the hero's top row; on mobile it
   * wraps onto its own full-width line under the publication name.
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
   * `FollowButton` takes a single style, not a list — passing an array here
   * leaks straight through to the DOM `style` prop, so the accent variant below
   * repeats these rules rather than layering on top of them.
   */
  subscribe: {
    flexGrow: 1,
    justifyContent: "center",
  },
  /**
   * Same, plus the seam. Grouped buttons drop their inline-start border, so the
   * divider is the label segment's inline-end border; on the accent state the
   * design system paints it in the accent's own border step, which all but
   * disappears against the accent fill. One step darker keeps the split legible.
   */
  subscribeAccent: {
    borderInlineEndColor: primaryColor.border3,
    flexGrow: 1,
    justifyContent: "center",
  },
});

export interface PublicationMarkAllRead {
  isPending: boolean;
  /** Bumped by the parent when the mutation succeeds so the dialog closes. */
  closeSignal: number;
  onConfirm: () => void;
}

/**
 * The archive filter, as a submenu off "Filter". Read and unread need the
 * reader's reading history; without it they'd split the archive into
 * "everything" and "nothing", so they're dropped rather than shown broken.
 */
function FilterSubMenu({
  filter,
  trackReading,
  onFilterChange,
}: {
  filter: PublicationDocumentFilter;
  trackReading: boolean;
  onFilterChange: (filter: PublicationDocumentFilter) => void;
}) {
  const { t } = useLingui();
  const labels: Record<PublicationDocumentFilter, string> = {
    all: t`All`,
    read: t`Read`,
    recommended: t`Recommended`,
    unread: t`Unread`,
  };
  const options: Array<PublicationDocumentFilter> = trackReading
    ? ["all", "unread", "read", "recommended"]
    : ["all", "recommended"];

  return (
    <SubMenu
      selectionMode="single"
      selectedKeys={new Set([filter])}
      onSelectionChange={(keys) => {
        const next = [...(keys as Set<Key>)][0];
        if (next) onFilterChange(next as PublicationDocumentFilter);
      }}
      trigger={
        // No icon: the submenu chevron already marks this row as a branch, and
        // the row carries a value, which no icon can say better than the value.
        <MenuItem textValue={t`Filter`}>
          <Trans>Filter: {labels[filter]}</Trans>
        </MenuItem>
      }
    >
      {options.map((option) => (
        <MenuItem key={option} id={option} textValue={labels[option]}>
          {labels[option]}
        </MenuItem>
      ))}
    </SubMenu>
  );
}

/**
 * Which end of the archive leads, as a submenu off "Order".
 *
 * Every archive leads with the latest post, serials included — an archive is
 * read far more often to see what's new than to find where a work begins. This
 * is how a reader who wants to start at the beginning says so, for this
 * publication only (see `#/lib/publication/archive-order`).
 */
function OrderSubMenu({
  order,
  onOrderChange,
}: {
  order: ArchiveOrder;
  onOrderChange: (order: ArchiveOrder) => void;
}) {
  const { t } = useLingui();
  const labels: Record<ArchiveOrder, string> = {
    newest: t`Newest first`,
    oldest: t`Oldest first`,
  };
  const options: Array<ArchiveOrder> = ["newest", "oldest"];

  return (
    <SubMenu
      selectionMode="single"
      selectedKeys={new Set([order])}
      onSelectionChange={(keys) => {
        const next = [...(keys as Set<Key>)][0];
        if (next) onOrderChange(next as ArchiveOrder);
      }}
      trigger={
        <MenuItem textValue={t`Order`}>
          <Trans>Order: {labels[order]}</Trans>
        </MenuItem>
      }
    >
      {options.map((option) => (
        <MenuItem key={option} id={option} textValue={labels[option]}>
          {labels[option]}
        </MenuItem>
      ))}
    </SubMenu>
  );
}

/**
 * The publication hero's action cluster: a split button whose primary segment
 * subscribes and whose chevron opens every other action for the publication,
 * then a notification bell.
 *
 * Two controls instead of seven keeps the hero calm and reads the same on
 * mobile, where the split button goes full-width instead of collapsing into an
 * icon row. The bell stays outside the group on purpose — the chevron is
 * Subscribe's own dropdown, and a third segment between them would read as one
 * three-part control. Dialogs are rendered as siblings of the menu (not menu
 * children) so they survive the menu closing on selection.
 */
export function PublicationActions({
  pub,
  pageUrl,
  feedUrl,
  signedIn,
  embed,
  markAllRead,
  filter,
  trackReading,
  onFilterChange,
  order,
  onOrderChange,
}: {
  pub: PublicationCard;
  pageUrl: string;
  feedUrl: string;
  signedIn: boolean;
  embed: PublicationEmbedMeta | null | undefined;
  /** Present only when the reader has unread articles here. */
  markAllRead: PublicationMarkAllRead | null;
  filter: PublicationDocumentFilter;
  /** Whether the reader keeps reading history — gates the read/unread filters. */
  trackReading: boolean;
  onFilterChange: (filter: PublicationDocumentFilter) => void;
  /** The order the archive is actually in, override included. */
  order: ArchiveOrder;
  onOrderChange: (order: ArchiveOrder) => void;
}) {
  const { t } = useLingui();
  const loginSearch = useLoginSearch();
  const share = useShareActions({ pageUrl, embed: embed ?? undefined });
  const [listOpen, setListOpen] = useState(false);
  const [rssOpen, setRssOpen] = useState(false);
  const [markAllReadOpen, setMarkAllReadOpen] = useState(false);
  const [muteOpen, setMuteOpen] = useState(false);

  const { data: followStatus } = useQuery({
    ...readerApi.getFollowStatusQueryOptions(pub.uri),
    enabled: signedIn,
  });
  // Both segments share one variant so the split button reads as a single
  // control. Subscribed is a settled state, so the group goes quiet with it —
  // as does the signed-out group, whose subscribe is really a login link.
  const variant =
    signedIn && !followStatus?.isFollowing ? "primary" : "secondary";

  const markAllReadCloseSignal = markAllRead?.closeSignal;
  useEffect(() => {
    setMarkAllReadOpen(false);
  }, [markAllReadCloseSignal]);

  return (
    <>
      <div {...stylex.props(styles.row)}>
        <ButtonGroup style={styles.group}>
          <FollowButton
            publicationUri={pub.uri}
            signedIn={signedIn}
            size="lg"
            pub={pub}
            responsive={false}
            style={
              variant === "primary" ? styles.subscribeAccent : styles.subscribe
            }
          />
          <Menu
            placement="bottom end"
            trigger={
              <IconButton variant={variant} label={t`More actions`} size="lg">
                <ChevronDown size={16} />
              </IconButton>
            }
          >
            {signedIn ? (
              <MenuItem
                onPress={() => setListOpen(true)}
                suffix={<ListPlus size={MENU_ICON} />}
                textValue={t`Add to list`}
              >
                <Trans>Add to list</Trans>
              </MenuItem>
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
            {markAllRead ? (
              <MenuItem
                onPress={() => setMarkAllReadOpen(true)}
                suffix={<CheckCheck size={MENU_ICON} />}
                textValue={t`Mark all as read`}
              >
                <Trans>Mark all as read</Trans>
              </MenuItem>
            ) : null}
            {signedIn ? (
              <FilterSubMenu
                filter={filter}
                trackReading={trackReading}
                onFilterChange={onFilterChange}
              />
            ) : null}
            {/* Not gated on sign-in: the override rides in a cookie, so it works
              for a guest exactly as well as for a reader with an account. */}
            <OrderSubMenu order={order} onOrderChange={onOrderChange} />

            <MenuSeparator />

            <ShareMenuItems share={share} />

            <MenuSeparator />

            <MenuItem
              onPress={() => setRssOpen(true)}
              suffix={<Rss size={MENU_ICON} />}
              textValue={t`RSS feed`}
            >
              <Trans>RSS feed</Trans>
            </MenuItem>
            {pub.url ? (
              <MenuItem
                onPress={() => {
                  globalThis.open(
                    pub.url ?? "",
                    "_blank",
                    "noopener,noreferrer",
                  );
                }}
                suffix={<ExternalLink size={MENU_ICON} />}
                textValue={t`Visit publication site`}
              >
                <Trans>Visit publication site</Trans>
              </MenuItem>
            ) : null}
            {/* Last, behind its own separator: the one item here that hides
                things rather than opening them. */}
            {signedIn ? (
              <>
                <MenuSeparator />
                <MuteMenuItem
                  subject={pub.uri}
                  name={pub.name}
                  iconSize={MENU_ICON}
                  onOpenDialog={() => setMuteOpen(true)}
                />
              </>
            ) : null}
          </Menu>
        </ButtonGroup>
        <NotifyButton
          subjectType="publication"
          subject={pub.uri}
          signedIn={signedIn}
          size="lg"
          // Takes the same variant as the split button beside it, so a
          // publication painting the page in its own theme colors gets a bell
          // that belongs to that palette instead of the app's neutral one.
          variant={variant}
        />
      </div>

      {share.embedDialog}

      <RssFeedDialog
        name={pub.name}
        feedUrl={feedUrl}
        isOpen={rssOpen}
        onOpenChange={setRssOpen}
      />

      {/* Outside `<Menu>`, like the RSS dialog above: a dialog rendered inside
          the menu unmounts with the popover the moment the item is pressed. */}
      {signedIn ? (
        <MuteDialog
          subject={pub.uri}
          kind="publication"
          name={pub.name}
          isOpen={muteOpen}
          onOpenChange={setMuteOpen}
        />
      ) : null}

      {signedIn ? (
        <AddToListModal
          isOpen={listOpen}
          onOpenChange={setListOpen}
          publicationUri={pub.uri}
        />
      ) : null}

      {markAllRead ? (
        <AlertDialog
          isOpen={markAllReadOpen}
          onOpenChange={setMarkAllReadOpen}
          trigger={<span hidden aria-hidden />}
        >
          <AlertDialogHeader>
            <Trans>Mark all as read?</Trans>
          </AlertDialogHeader>
          <AlertDialogDescription>
            <Trans>
              Every unread article from this publication will be marked read.
              This can’t be undone.
            </Trans>
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancelButton isDisabled={markAllRead.isPending} />
            <AlertDialogActionButton
              closeOnPress={false}
              isPending={markAllRead.isPending}
              onPress={markAllRead.onConfirm}
            >
              <Trans>Mark all as read</Trans>
            </AlertDialogActionButton>
          </AlertDialogFooter>
        </AlertDialog>
      ) : null}
    </>
  );
}
