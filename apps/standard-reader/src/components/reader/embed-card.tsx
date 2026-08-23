"use client";

import { Trans } from "@lingui/react/macro";
import { Flex } from "@standard-reader/design-system/flex";
import { ProgressCircle } from "@standard-reader/design-system/progress-circle";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

import type { QuoteOgColors } from "#/lib/publication-theme";

import type {
  EmbedCardLayoutMode,
  embedCardLayoutStyle,
} from "./embed-card-layout";
import {
  embedCardDekStyle,
  embedCardInfoStyle,
  embedCardStyles,
  embedCardThemeVars,
} from "./embed-card-layout";

/**
 * The presentation shared by every embeddable card — the publication subscribe
 * card and the author follow card. Both are the same object: a themed frame
 * holding an avatar, a title block and one call to action, in a row when the
 * container is wide and stacked when it isn't.
 *
 * Only the subject-specific pieces (which avatar, whose name, which verb) are
 * passed in; the layout, palette plumbing and the full-page outcome screens
 * live here so the two cards can't drift apart.
 */

export function EmbedCardShell({
  colors,
  layoutStyle,
  children,
  embed = false,
}: {
  colors: QuoteOgColors;
  layoutStyle: ReturnType<typeof embedCardLayoutStyle>;
  children: ReactNode;
  embed?: boolean;
}) {
  return (
    <div
      {...stylex.props(
        embed ? embedCardStyles.cardFrameEmbed : embedCardStyles.cardFrame,
      )}
      style={embedCardThemeVars(colors)}
    >
      <div {...stylex.props(embedCardStyles.card, layoutStyle)}>{children}</div>
    </div>
  );
}

/** The card's own width constraint + container-query context. */
export function EmbedCardContainer({ children }: { children: ReactNode }) {
  return <div {...stylex.props(embedCardStyles.container)}>{children}</div>;
}

/**
 * Avatar / title / call-to-action, in whichever direction the layout resolved
 * to. Every slot is a node so a publication and an account can each bring their
 * own avatar component and their own links.
 */
export function EmbedCardBody({
  layoutMode,
  avatar,
  kicker,
  title,
  byline,
  description,
  action,
}: {
  layoutMode: EmbedCardLayoutMode;
  avatar: ReactNode;
  kicker?: ReactNode;
  title: ReactNode;
  byline?: ReactNode;
  description?: string | null;
  action?: ReactNode;
}) {
  const portrait = layoutMode === "portrait";
  return (
    <>
      {avatar}
      <div
        {...stylex.props(embedCardStyles.info, embedCardInfoStyle(layoutMode))}
      >
        {kicker ? (
          <span {...stylex.props(embedCardStyles.kicker)}>{kicker}</span>
        ) : null}
        <h2
          {...stylex.props(
            embedCardStyles.name,
            portrait ? embedCardStyles.nameStacked : null,
          )}
        >
          {title}
        </h2>
        {byline ? (
          <p {...stylex.props(embedCardStyles.byline)}>{byline}</p>
        ) : null}
        {description ? (
          <p
            dir="auto"
            {...stylex.props(
              embedCardStyles.dek,
              embedCardDekStyle(layoutMode),
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </>
  );
}

/** The settled state a card lands on: a check (or a spinner) over one line. */
export function EmbedCardOutcomeBody({
  title,
  body,
  pending = false,
  pendingLabel,
}: {
  title: string;
  body: string;
  pending?: boolean;
  pendingLabel?: string;
}) {
  return (
    <Flex
      direction="column"
      align="center"
      gap="2xl"
      style={embedCardStyles.info}
    >
      {pending ? (
        <ProgressCircle isIndeterminate size="md" aria-label={pendingLabel} />
      ) : (
        <div {...stylex.props(embedCardStyles.successIcon)}>
          <Check size={24} aria-hidden />
        </div>
      )}
      <Flex direction="column" align="center" gap="md">
        <h1 {...stylex.props(embedCardStyles.successTitle)}>{title}</h1>
        <p {...stylex.props(embedCardStyles.successBody)}>{body}</p>
      </Flex>
    </Flex>
  );
}

/**
 * Centered outcome UI for the full-page `/subscribe/...` and `/follow/...`
 * routes — no preview of the thing you just followed, just what happened.
 */
export function EmbedCardOutcomePage({
  colors,
  title,
  body,
  pending = false,
  pendingLabel,
}: {
  colors: QuoteOgColors;
  title: string;
  body: string;
  pending?: boolean;
  pendingLabel?: string;
}) {
  return (
    <>
      <div {...stylex.props(embedCardStyles.shellPage)}>
        <EmbedCardContainer>
          <EmbedCardShell
            colors={colors}
            layoutStyle={embedCardStyles.cardStacked}
          >
            <EmbedCardOutcomeBody
              title={title}
              body={body}
              pending={pending}
              pendingLabel={pendingLabel}
            />
          </EmbedCardShell>
        </EmbedCardContainer>
      </div>
      <Link to="/" {...stylex.props(embedCardStyles.poweredBy)}>
        <Trans>Powered by Standard Reader</Trans>
      </Link>
    </>
  );
}
