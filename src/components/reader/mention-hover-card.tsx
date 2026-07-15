"use client";

import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BadgeCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { mergeProps, useFocus, useFocusVisible, useHover } from "react-aria";
import type { PopoverProps as AriaPopoverProps } from "react-aria-components";
import { Popover as AriaPopover } from "react-aria-components";

import { Avatar } from "#/design-system/avatar";
import { animationDuration } from "#/design-system/theme/animations.stylex";
import { primaryColor, uiColor } from "#/design-system/theme/color.stylex";
import { mediaQueries } from "#/design-system/theme/media-queries.stylex";
import { radius } from "#/design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "#/design-system/theme/semantic-spacing.stylex";
import { spacing } from "#/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "#/design-system/theme/typography.stylex";
import { usePopoverStyles } from "#/design-system/theme/usePopoverStyles";
import { authorApi } from "#/integrations/tanstack-query/api-author.functions";
import { publicationApi } from "#/integrations/tanstack-query/api-publication.functions";

import { formatDate, formatReaders, initials } from "./format";
import { LikeCount, PublicationAvatar } from "./primitives";

/* ── interaction ──────────────────────────────────────────────────────────── */

const SHOW_DELAY_MS = 250;
const HIDE_DELAY_MS = 200;

interface EntityHoverCardProps {
  /** The rich card body, mounted only while the card is open. */
  card: React.ReactNode;
  /** Warm the summary query the instant hover/focus intent begins. */
  onIntent?: () => void;
  placement?: AriaPopoverProps["placement"];
  children: (args: {
    triggerRef: React.RefObject<HTMLAnchorElement | null>;
    triggerProps: React.DOMAttributes<HTMLElement>;
    isHovered: boolean;
    isOpen: boolean;
  }) => React.ReactElement;
}

/**
 * Opens a floating card over an inline trigger (a mention link) on hover-intent
 * or keyboard focus, and keeps it open while the pointer is over the card so it
 * stays reachable. The trigger stays a real `<Link>` — this only adds hover /
 * focus wiring and a portaled `Popover`, so click-navigation is untouched.
 *
 * Read-only by design: the card is supplementary context. Its own "View →"
 * link duplicates the trigger's destination, so keyboard users never need to
 * tab into it — the trigger is the primary control.
 */
export function EntityHoverCard({
  card,
  onIntent,
  placement = "top",
  children,
}: EntityHoverCardProps) {
  const triggerRef = useRef<HTMLAnchorElement | null>(null);
  const [isOpen, setOpen] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isFocusVisible } = useFocusVisible();
  const popoverStyles = usePopoverStyles();

  const clearShow = useCallback(() => {
    if (showTimer.current) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
  }, []);
  const clearHide = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const scheduleOpen = useCallback(() => {
    clearHide();
    if (isOpen || showTimer.current) return;
    onIntent?.();
    showTimer.current = setTimeout(() => {
      showTimer.current = null;
      setOpen(true);
    }, SHOW_DELAY_MS);
  }, [clearHide, isOpen, onIntent]);

  const scheduleClose = useCallback(() => {
    clearShow();
    if (hideTimer.current) return;
    hideTimer.current = setTimeout(() => {
      hideTimer.current = null;
      setOpen(false);
    }, HIDE_DELAY_MS);
  }, [clearShow]);

  const openNow = useCallback(() => {
    clearHide();
    clearShow();
    onIntent?.();
    setOpen(true);
  }, [clearHide, clearShow, onIntent]);

  useEffect(
    () => () => {
      clearShow();
      clearHide();
    },
    [clearHide, clearShow],
  );

  const { hoverProps: triggerHoverProps, isHovered } = useHover({
    onHoverStart: scheduleOpen,
    onHoverEnd: scheduleClose,
  });
  const { focusProps } = useFocus({
    onFocus: () => {
      if (isFocusVisible) openNow();
    },
    onBlur: scheduleClose,
  });
  const { hoverProps: cardHoverProps } = useHover({
    onHoverStart: clearHide,
    onHoverEnd: scheduleClose,
  });

  return (
    <>
      {children({
        triggerRef,
        triggerProps: mergeProps(triggerHoverProps, focusProps),
        isHovered,
        isOpen,
      })}
      {isOpen ? (
        <AriaPopover
          triggerRef={triggerRef}
          isOpen={isOpen}
          onOpenChange={setOpen}
          placement={placement}
          offset={8}
          containerPadding={12}
          isNonModal
          {...stylex.props(popoverStyles.animation, styles.reduceMotion)}
        >
          <div
            {...cardHoverProps}
            {...stylex.props(popoverStyles.wrapper, styles.shell)}
          >
            {card}
          </div>
        </AriaPopover>
      ) : null}
    </>
  );
}

