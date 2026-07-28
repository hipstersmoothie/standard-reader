"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { GUIDE_AREAS } from "#/lib/guide/navigation";

import { docsStyles } from "../../docs/docs-page.stylex";
import { GuideFigure } from "../guide-figure";
import { guideStyles } from "../guide-page.stylex";
import { GuideShell } from "../guide-shell";

export function WelcomeGuidePage() {
  const { t, i18n } = useLingui();

  return (
    <GuideShell
      area="welcome"
      title={<Trans>Welcome to Standard Reader</Trans>}
      dek={
        <Trans>
          A calm place to read long-form writing, and to keep finding new
          writers worth following. This guide walks through everything the app
          can do — no technical knowledge needed.
        </Trans>
      }
    >
      <h2 {...stylex.props(docsStyles.h2, docsStyles.h2First)} id="what-it-is">
        <Trans>What Standard Reader is</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Standard Reader is a reader for online magazines, newsletters, and
          personal blogs. You follow the ones you like, and their new writing
          shows up here — in order, without an algorithm deciding what you see
          or an inbox to keep clean.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          It is also a directory. Because every publication here speaks the same
          open format, the app can show you the whole known network, not just
          the part you already follow. Finding a new voice is meant to be as
          easy as catching up on the ones you have.
        </Trans>
      </p>

      <GuideFigure
        shot="home"
        alt={t`The Standard Reader home page: a large featured article at the top, a column of newer articles from publications the reader follows below it, and a narrow right-hand column listing trending articles and suggested publications.`}
        caption={
          <Trans>
            Home leads with one article worth your attention, then everything
            new from the publications you follow.
          </Trans>
        }
      />

      <h2 {...stylex.props(docsStyles.h2)} id="why-different">
        <Trans>Why it works differently</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Most reading apps keep your list of follows on their own servers. If
          the app shuts down, your list goes with it.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Standard Reader works the other way round. You sign in with a Bluesky
          account, and the things you do here — what you follow, save,
          recommend, and read — are written into your own account&apos;s
          storage, the same place your Bluesky posts live. We keep a copy so the
          app is fast, but the original is yours. Another app built on the same
          network can read it, and if you stop using Standard Reader, none of it
          disappears.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          The same is true for the writing itself. Articles here are not hosted
          by us; they live wherever their author publishes them, and Standard
          Reader indexes and displays them. Nothing you read is locked in.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="start-here">
        <Trans>Start here</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Read straight through, or jump to whatever you are trying to do.
        </Trans>
      </p>
      <div {...stylex.props(guideStyles.cardGrid)}>
        {GUIDE_AREAS.filter((item) => item.area !== "welcome").map((item) => (
          <Link
            key={item.area}
            to={item.to}
            {...stylex.props(guideStyles.card)}
          >
            <div {...stylex.props(guideStyles.cardTitle)}>
              {i18n._(item.label)}
            </div>
            <div {...stylex.props(guideStyles.cardBlurb)}>
              {i18n._(item.blurb)}
            </div>
          </Link>
        ))}
      </div>

      <h2 {...stylex.props(docsStyles.h2)} id="getting-help">
        <Trans>Getting help</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          If something is confusing, broken, or missing, the{" "}
          <Link to="/feedback" {...stylex.props(docsStyles.proseLink)}>
            feedback board
          </Link>{" "}
          is the place to say so. It takes bug reports, feature requests, and
          plain questions, and you can read and vote on what other people have
          already asked for.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          If you write software and want to build on the same network, the{" "}
          <Link to="/docs/introduction" {...stylex.props(docsStyles.proseLink)}>
            developer documentation
          </Link>{" "}
          covers the API, the record formats, and the renderers. This guide does
          not assume you will ever go there.
        </Trans>
      </p>
    </GuideShell>
  );
}
