"use client";

import type { PublicationEmbedMeta } from "#/integrations/tanstack-query/api-publication.functions";
import type { SubscribeEmbedLayout } from "#/lib/publication-embed";
import type { QuoteOgColors } from "#/lib/publication-theme";
import type { ReactNode } from "react";

import * as stylex from "@stylexjs/stylex";
import { Link, createLink } from "@tanstack/react-router";
import { AuthorProfileLink } from "#/components/reader/author-profile-link";
import { PublicationNameLink } from "#/components/reader/publication-name-link";
import { Button } from "#/design-system/button";
import { Flex } from "#/design-system/flex";
import { ProgressCircle } from "#/design-system/progress-circle";
import { uiColor } from "#/design-system/theme/color.stylex";
import { radius } from "#/design-system/theme/radius.stylex";
import {
  size as boxSize,
  gap,
  horizontalSpace,
  verticalSpace,
} from "#/design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "#/design-system/theme/typography.stylex";
import { Check, Plus } from "lucide-react";

import { PublicationAvatar } from "./primitives";
import {
  publicationThemeColors,
  publicationThemeVars,
} from "./subscribe-card-theme";
import { subscribeCardLayout } from "./subscribe-card.stylex";

const ButtonLink = createLink(Button);

/** Wide containers use the horizontal embed layout (iframe-style). */
const LANDSCAPE = "@container subscribe-card (min-width: 18rem)";

export type SubscribeCardPhase =
  | "embed"
  | "sign-in"
  | "subscribing"
  | "success"
  | "already";

/** `auto` picks landscape/portrait from container width; embed routes pass an explicit value. */
export type SubscribeCardLayout = SubscribeEmbedLayout | "auto";

type ResolvedSubscribeCardLayout = SubscribeEmbedLayout | "responsive";

function resolveSubscribeCardLayout(
  shell: "inline" | "page",
  layout: SubscribeCardLayout,
): ResolvedSubscribeCardLayout {
  if (shell === "page" || layout === "portrait") {
    return "portrait";
  }
  if (layout === "landscape") {
    return "landscape";
  }
  return "responsive";
}