/* ── card frame + shared pieces ───────────────────────────────────────────── */

function HoverCardFrame({
  children,
  action,
}: {
  children: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <div {...stylex.props(styles.body)}>
      {children}
      <div {...stylex.props(styles.footer)}>{action}</div>
    </div>
  );
}

/** Joins non-empty stat fragments with a middot, e.g. `3 pubs · 41 articles`. */
function StatLine({ parts }: { parts: Array<string> }) {
  if (parts.length === 0) return null;
  return <span {...stylex.props(styles.stats)}>{parts.join(" · ")}</span>;
}

function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${formatReaders(n)} ${n === 1 ? singular : plural}`;
}

function SkeletonLines() {
  return (
    <div {...stylex.props(styles.skeletonWrap)} aria-hidden>
      <span {...stylex.props(styles.skeletonBar, styles.skeletonWide)} />
      <span {...stylex.props(styles.skeletonBar, styles.skeletonNarrow)} />
    </div>
  );
}

/* ── user ─────────────────────────────────────────────────────────────────── */

export function UserHoverCardBody({
  did,
  fallbackLabel,
  fallbackHandle,
  fallbackAvatarUrl,
}: {
  did: string;
  fallbackLabel?: string;
  fallbackHandle?: string | null;
  fallbackAvatarUrl?: string | null;
}) {
  const { data, isLoading } = useQuery(
    authorApi.getAuthorSummaryQueryOptions(did),
  );
  const profile = data?.profile;
  const stats = data?.stats;

  const handle = profile?.handle ?? fallbackHandle ?? null;
  const displayName = profile?.displayName ?? null;
  const name =
    displayName ?? (handle ? `@${handle}` : (fallbackLabel ?? "Reader"));
  const avatarUrl = profile?.avatarUrl ?? fallbackAvatarUrl ?? undefined;
  const showHandle = displayName != null && handle != null;

  const statParts: Array<string> = [];
  if (stats) {
    if (stats.publicationCount > 0) {
      statParts.push(count(stats.publicationCount, "publication"));
    }
    if (stats.documentCount > 0) {
      statParts.push(count(stats.documentCount, "article"));
    }
    if (stats.subscriberCount > 0) {
      statParts.push(count(stats.subscriberCount, "subscriber"));
    }
  }

  return (
    <HoverCardFrame
      action={
        <Link
          to="/u/$did"
          params={{ did }}
          data-hovercard-action
          {...stylex.props(styles.actionLink)}
        >
          View profile
          <span aria-hidden {...stylex.props(styles.actionArrow)}>
            →
          </span>
        </Link>
      }
    >
      <div {...stylex.props(styles.head)}>
        <Avatar
          size="lg"
          src={avatarUrl}
          alt={handle ?? name}
          fallback={initials(displayName ?? handle ?? name)}
        />
        <div {...stylex.props(styles.headMeta)}>
          <span {...stylex.props(styles.name)}>{name}</span>
          {showHandle ? (
            <span {...stylex.props(styles.handle)}>@{handle}</span>
          ) : null}
        </div>
      </div>
      {isLoading && !data ? (
        <SkeletonLines />
      ) : (
        <>
          {profile?.description ? (
            <p {...stylex.props(styles.desc)}>{profile.description}</p>
          ) : null}
          <StatLine parts={statParts} />
        </>
      )}
    </HoverCardFrame>
  );
}

/* ── publication ──────────────────────────────────────────────────────────── */

export function PublicationHoverCardBody({
  publicationUri,
  did,
  rkey,
  fallbackName,
  fallbackIconUrl,
}: {
  publicationUri: string;
  did: string;
  rkey: string;
  fallbackName: string;
  fallbackIconUrl?: string | null;
}) {
  const { data, isLoading } = useQuery(
    publicationApi.getPublicationHeaderQueryOptions(publicationUri),
  );
  const pub = data?.publication;
  const name = pub?.name ?? fallbackName;
  const iconUrl = pub?.iconUrl ?? fallbackIconUrl ?? null;

  const statParts: Array<string> = [];
  if (pub) {
    if (pub.documentCount > 0) {
      statParts.push(count(pub.documentCount, "article"));
    }
    if (pub.subscriberCount > 0) {
      statParts.push(count(pub.subscriberCount, "subscriber"));
    }
  }

  return (
    <HoverCardFrame
      action={
        <Link
          to="/p/$did/$rkey"
          params={{ did, rkey }}
          data-hovercard-action
          {...stylex.props(styles.actionLink)}
        >
          View publication
          <span aria-hidden {...stylex.props(styles.actionArrow)}>
            →
          </span>
        </Link>
      }
    >
      <div {...stylex.props(styles.head)}>
        <PublicationAvatar pub={{ name, iconUrl }} size="lg" />
        <div {...stylex.props(styles.headMeta)}>
          {pub?.topic ? (
            <span {...stylex.props(styles.kicker)}>{pub.topic}</span>
          ) : null}
          <span {...stylex.props(styles.nameRow)}>
            <span {...stylex.props(styles.name)}>{name}</span>
            {pub?.verified ? (
              <BadgeCheck
                size={15}
                strokeWidth={2.25}
                aria-label="Verified"
                {...stylex.props(styles.verified)}
              />
            ) : null}
          </span>
        </div>
      </div>
      {isLoading && !data ? (
        <SkeletonLines />
      ) : (
        <>
          {pub?.description ? (
            <p {...stylex.props(styles.desc)}>{pub.description}</p>
          ) : null}
          <StatLine parts={statParts} />
        </>
      )}
    </HoverCardFrame>
  );
}

/* ── document (article) ───────────────────────────────────────────────────── */

export function DocumentHoverCardBody({
  documentUri,
  did,
  rkey,
  fallbackTitle,
}: {
  documentUri: string;
  did: string;
  rkey: string;
  fallbackTitle: string;
}) {
  const { data: art, isLoading } = useQuery(
    publicationApi.getArticleCardQueryOptions(documentUri),
  );
  const title = art?.title ?? fallbackTitle;
  const byline =
    art?.publicationName ??
    art?.authorDisplayName ??
    (art?.authorHandle ? `@${art.authorHandle}` : null);
  const metaParts: Array<string> = [];
  if (art) {
    if (byline) metaParts.push(byline);
    const date = formatDate(art.publishedAt);
    if (date) metaParts.push(date);
  }

  return (
    <HoverCardFrame
      action={
        <Link
          to="/a/$did/$rkey"
          params={{ did, rkey }}
          data-hovercard-action
          {...stylex.props(styles.actionLink)}
        >
          Read article
          <span aria-hidden {...stylex.props(styles.actionArrow)}>
            →
          </span>
        </Link>
      }
    >
      {art?.coverImageUrl ? (
        <div {...stylex.props(styles.coverWrap)}>
          <img
            src={art.coverImageUrl}
            alt=""
            decoding="async"
            referrerPolicy="no-referrer"
            {...stylex.props(styles.coverImg)}
          />
        </div>
      ) : null}
      <span {...stylex.props(styles.title)}>{title}</span>
      {isLoading && !art ? (
        <SkeletonLines />
      ) : (
        <>
          {art?.description ? (
            <p {...stylex.props(styles.desc)}>{art.description}</p>
          ) : null}
          {metaParts.length > 0 || (art && art.recommendCount > 0) ? (
            <div {...stylex.props(styles.metaRow)}>
              {art &&
              (art.publicationIconUrl || art.publicationOwnerAvatarUrl) ? (
                <PublicationAvatar
                  pub={{
                    name: art.publicationName ?? title,
                    iconUrl: art.publicationIconUrl,
                    ownerAvatarUrl: art.publicationOwnerAvatarUrl,
                  }}
                  size="sm"
                  style={styles.metaAvatar}
                />
              ) : null}
              {metaParts.length > 0 ? (
                <span {...stylex.props(styles.stats)}>
                  {metaParts.join(" · ")}
                </span>
              ) : null}
              {art ? <LikeCount count={art.recommendCount} /> : null}
            </div>
          ) : null}
        </>
      )}
    </HoverCardFrame>
  );
}

/* ── styles ───────────────────────────────────────────────────────────────── */

const pulse = stylex.keyframes({
  "0%, 100%": { opacity: 0.45 },
  "50%": { opacity: 0.8 },
});

const styles = stylex.create({
  // Disable the popover's enter transition under reduced-motion (jump to rest).
  reduceMotion: {
    transitionProperty: {
      default: "transform, opacity",
      [mediaQueries.reducedMotion]: "none",
    },
  },
  shell: {
    boxSizing: "border-box",
    width: "20rem",
    maxWidth: `calc(100vw - ${spacing["6"]})`,
    paddingBottom: verticalSpace.md,
    paddingLeft: horizontalSpace.md,
    paddingRight: horizontalSpace.md,
    paddingTop: verticalSpace.md,
  },
  body: {
    display: "flex",
    flexDirection: "column",
    rowGap: gap.md,
  },
  head: {
    alignItems: "center",
    columnGap: horizontalSpace.md,
    display: "flex",
  },
  headMeta: {
    display: "flex",
    flexDirection: "column",
    rowGap: verticalSpace.xxs,
    minWidth: 0,
  },
  kicker: {
    color: primaryColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: "0.68rem",
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.widest,
    textTransform: "uppercase",
  },
  nameRow: {
    alignItems: "center",
    columnGap: spacing["1.5"],
    display: "flex",
    minWidth: 0,
  },
  name: {
    color: uiColor.text2,
    display: "block",
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  verified: {
    color: primaryColor.text2,
    flexShrink: 0,
  },
  handle: {
    overflow: "hidden",
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    letterSpacing: tracking.tight,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  title: {
    color: uiColor.text2,
    display: "-webkit-box",
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
    overflow: "hidden",
    // eslint-disable-next-line @stylexjs/valid-styles
    WebkitBoxOrient: "vertical",
    // eslint-disable-next-line @stylexjs/valid-styles
    WebkitLineClamp: 2,
  },
  desc: {
    color: uiColor.text1,
    display: "-webkit-box",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.base,
    marginBottom: 0,
    marginTop: 0,
    overflow: "hidden",
    // eslint-disable-next-line @stylexjs/valid-styles
    WebkitBoxOrient: "vertical",
    // eslint-disable-next-line @stylexjs/valid-styles
    WebkitLineClamp: 3,
  },
  stats: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
  },
  metaRow: {
    alignItems: "center",
    columnGap: gap.sm,
    display: "flex",
    flexWrap: "wrap",
    rowGap: verticalSpace.xxs,
  },
  // A favicon-sized publication mark that sits inline with the byline meta.
  metaAvatar: {
    width: "1.1rem",
    height: "1.1rem",
    flexShrink: 0,
  },
  coverWrap: {
    height: "7rem",
    marginBottom: verticalSpace.xs,
    marginLeft: `calc(-1 * ${horizontalSpace.md})`,
    marginRight: `calc(-1 * ${horizontalSpace.md})`,
    marginTop: `calc(-1 * ${verticalSpace.md})`,
    overflow: "hidden",
  },
  coverImg: {
    display: "block",
    height: "100%",
    objectFit: "cover",
    width: "100%",
  },
  footer: {
    alignItems: "center",
    display: "flex",
    justifyContent: "flex-end",
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginLeft: `calc(-1 * ${horizontalSpace.md})`,
    marginRight: `calc(-1 * ${horizontalSpace.md})`,
    paddingLeft: horizontalSpace.md,
    paddingRight: horizontalSpace.md,
    paddingTop: verticalSpace.sm,
  },
  actionLink: {
    alignItems: "center",
    borderRadius: radius.sm,
    color: primaryColor.text2,
    columnGap: gap.xs,
    display: "inline-flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    textDecoration: "none",
  },
  actionArrow: {
    color: primaryColor.text2,
    display: "inline-block",
    transform: {
      default: "translateX(0)",
      ":is([data-hovercard-action]:hover *)": "translateX(3px)",
    },
    transitionDuration: animationDuration.default,
    transitionProperty: "transform",
  },
  skeletonWrap: {
    display: "flex",
    flexDirection: "column",
    rowGap: verticalSpace.sm,
    paddingBottom: verticalSpace.xxs,
    paddingTop: verticalSpace.xxs,
  },
  skeletonBar: {
    animationDuration: "1.4s",
    animationIterationCount: "infinite",
    animationName: {
      default: pulse,
      [mediaQueries.reducedMotion]: "none",
    },
    backgroundColor: uiColor.component1,
    borderRadius: radius.xs,
    height: "0.7rem",
  },
  skeletonWide: {
    width: "100%",
  },
  skeletonNarrow: {
    width: "60%",
  },
});
