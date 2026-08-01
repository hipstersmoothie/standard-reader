"use client";

import { Trans } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { CHROME_STORE_URL, FIREFOX_STORE_URL } from "#/lib/extension-links";

import { docsStyles } from "../../docs/docs-page.stylex";
import { guideStyles } from "../guide-page.stylex";
import { GuideCallout, GuideSteps, UiLabel } from "../guide-primitives";
import { GuideShell } from "../guide-shell";

export function ExtensionGuidePage() {
  return (
    <GuideShell
      area="extension"
      title={<Trans>The browser extension</Trans>}
      dek={
        <Trans>
          Good writing rarely turns up while you are already in a reading app.
          The extension puts saving and subscribing on every page you visit.
        </Trans>
      }
    >
      <h2
        {...stylex.props(docsStyles.h2, docsStyles.h2First)}
        id="what-it-does"
      >
        <Trans>What it does</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          You come across something worth reading in the middle of doing
          something else. Without the extension that means copying a link and
          finding somewhere to put it. With it, saving is one click, wherever
          you are.
        </Trans>
      </p>
      <ul {...stylex.props(docsStyles.prose)}>
        <li {...stylex.props(guideStyles.listItem)}>
          <Trans>
            Save any article to your queue without leaving the page.
          </Trans>
        </li>
        <li {...stylex.props(guideStyles.listItem)}>
          <Trans>
            Subscribe to the publication it came from, in the same click.
          </Trans>
        </li>
        <li {...stylex.props(guideStyles.listItem)}>
          <Trans>
            See which of the people you pass on Bluesky write long-form.
          </Trans>
        </li>
      </ul>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Everything lands in the same account, so a piece you save from your
          laptop at work is in{" "}
          <Link to="/saved" {...stylex.props(docsStyles.proseLink)}>
            Saved
          </Link>{" "}
          on your phone that evening.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="installing">
        <Trans>Installing it</Trans>
      </h2>
      <GuideSteps>
        <Trans>
          Install it for{" "}
          <a
            href={CHROME_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            {...stylex.props(docsStyles.proseLink)}
          >
            Chrome
          </a>{" "}
          or{" "}
          <a
            href={FIREFOX_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            {...stylex.props(docsStyles.proseLink)}
          >
            Firefox
          </a>
          .
        </Trans>
        <Trans>
          Open the extension and sign in. It sends you here to approve, once.
        </Trans>
        <Trans>
          Carry on browsing. It appears where it is useful and stays out of the
          way where it is not.
        </Trans>
      </GuideSteps>

      <h2 {...stylex.props(docsStyles.h2)} id="on-any-page">
        <Trans>On any page you visit</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          On an article, a small overlay offers to save it or subscribe to its
          publication. If Standard Reader already knows the piece, it is matched
          to the indexed version, so it arrives with its author and publication
          attached rather than as a bare link.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          If the site publishes in the open format but has not been indexed yet,
          the extension reads the page&apos;s own record hints and subscribes
          anyway.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          It also covers the pieces Standard Reader cannot show you itself. Some
          documents are in a format the reader cannot render, or live behind a
          site that will not hand over its contents — those open on the original
          site rather than here. The extension follows you there, so on that
          page you still get everything the network knows about the article: the
          Bluesky conversation about it, who recommended it, how many people
          saved it, and the same subscribe and save buttons. The reading happens
          on their site; the context comes with you.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="on-bluesky">
        <Trans>On Bluesky</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          On <b>bsky.app</b>, quiet badges mark the accounts whose long-form
          writing you can read here. It is the least effortful way to find
          publications worth subscribing to: the people are already in front of
          you.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="privacy">
        <Trans>What it can see</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          The extension checks the address of the page you are on to work out
          whether there is anything to offer, and it acts on your account only
          when you click something. It does not read your browsing history or
          the contents of pages.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          The full account is on the{" "}
          <Link to="/privacy/extension" {...stylex.props(docsStyles.proseLink)}>
            extension privacy page
          </Link>
          .
        </Trans>
      </p>
      <GuideCallout title={<Trans>Disconnecting it</Trans>}>
        <Trans>
          The extension signs in as its own session. You can end it any time
          from <UiLabel>Connected apps</UiLabel> in settings without logging
          yourself out anywhere else — see{" "}
          <Link to="/guide/your-data" {...stylex.props(docsStyles.proseLink)}>
            Your account and data
          </Link>
          .
        </Trans>
      </GuideCallout>
    </GuideShell>
  );
}