const styles = stylex.create({
  shellPage: {
    alignItems: "center",
    boxSizing: "border-box",
    display: "flex",
    justifyContent: "center",
    minHeight: "100vh",
    paddingBottom: verticalSpace["3xl"],
    paddingLeft: horizontalSpace["3xl"],
    paddingRight: horizontalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
    width: "100%",
  },
  container: {
    backgroundColor: "transparent",
    containerName: "subscribe-card",
    containerType: "inline-size",
    display: "block",
    maxWidth: subscribeCardLayout.maxWidth,
    width: "100%",
  },
  cardFrame: {
    borderColor: "var(--sub-line)",
    borderRadius: radius.lg,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    overflow: "hidden",
    boxSizing: "border-box",
    maxWidth: "100%",
    width: "100%",
  },
  /** Embed: no border — iframe background already matches the card fill. */
  cardFrameEmbed: {
    borderRadius: radius.lg,
    cornerShape: "squircle",
    overflow: "hidden",
    boxSizing: "border-box",
    maxWidth: "100%",
    width: "100%",
  },
  card: {
    borderRadius: radius.lg,
    cornerShape: "squircle",
    backgroundColor: "var(--sub-bg)",
    boxSizing: "border-box",
    color: "var(--sub-fg)",
    display: "flex",
    paddingLeft: horizontalSpace["2xl"],
    paddingRight: horizontalSpace["2xl"],
    width: "100%",
  },
  cardResponsive: {
    [LANDSCAPE]: {
      gap: gap.xl,
      alignItems: "center",
      flexDirection: "row",
      textAlign: "left",
      paddingBottom: verticalSpace["2xl"],
      paddingTop: verticalSpace["2xl"],
    },
    gap: gap["2xl"],
    alignItems: "center",
    flexDirection: "column",
    textAlign: "center",
    paddingBottom: verticalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
  },
  cardStacked: {
    gap: gap["2xl"],
    alignItems: "center",
    flexDirection: "column",
    textAlign: "center",
    paddingBottom: verticalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
  },
  cardLandscape: {
    gap: gap.xl,
    alignItems: "center",
    flexDirection: "row",
    textAlign: "left",
    paddingBottom: verticalSpace["2xl"],
    paddingTop: verticalSpace["2xl"],
  },
  info: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    minWidth: 0,
  },
  infoResponsive: {
    [LANDSCAPE]: {
      gap: gap.xs,
      alignItems: "flex-start",
      width: "auto",
    },
    gap: gap.sm,
    alignItems: "center",
    width: "100%",
  },
  infoStacked: {
    gap: gap.sm,
    alignItems: "center",
    width: "100%",
  },
  infoLandscape: {
    gap: gap.xs,
    alignItems: "flex-start",
    width: "auto",
  },
  kicker: {
    color: "var(--sub-accent)",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.widest,
    textTransform: "uppercase",
  },
  name: {
    margin: 0,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
  },
  nameStacked: {
    fontSize: fontSize.xl,
  },
  nameLink: {
    color: "inherit",
    textDecorationColor: "currentColor",
  },
  author: {
    margin: 0,
    color: "var(--sub-muted)",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.sm,
  },
  authorNameLink: {
    textDecoration: { default: "none", ":hover": "underline" },
    color: "inherit",
    textDecorationColor: "currentColor",
  },
  authorHandle: {
    textDecoration: { default: "none", ":hover": "underline" },
    color: "inherit",
    fontFamily: fontFamily.mono,
    letterSpacing: tracking.tight,
    textDecorationColor: "currentColor",
  },
  dek: {
    margin: 0,
    color: "var(--sub-muted)",
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    fontStyle: "italic",
    lineHeight: lineHeight.sm,
    maxWidth: "36ch",
  },
  dekResponsive: {
    [LANDSCAPE]: {
      display: "none",
    },
  },
  dekLandscape: {
    display: "none",
  },
  actions: {
    textDecoration: "none",
    display: "flex",
    flexShrink: 0,
  },
  actionsResponsive: {
    [LANDSCAPE]: {
      width: "auto",
    },
    width: "100%",
  },
  actionsStacked: {
    width: "100%",
  },
  actionsLandscape: {
    width: "auto",
  },
  actionButton: {
    width: "100%",
  },
  avatarProminent: {
    borderColor: "var(--sub-accent)",
    borderWidth: 2,
    flexShrink: 0,
    height: boxSize["5xl"],
    width: boxSize["5xl"],
  },
  avatarStacked: {
    height: boxSize["6xl"],
    width: boxSize["6xl"],
  },
  accentButton: {
    borderColor: "var(--sub-accent)",
    backgroundColor: "var(--sub-accent)",
    color: "var(--sub-accent-fg)",
  },
  successIcon: {
    borderRadius: radius.full,
    alignItems: "center",
    backgroundColor: "var(--sub-accent)",
    color: "var(--sub-accent-fg)",
    display: "flex",
    justifyContent: "center",
    height: "3rem",
    width: "3rem",
  },
  successTitle: {
    margin: 0,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
  },
  successBody: {
    margin: 0,
    color: "var(--sub-muted)",
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontStyle: "italic",
    lineHeight: lineHeight.base,
    maxWidth: "34ch",
  },
  poweredBy: {
    textDecoration: "none",
    color: {
      default: uiColor.text1,
      ":hover": uiColor.text2,
    },
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
    position: "fixed",
    zIndex: 1,
    bottom: verticalSpace.lg,
    right: horizontalSpace.lg,
  },
});

function authorLines(meta: PublicationEmbedMeta): {
  displayName: string | null;
  handle: string | null;
} {
  const displayName = meta.ownerDisplayName?.trim() || null;
  const handle = meta.ownerHandle?.trim() || null;
  return { displayName, handle };
}

function publicationCardFromMeta(meta: PublicationEmbedMeta) {
  return {
    uri: meta.uri,
    did: meta.did,
    name: meta.name,
    url: "",
    description: meta.description,
    iconUrl: meta.iconUrl,
    ownerAvatarUrl: meta.ownerAvatarUrl,
    ownerHandle: meta.ownerHandle,
    topic: meta.topic,
    verified: false,
    subscriberCount: 0,
    documentCount: 0,
    lastDocumentAt: null,
  };
}

