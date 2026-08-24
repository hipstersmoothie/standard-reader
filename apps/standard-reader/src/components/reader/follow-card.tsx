"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Avatar } from "@standard-reader/design-system/avatar";
import { Button } from "@standard-reader/design-system/button";
import * as stylex from "@stylexjs/stylex";
import { Plus } from "lucide-react";

import { AuthorProfileLink } from "#/components/reader/author-profile-link";
import { ButtonLink } from "#/components/router-links";
import type { AuthorEmbedMeta } from "#/integrations/tanstack-query/api-author.functions";
import { followEmbedColors } from "#/lib/author-embed";
import { authorProfilePath } from "#/lib/author-profile";

import {
  EmbedCardBody,
  EmbedCardContainer,
  EmbedCardExternalLink,
  EmbedCardOutcomeBody,
  EmbedCardOutcomePage,
  EmbedCardShell,
} from "./embed-card";
import type {
  EmbedCardLayoutInput,
  EmbedCardLayoutMode,
} from "./embed-card-layout";
import {
  embedCardActionsStyle,
  embedCardLayoutStyle,
  embedCardStyles,
  resolveEmbedCardLayoutMode,
} from "./embed-card-layout";
import { initials } from "./format";

/**
 * The author counterpart to {@link SubscribeCard}: one card that follows an
 * account, rendered inside the `/embed/follow/$did` iframe an author pastes on
 * their own site, and again as the outcome screen of the `/follow/$did` flow.
 */
export type FollowCardPhase =
  | "embed"
  | "sign-in"
  | "following"
  | "success"
  | "already"
  /** The reader landed on their own follow link — there is nothing to follow. */
  | "self";

export type FollowCardLayout = EmbedCardLayoutInput;

/**
 * The account's name and handle. In an embed they have to escape the iframe
 * (see {@link EmbedCardExternalLink}); elsewhere in-app navigation is right.
 */
function AuthorLink({
  did,
  isEmbed,
  linkStyle,
  children,
}: {
  did: string;
  isEmbed: boolean;
  linkStyle: stylex.StyleXStyles;
  children: React.ReactNode;
}) {
  if (isEmbed) {
    return (
      <EmbedCardExternalLink
        href={authorProfilePath(did)}
        linkStyle={linkStyle}
      >
        {children}
      </EmbedCardExternalLink>
    );
  }
  return (
    <AuthorProfileLink authorRef={did} linkStyle={linkStyle}>
      {children}
    </AuthorProfileLink>
  );
}

function FollowCardActions({
  phase,
  followHref,
  loginSearch,
  layoutMode,
}: {
  phase: FollowCardPhase;
  followHref?: string;
  loginSearch?: { redirect?: string; intent?: "follow" };
  layoutMode: EmbedCardLayoutMode;
}) {
  const actionShell = embedCardActionsStyle(layoutMode);
  const actionButton = [
    embedCardStyles.accentButton,
    embedCardStyles.actionButton,
  ];

  if (phase === "embed" && followHref) {
    return (
      // Breaks out of the iframe: the follow flow needs the reader's own
      // Standard Reader session, which the author's page can't host.
      <a
        href={followHref}
        target="_blank"
        rel="noopener noreferrer"
        {...stylex.props(embedCardStyles.actions, actionShell)}
      >
        <Button variant="primary" style={actionButton}>
          <Plus size={16} aria-hidden /> <Trans>Follow</Trans>
        </Button>
      </a>
    );
  }

  if (phase === "sign-in" && loginSearch) {
    return (
      <div {...stylex.props(embedCardStyles.actions, actionShell)}>
        <ButtonLink
          to="/login"
          search={loginSearch}
          variant="primary"
          style={actionButton}
        >
          <Plus size={16} aria-hidden /> <Trans>Follow</Trans>
        </ButtonLink>
      </div>
    );
  }

  if (phase === "following") {
    return (
      <div {...stylex.props(embedCardStyles.actions, actionShell)}>
        <Button variant="primary" isDisabled style={actionButton}>
          <Trans>Following…</Trans>
        </Button>
      </div>
    );
  }

  return null;
}

