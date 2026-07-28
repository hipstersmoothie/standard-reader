"use client";

import { Trans } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { CHROME_STORE_URL, FIREFOX_STORE_URL } from "#/lib/extension-links";

import { docsStyles } from "../../docs/docs-page.stylex";
import { guideStyles } from "../guide-page.stylex";
import { GuideCallout, GuideSteps, UiLabel } from "../guide-primitives";
import { GuideShell } from "../guide-shell";

export function EverywhereGuidePage() {
  return (
    <GuideShell
      area="everywhere"
      title={<Trans>Beyond the app</Trans>}
      dek={
        <Trans>
          Saving things while you browse the rest of the web, keeping Standard
          Reader on your home screen, and passing an article on.
        </Trans>
      }
    >
      <h2 {...stylex.props(docsStyles.h2, docsStyles.h2First)} id="extension">
        <Trans>The browser extension</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Good writing rarely turns up while you are already in a reading app.
          The Standard Reader extension puts saving and following on every page
          you visit, so you can keep them without breaking your stride.
        </Trans>
      </p>
      <ul {...stylex.props(docsStyles.prose)}>
        <li {...stylex.props(guideStyles.listItem)}>
          <Trans>
            On any article, a small overlay saves it to your queue or follows
            the publication it came from.
          </Trans>
        </li>
        <li {...stylex.props(guideStyles.listItem)}>
          <Trans>
            On Bluesky, quiet badges mark the people whose writing you can read
            here.
          </Trans>
        </li>
        <li {...stylex.props(guideStyles.listItem)}>
          <Trans>
            Everything you save shows up in the app straight away — it is the
            same account.
          </Trans>
        </li>
      </ul>
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
          Carry on browsing. The overlay appears where it is useful and stays
          out of the way where it is not.
        </Trans>
      </GuideSteps>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          What the extension can see and what it does with it is written out in
          full on the{" "}
          <Link to="/privacy/extension" {...stylex.props(docsStyles.proseLink)}>
            extension privacy page
          </Link>
          .
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="install">
        <Trans>Installing Standard Reader</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Standard Reader can be installed like an app, from the browser, with
          no store involved. On a phone, use your browser&apos;s{" "}
          <UiLabel>Add to Home Screen</UiLabel>; on a computer, look for the
          install button in the address bar. You get an icon, a window without
          browser chrome, and the same account you already have.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="offline">
        <Trans>Reading offline</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Pages you have already visited stay available when your connection
          drops, and Standard Reader shows a plain offline page rather than a
          browser error when you reach for something it does not have. When a
          new version of the app is ready, it offers to reload rather than
          changing under you mid-article.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="sharing">
        <Trans>Sharing an article</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          <UiLabel>Share</UiLabel> on any article or publication copies a link,
          or posts it to Bluesky with a proper preview card. On a phone it can
          hand off to whatever you normally share with.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Links you share work for anyone, signed in or not — they open the
          article in the reader, and nobody is asked to make an account to read
          it.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="for-publishers">
        <Trans>If you publish, too</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Standard Reader is a reader, not a publishing tool — you write
          wherever you already write. If your site publishes in the same open
          format, it turns up in the directory on its own, and readers can
          follow it here.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          There is also an embeddable <UiLabel>Follow</UiLabel> button you can
          put on your own site, from the <UiLabel>Share</UiLabel> menu on your
          publication&apos;s page.
        </Trans>
      </p>
      <GuideCallout title={<Trans>Going further</Trans>}>
        <Trans>
          Wiring up a site that does not publish in this format yet is the one
          genuinely technical job in the whole product, and it has its own{" "}
          <Link to="/docs/publishing" {...stylex.props(docsStyles.proseLink)}>
            publishing documentation
          </Link>
          . Everything else in this guide stays where it is.
        </Trans>
      </GuideCallout>
    </GuideShell>
  );
}