function SubscribeCardActions({
  phase,
  subscribeHref,
  loginSearch,
  layoutMode,
}: {
  phase: SubscribeCardPhase;
  subscribeHref?: string;
  loginSearch?: { redirect?: string; intent?: "subscribe" };
  layoutMode: ResolvedSubscribeCardLayout;
}) {
  const actionShell =
    layoutMode === "portrait"
      ? styles.actionsStacked
      : layoutMode === "landscape"
        ? styles.actionsLandscape
        : styles.actionsResponsive;
  const actionButton = [styles.accentButton, styles.actionButton];

  if (phase === "embed" && subscribeHref) {
    return (
      <a
        href={subscribeHref}
        target="_blank"
        rel="noopener noreferrer"
        {...stylex.props(styles.actions, actionShell)}
      >
        <Button variant="primary" style={actionButton}>
          <Plus size={16} aria-hidden /> Subscribe
        </Button>
      </a>
    );
  }

  if (phase === "sign-in" && loginSearch) {
    return (
      <div {...stylex.props(styles.actions, actionShell)}>
        <ButtonLink
          to="/login"
          search={loginSearch}
          variant="primary"
          style={actionButton}
        >
          <Plus size={16} aria-hidden /> Subscribe
        </ButtonLink>
      </div>
    );
  }

  if (phase === "subscribing") {
    return (
      <div {...stylex.props(styles.actions, actionShell)}>
        <Button variant="primary" isDisabled style={actionButton}>
          Subscribing…
        </Button>
      </div>
    );
  }

  return null;
}

function cardLayoutStyle(layoutMode: ResolvedSubscribeCardLayout) {
  if (layoutMode === "portrait") {
    return styles.cardStacked;
  }
  if (layoutMode === "landscape") {
    return styles.cardLandscape;
  }
  return styles.cardResponsive;
}

function infoLayoutStyle(layoutMode: ResolvedSubscribeCardLayout) {
  if (layoutMode === "portrait") {
    return styles.infoStacked;
  }
  if (layoutMode === "landscape") {
    return styles.infoLandscape;
  }
  return styles.infoResponsive;
}

function dekLayoutStyle(layoutMode: ResolvedSubscribeCardLayout) {
  if (layoutMode === "portrait") {
    return null;
  }
  if (layoutMode === "landscape") {
    return styles.dekLandscape;
  }
  return styles.dekResponsive;
}

function SubscribeCardShell({
  colors,
  layoutStyle,
  children,
  embed = false,
}: {
  colors: QuoteOgColors;
  layoutStyle: ReturnType<typeof cardLayoutStyle>;
  children: ReactNode;
  embed?: boolean;
}) {
  return (
    <div
      {...stylex.props(embed ? styles.cardFrameEmbed : styles.cardFrame)}
      style={publicationThemeVars(colors)}
    >
      <div {...stylex.props(styles.card, layoutStyle)}>{children}</div>
    </div>
  );
}

/** Centered outcome UI for `/subscribe/...` (no publication preview card). */
function SubscribePageOutcome({
  meta,
  title,
  body,
  pending = false,
}: {
  meta: PublicationEmbedMeta;
  title: string;
  body: string;
  pending?: boolean;
}) {
  const colors = publicationThemeColors(meta);

  return (
    <>
      <div {...stylex.props(styles.shellPage)}>
        <div {...stylex.props(styles.container)}>
          <SubscribeCardShell colors={colors} layoutStyle={styles.cardStacked}>
            <Flex
              direction="column"
              align="center"
              gap="2xl"
              style={styles.info}
            >
              {pending ? (
                <ProgressCircle
                  isIndeterminate
                  size="md"
                  aria-label="Subscribing"
                />
              ) : (
                <div {...stylex.props(styles.successIcon)}>
                  <Check size={24} aria-hidden />
                </div>
              )}
              <Flex direction="column" align="center" gap="md">
                <h1 {...stylex.props(styles.successTitle)}>{title}</h1>
                <p {...stylex.props(styles.successBody)}>{body}</p>
              </Flex>
            </Flex>
          </SubscribeCardShell>
        </div>
      </div>
      <Link to="/" {...stylex.props(styles.poweredBy)}>
        Powered by Standard Reader
      </Link>
    </>
  );
}