export function FollowCard({
  meta,
  phase,
  followHref,
  loginSearch,
  shell = "inline",
  layout = "auto",
  errorMessage,
}: {
  meta: AuthorEmbedMeta;
  phase: FollowCardPhase;
  followHref?: string;
  loginSearch?: { redirect?: string; intent?: "follow" };
  /** `page` centers the card on a full-height follow route. */
  shell?: "inline" | "page";
  layout?: FollowCardLayout;
  /** Shown on the follow route when the auto-follow fails. */
  errorMessage?: string;
}) {
  const { t } = useLingui();
  const displayName = meta.displayName?.trim() || null;
  const handle = meta.handle?.trim() || null;
  // What every sentence on this card calls the account. `followSubjectName`
  // computes the same thing for the pasted snippet's `title`, which is plain
  // HTML and so can't reach for a translated fallback.
  const authorName = displayName ?? handle ?? t`this author`;
  const colors = followEmbedColors();

  if (shell === "page") {
    if (errorMessage) {
      return (
        <EmbedCardOutcomePage
          colors={colors}
          title={t`Couldn't follow`}
          body={errorMessage}
        />
      );
    }

    if (phase === "self") {
      return (
        <EmbedCardOutcomePage
          colors={colors}
          title={t`That's you`}
          body={t`This is your own account — there's nothing to follow here.`}
        />
      );
    }

    if (phase === "following") {
      return (
        <EmbedCardOutcomePage
          colors={colors}
          pending
          pendingLabel={t`Following`}
          title={t`Following…`}
          body={t`Adding ${authorName} to your feed.`}
        />
      );
    }

    if (phase === "success" || phase === "already") {
      return (
        <EmbedCardOutcomePage
          colors={colors}
          title={
            phase === "already" ? t`Already following` : t`You're following`
          }
          body={
            phase === "already"
              ? t`You already follow ${authorName}. Their writing shows up in your feed.`
              : t`${authorName} is in your feed. You'll see their writing as it publishes.`
          }
        />
      );
    }

    return null;
  }

  const isSuccess = phase === "success" || phase === "already";
  const layoutMode = resolveEmbedCardLayoutMode(shell, layout);
  const portrait = layoutMode === "portrait";
  const layoutStyle = embedCardLayoutStyle(layoutMode);
  const isEmbed = phase === "embed";

  const card = isSuccess ? (
    <EmbedCardShell colors={colors} layoutStyle={layoutStyle} embed={isEmbed}>
      <EmbedCardOutcomeBody
        title={phase === "already" ? t`Already following` : t`You're following`}
        body={
          phase === "already"
            ? t`You already follow ${authorName}. Their writing shows up in your feed.`
            : t`${authorName} is in your feed. You'll see their writing as it publishes.`
        }
      />
    </EmbedCardShell>
  ) : (
    <EmbedCardShell colors={colors} layoutStyle={layoutStyle} embed={isEmbed}>
      <EmbedCardBody
        layoutMode={layoutMode}
        avatar={
          <Avatar
            src={meta.avatarUrl ?? undefined}
            alt={authorName}
            fallback={initials(authorName)}
            size="xl"
            style={[
              embedCardStyles.avatarProminent,
              portrait ? embedCardStyles.avatarStacked : null,
            ]}
          />
        }
        title={
          <AuthorLink
            did={meta.did}
            isEmbed={isEmbed}
            linkStyle={embedCardStyles.nameLink}
          >
            {authorName}
          </AuthorLink>
        }
        byline={
          displayName && handle ? (
            <AuthorLink
              did={meta.did}
              isEmbed={isEmbed}
              linkStyle={embedCardStyles.bylineHandle}
            >
              @{handle}
            </AuthorLink>
          ) : null
        }
        description={meta.description}
        action={
          <FollowCardActions
            phase={phase}
            followHref={followHref}
            loginSearch={loginSearch}
            layoutMode={layoutMode}
          />
        }
      />
    </EmbedCardShell>
  );

  return <EmbedCardContainer>{card}</EmbedCardContainer>;
}
