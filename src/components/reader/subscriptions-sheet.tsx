"use client";

import * as stylex from "@stylexjs/stylex";
import { useNavigate } from "@tanstack/react-router";
import { ChevronRight, Compass, Plus } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";

import type { PublicationCard } from "../../integrations/tanstack-query/api-shapes";

import { Avatar } from "../../design-system/avatar";
import { Button } from "../../design-system/button";
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
import { initials, publicationLinkParams } from "./format";
import { Handle } from "./primitives";

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
  addButton: {
    marginBottom: verticalSpace.sm,
    width: "100%",
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
  pub: PublicationCard;
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
        {pub.ownerHandle ? <Handle>@{pub.ownerHandle}</Handle> : null}
      </div>
      <ChevronRight aria-hidden size={16} {...stylex.props(styles.chevron)} />
    </AriaButton>
  );
}

export function SubscriptionsSheet({
  isOpen,
  onOpenChange,
  following,
  onAddPublication,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  following: Array<PublicationCard>;
  onAddPublication: () => void;
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
      <DrawerHeader style={styles.sheetHeader}>Following</DrawerHeader>
      <DrawerDescription style={styles.sheetSubtitle}>
        {countLabel}
      </DrawerDescription>
      <DrawerBody scroll>
        <Button
          variant="primary"
          style={styles.addButton}
          onPress={onAddPublication}
        >
          <Plus size={17} /> Add publication
        </Button>

        <div {...stylex.props(styles.list)}>
          {following.length === 0 ? (
            <p {...stylex.props(styles.emptyNote)}>
              You aren&apos;t following anything yet.
            </p>
          ) : (
            following.map((pub) => (
              <SheetPubRow key={pub.uri} pub={pub} onNavigate={close} />
            ))
          )}
        </div>

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
