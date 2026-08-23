"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@standard-reader/design-system/button";
import * as stylex from "@stylexjs/stylex";
import { Plus } from "lucide-react";

import { AuthorProfileLink } from "#/components/reader/author-profile-link";
import { PublicationNameLink } from "#/components/reader/publication-name-link";
import { ButtonLink } from "#/components/router-links";
import type { PublicationEmbedMeta } from "#/integrations/tanstack-query/api-publication.functions";

import {
  EmbedCardBody,
  EmbedCardContainer,
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
import { PublicationAvatar } from "./primitives";
import { publicationThemeColors } from "./subscribe-card-theme";

export type SubscribeCardPhase =
  | "embed"
  | "sign-in"
  | "subscribing"
  | "success"
  | "already";

/** `auto` picks landscape/portrait from container width; embed routes pass an explicit value. */
export type SubscribeCardLayout = EmbedCardLayoutInput;

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
  layoutMode: EmbedCardLayoutMode;
}) {
  const actionShell = embedCardActionsStyle(layoutMode);
  const actionButton = [
    embedCardStyles.accentButton,
    embedCardStyles.actionButton,
  ];

  if (phase === "embed" && subscribeHref) {
    return (
      <a
        href={subscribeHref}
        target="_blank"
        rel="noopener noreferrer"
        {...stylex.props(embedCardStyles.actions, actionShell)}
      >
        <Button variant="primary" style={actionButton}>
          <Plus size={16} aria-hidden /> <Trans>Subscribe</Trans>
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
          <Plus size={16} aria-hidden /> <Trans>Subscribe</Trans>
        </ButtonLink>
      </div>
    );
  }

  if (phase === "subscribing") {
    return (
      <div {...stylex.props(embedCardStyles.actions, actionShell)}>
        <Button variant="primary" isDisabled style={actionButton}>
          <Trans>Subscribing…</Trans>
        </Button>
      </div>
    );
  }

  return null;
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
  const { t } = useLingui();
  const publicationName = meta.name;
  const colors = publicationThemeColors(meta);

  if (shell === "page") {
    if (errorMessage) {
      return (
        <EmbedCardOutcomePage
          colors={colors}
          title={t`Couldn't subscribe`}
          body={errorMessage}
        />
      );
    }

    if (phase === "subscribing") {
      return (
        <EmbedCardOutcomePage
          colors={colors}
          pending
          pendingLabel={t`Subscribing`}
          title={t`Subscribing…`}
          body={t`Adding ${publicationName} to your feed.`}
        />
      );
    }

    if (phase === "success" || phase === "already") {
      return (
        <EmbedCardOutcomePage
          colors={colors}
          title={
            phase === "already" ? t`Already subscribed` : t`You're subscribed`
          }
          body={
            phase === "already"
              ? t`You're already subscribed to ${publicationName}. New posts will show up in your feed.`
              : t`${publicationName} is in your feed. You'll see new writing as it publishes.`
          }
        />
      );
    }

    return null;
  }

  const pub = publicationCardFromMeta(meta);
  const author = authorLines(meta);
  const hasAuthor = Boolean(author.displayName || author.handle);
  const isSuccess = phase === "success" || phase === "already";
  const layoutMode = resolveEmbedCardLayoutMode(shell, layout);
  const portrait = layoutMode === "portrait";

  const layoutStyle = embedCardLayoutStyle(layoutMode);
  const isEmbed = phase === "embed";

  const card = isSuccess ? (
    <EmbedCardShell colors={colors} layoutStyle={layoutStyle} embed={isEmbed}>
      <EmbedCardOutcomeBody
        title={
          phase === "already" ? t`Already subscribed` : t`You're subscribed`
        }
        body={
          phase === "already"
            ? t`You're already subscribed to ${publicationName}. New posts will show up in your feed.`
            : t`${publicationName} is in your feed. You'll see new writing as it publishes.`
        }
      />
    </EmbedCardShell>
  ) : (
    <EmbedCardShell colors={colors} layoutStyle={layoutStyle} embed={isEmbed}>
      <EmbedCardBody
        layoutMode={layoutMode}
        avatar={
          <PublicationAvatar
            pub={pub}
            size="xl"
            style={[
              embedCardStyles.avatarProminent,
              portrait ? embedCardStyles.avatarStacked : null,
            ]}
          />
        }
        kicker={meta.topic}
        title={
          <PublicationNameLink
            publicationUri={meta.uri}
            linkStyle={embedCardStyles.nameLink}
          >
            {meta.name}
          </PublicationNameLink>
        }
        byline={
          hasAuthor ? (
            author.displayName ? (
              <>
                <AuthorProfileLink
                  authorRef={meta.did}
                  linkStyle={embedCardStyles.bylineNameLink}
                >
                  {author.displayName}
                </AuthorProfileLink>
                {author.handle ? (
                  <>
                    {" · "}
                    <AuthorProfileLink
                      authorRef={meta.did}
                      linkStyle={embedCardStyles.bylineHandle}
                    >
                      @{author.handle}
                    </AuthorProfileLink>
                  </>
                ) : null}
              </>
            ) : author.handle ? (
              <AuthorProfileLink
                authorRef={meta.did}
                linkStyle={embedCardStyles.bylineHandle}
              >
                @{author.handle}
              </AuthorProfileLink>
            ) : null
          ) : null
        }
        description={meta.description}
        action={
          <SubscribeCardActions
            phase={phase}
            subscribeHref={subscribeHref}
            loginSearch={loginSearch}
            layoutMode={layoutMode}
          />
        }
      />
    </EmbedCardShell>
  );

  return <EmbedCardContainer>{card}</EmbedCardContainer>;
}
