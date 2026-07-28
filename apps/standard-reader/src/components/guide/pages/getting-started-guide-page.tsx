"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { docsStyles } from "../../docs/docs-page.stylex";
import { GuideFigure } from "../guide-figure";
import { guideStyles } from "../guide-page.stylex";
import { GuideCallout, GuideSteps, UiLabel } from "../guide-primitives";
import { GuideShell } from "../guide-shell";

export function GettingStartedGuidePage() {
  const { t } = useLingui();

  return (
    <GuideShell
      area="getting-started"
      title={<Trans>Getting started</Trans>}
      dek={
        <Trans>
          Sign in, pick a few publications to follow, and learn where everything
          lives. Ten minutes, once.
        </Trans>
      }
    >
      <h2 {...stylex.props(docsStyles.h2, docsStyles.h2First)} id="sign-in">
        <Trans>Signing in</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Standard Reader has no password of its own. You sign in with a Bluesky
          account — or any other account on the same network — and that account
          is where your reading is stored.
        </Trans>
      </p>
      <GuideSteps>
        <Trans>
          Select <UiLabel>Log in</UiLabel>, at the bottom of the sidebar on a
          computer or in the top bar on a phone.
        </Trans>
        <Trans>
          Type your handle — the name that looks like{" "}
          <b>yourname.bsky.social</b> — and continue.
        </Trans>
        <Trans>
          Your account provider (Bluesky, usually) asks whether Standard Reader
          may act on your behalf. Approve it, and you land back here signed in.
        </Trans>
      </GuideSteps>
      <GuideCallout title={<Trans>No account yet?</Trans>}>
        <Trans>
          The login screen links out to create one. Any account on the network
          works — you do not have to use Bluesky itself, and you do not have to
          post anything.
        </Trans>
      </GuideCallout>

      <h2 {...stylex.props(docsStyles.h2)} id="first-follows">
        <Trans>Following your first publications</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          The first time you sign in, a short setup walks you through it: pick a
          few topics you care about, see which of the people you already follow
          on Bluesky write here, follow anything that appeals, and choose how
          you like your text. You can skip any step, and skip the whole thing.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          After that, following is one button. Anywhere you see a publication —
          a card in a feed, the top of an article, a publication&apos;s own page
          — there is a <UiLabel>Follow</UiLabel> button next to its name. Select
          it again to stop following. Nothing else changes: the button just
          decides whether new writing from that publication reaches your Home
          and Latest.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          If you already know what you want,{" "}
          <Link to="/discover" {...stylex.props(docsStyles.proseLink)}>
            Discover
          </Link>{" "}
          lists everything on the network, and{" "}
          <Link to="/guide/finding" {...stylex.props(docsStyles.proseLink)}>
            Finding things to read
          </Link>{" "}
          covers every way to get there.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="the-sidebar">
        <Trans>Finding your way around</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          On a computer, a sidebar runs down the left of every screen. From the
          top:
        </Trans>
      </p>
      <ul {...stylex.props(docsStyles.prose)}>
        <li {...stylex.props(guideStyles.listItem)}>
          <UiLabel>
            <Trans>Home</Trans>
          </UiLabel>{" "}
          —{" "}
          <Trans>
            your day: one featured article, then what is new from your follows.
          </Trans>
        </li>
        <li {...stylex.props(guideStyles.listItem)}>
          <UiLabel>
            <Trans>Latest</Trans>
          </UiLabel>{" "}
          —{" "}
          <Trans>
            everything new in the order it was published, with tabs for unread,
            your follows, and the whole network.
          </Trans>
        </li>
        <li {...stylex.props(guideStyles.listItem)}>
          <UiLabel>
            <Trans>Saved</Trans>
          </UiLabel>{" "}
          —{" "}
          <Trans>
            the queue of articles you put aside. A badge shows how many are
            waiting.
          </Trans>
        </li>
        <li {...stylex.props(guideStyles.listItem)}>
          <UiLabel>
            <Trans>Discover</Trans>
          </UiLabel>{" "}
          —{" "}
          <Trans>
            the directory of every publication the network knows about.
          </Trans>
        </li>
        <li {...stylex.props(guideStyles.listItem)}>
          <UiLabel>
            <Trans>Search</Trans>
          </UiLabel>{" "}
          —{" "}
          <Trans>
            find publications, people, topics, and headlines by name.
          </Trans>
        </li>
      </ul>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Below those, the publications you follow are listed for quick access.
          The <UiLabel>Subscriptions</UiLabel> heading above them opens the full
          management view. At the very bottom, your avatar opens a menu with
          your profile, reading history, recommended articles, feedback,
          settings, and log out.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="on-your-phone">
        <Trans>On your phone</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          The sidebar becomes a bar of tabs floating at the bottom of the
          screen, with the same destinations. The top bar hides as you scroll
          down and comes back as you scroll up, so a page of writing is mostly
          writing.
        </Trans>
      </p>
      <GuideFigure
        shot="article-mobile"
        alt={t`An article open on a phone: the headline and body text fill the screen, with a slim bar of navigation tabs floating at the bottom.`}
        caption={
          <Trans>
            The same article on a phone. Chrome gets out of the way as you read.
          </Trans>
        }
      />

      <h2 {...stylex.props(docsStyles.h2)} id="without-account">
        <Trans>Reading without an account</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          You do not need to sign in to read. Articles, publications, topics,
          Discover, and search all work signed out, and anyone you send a link
          to can open it.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          What signing in adds is memory: following publications, saving
          articles, tracking what you have read, recommending, lists, and
          settings that follow you between devices. All of that needs somewhere
          to store it — which is your account.
        </Trans>
      </p>
    </GuideShell>
  );
}