export function SubscribeCard({
  meta,
  phase,
  subscribeHref,
  loginSearch,
  shell = "inline",
  layout = "auto",
  errorMessage,
}: {
  meta: PublicationEmbedMeta;
  phase: SubscribeCardPhase;
  subscribeHref?: string;
  loginSearch?: { redirect?: string; intent?: "subscribe" };
  /** `page` centers the card on a full-height subscribe route. */
  shell?: "inline" | "page";
  layout?: SubscribeCardLayout;
  /** Shown on the subscribe route when auto-follow fails. */
  errorMessage?: string;
}) {
  if (shell === "page") {
    if (errorMessage) {
      return (
        <SubscribePageOutcome
          meta={meta}
          title="Couldn't subscribe"
          body={errorMessage}
        />
      );
    }

    if (phase === "subscribing") {
      return (
        <SubscribePageOutcome
          meta={meta}
          pending
          title="Subscribing…"
          body={`Adding ${meta.name} to your feed.`}
        />
      );
    }

    if (phase === "success" || phase === "already") {
      return (
        <SubscribePageOutcome
          meta={meta}
          title={
            phase === "already" ? "Already subscribed" : "You're subscribed"
          }
          body={
            phase === "already"
              ? `You're already following ${meta.name}. New posts will show up in your feed.`
              : `${meta.name} is in your feed. You'll see new writing as it publishes.`
          }
        />
      );
    }

    return null;
  }

  const colors = publicationThemeColors(meta);
  const pub = publicationCardFromMeta(meta);
  const author = authorLines(meta);
  const hasAuthor = Boolean(author.displayName || author.handle);
  const isSuccess = phase === "success" || phase === "already";
  const layoutMode = resolveSubscribeCardLayout(shell, layout);
  const portrait = layoutMode === "portrait";

  const layoutStyle = cardLayoutStyle(layoutMode);
  const isEmbed = phase === "embed";

  const card = isSuccess ? (
    <SubscribeCardShell
      colors={colors}
      layoutStyle={layoutStyle}
      embed={isEmbed}
    >
      <Flex direction="column" align="center" gap="2xl" style={styles.info}>
        <div {...stylex.props(styles.successIcon)}>
          <Check size={24} aria-hidden />
        </div>
        <Flex direction="column" align="center" gap="md">
          <h1 {...stylex.props(styles.successTitle)}>
            {phase === "already" ? "Already subscribed" : "You're subscribed"}
          </h1>
          <p {...stylex.props(styles.successBody)}>
            {phase === "already"
              ? `You're already following ${meta.name}. New posts will show up in your feed.`
              : `${meta.name} is in your feed. You'll see new writing as it publishes.`}
          </p>
        </Flex>
      </Flex>
    </SubscribeCardShell>
  ) : (
    <SubscribeCardShell
      colors={colors}
      layoutStyle={layoutStyle}
      embed={isEmbed}
    >
      <PublicationAvatar
        pub={pub}
        size="xl"
        style={[styles.avatarProminent, portrait ? styles.avatarStacked : null]}
      />
      <div {...stylex.props(styles.info, infoLayoutStyle(layoutMode))}>
        {meta.topic ? (
          <span {...stylex.props(styles.kicker)}>{meta.topic}</span>
        ) : null}
        <h2
          {...stylex.props(styles.name, portrait ? styles.nameStacked : null)}
        >
          <PublicationNameLink
            publicationUri={meta.uri}
            linkStyle={styles.nameLink}
          >
            {meta.name}
          </PublicationNameLink>
        </h2>
        {hasAuthor ? (
          <p {...stylex.props(styles.author)}>
            {author.displayName ? (
              <>
                <AuthorProfileLink
                  authorRef={meta.did}
                  linkStyle={styles.authorNameLink}
                >
                  {author.displayName}
                </AuthorProfileLink>
                {author.handle ? (
                  <>
                    {" · "}
                    <AuthorProfileLink
                      authorRef={meta.did}
                      linkStyle={styles.authorHandle}
                    >
                      @{author.handle}
                    </AuthorProfileLink>
                  </>
                ) : null}
              </>
            ) : author.handle ? (
              <AuthorProfileLink
                authorRef={meta.did}
                linkStyle={styles.authorHandle}
              >
                @{author.handle}
              </AuthorProfileLink>
            ) : null}
          </p>
        ) : null}
        {meta.description ? (
          <p {...stylex.props(styles.dek, dekLayoutStyle(layoutMode))}>
            {meta.description}
          </p>
        ) : null}
      </div>
      <SubscribeCardActions
        phase={phase}
        subscribeHref={subscribeHref}
        loginSearch={loginSearch}
        layoutMode={layoutMode}
      />
    </SubscribeCardShell>
  );

  return <div {...stylex.props(styles.container)}>{card}</div>;
}
