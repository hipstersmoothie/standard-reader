"use client";

import { Trans } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { getPublicUrlClient } from "#/lib/public-url";
import { SITE_NAME } from "#/lib/site-metadata";

import { legalPageStyles as styles } from "./legal-page-styles";
import { Kicker } from "./primitives";

export function ExtensionPrivacyView() {
  const siteUrl = getPublicUrlClient();
  const siteHost = siteUrl.replace(/^https?:\/\//, "");

  return (
    <article
      {...stylex.props(styles.root)}
      data-screen-label="Extension privacy"
    >
      <header {...stylex.props(styles.head)}>
        <div {...stylex.props(styles.headKicker)}>
          <Kicker>
            <Trans>Legal</Trans>
          </Kicker>
        </div>
        <h1 {...stylex.props(styles.title)}>
          <Trans>Browser extension privacy</Trans>
        </h1>
        <p {...stylex.props(styles.updated)}>
          <Trans>Last updated June 13, 2026</Trans>
        </p>
      </header>

      <div {...stylex.props(styles.body)}>
        <p {...stylex.props(styles.paragraph)}>
          <Trans>
            The {SITE_NAME} browser extension helps you save articles and follow
            publications on the standard.site network from any tab. It connects
            to the same account as the web app at{" "}
            <a href={siteUrl} {...stylex.props(styles.inlineLink)}>
              {siteHost}
            </a>
            . This policy covers the extension only; the{" "}
            <Link to="/privacy" {...stylex.props(styles.inlineLink)}>
              site privacy policy
            </Link>{" "}
            describes data handling on the website itself.
          </Trans>
        </p>

        <h2
          {...stylex.props(styles.sectionHeading, styles.sectionHeadingPlain)}
        >
          <Trans>What the extension accesses</Trans>
        </h2>

        <ul {...stylex.props(styles.list)}>
          <li {...stylex.props(styles.listItem)}>
            <Trans>
              <strong>Page URLs.</strong> When you open the popup, use the page
              overlay, or choose a context-menu action, the extension sends the
              relevant URL to {SITE_NAME}&apos;s <code>/api/extension/*</code>{" "}
              endpoints so we can match it against our index and offer save,
              follow, or open actions. Page content is not uploaded.
            </Trans>
          </li>
          <li {...stylex.props(styles.listItem)}>
            <Trans>
              <strong>Session cookie.</strong> After you sign in through the web
              app, the extension background worker reads your HttpOnly session
              cookie on {siteHost} to authenticate API requests. Content scripts
              do not read this cookie directly.
            </Trans>
          </li>
          <li {...stylex.props(styles.listItem)}>
            <Trans>
              <strong>Extension settings.</strong> Your overlay and Bluesky
              embed preferences are stored locally in{" "}
              <code>chrome.storage.sync</code> (or the equivalent in other
              browsers) and are not sent to our servers except as part of normal
              extension operation on your device.
            </Trans>
          </li>
          <li {...stylex.props(styles.listItem)}>
            <Trans>
              <strong>Read aloud.</strong> When you choose Listen, the extension
              may fetch indexed article text from{" "}
              <code>/api/extension/narration</code> (same content as the in-app
              reader) or read the open page locally when the index has no full
              body. Speech is synthesized on your device; audio is not streamed
              from our servers.
            </Trans>
          </li>
        </ul>

        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>What the extension does not do</Trans>
        </h2>

        <ul {...stylex.props(styles.list)}>
          <li {...stylex.props(styles.listItem)}>
            <Trans>
              We do not run a separate analytics pipeline inside the extension.
            </Trans>
          </li>
          <li {...stylex.props(styles.listItem)}>
            <Trans>
              We do not sell or share extension data with third parties.
            </Trans>
          </li>
          <li {...stylex.props(styles.listItem)}>
            <Trans>
              We do not scrape or upload arbitrary page text — only URLs needed
              for index matching, indexed article text you request for
              read-aloud, or on-device extraction from the page you are
              listening to.
            </Trans>
          </li>
        </ul>

        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>How requests are handled</Trans>
        </h2>

        <p {...stylex.props(styles.paragraph)}>
          <Trans>
            Network calls to {siteHost} run in the extension background worker,
            not in page scripts injected into sites you visit. That keeps your
            session handling in one place and limits what runs on third-party
            pages to URL matching, UI (overlay chip, Bluesky embed save button),
            and messaging with the background worker.
          </Trans>
        </p>

        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>Account actions</Trans>
        </h2>

        <p {...stylex.props(styles.paragraph)}>
          <Trans>
            When you save or follow from the extension, {SITE_NAME} writes AT
            Protocol records to <em>your</em> repository through the same server
            paths as the web app. Those records follow the network&apos;s
            visibility rules and your account settings.
          </Trans>
        </p>

        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>Your choices</Trans>
        </h2>

        <p {...stylex.props(styles.paragraph)}>
          <Trans>
            You can disable the page overlay and Bluesky embed save button in
            the extension options page. You can sign out from the web app to
            invalidate the session cookie the extension uses. Uninstalling the
            extension removes locally stored settings from your browser profile.
          </Trans>
        </p>

        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>Changes</Trans>
        </h2>

        <p {...stylex.props(styles.paragraph)}>
          <Trans>
            We may update this policy as the extension changes. The &ldquo;Last
            updated&rdquo; date at the top will change when we do. Continued use
            of the extension after an update means you accept the revised
            policy.
          </Trans>
        </p>

        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>Questions</Trans>
        </h2>

        <p {...stylex.props(styles.paragraph)}>
          <Trans>
            For how {SITE_NAME} works overall, see{" "}
            <Link to="/about" {...stylex.props(styles.inlineLink)}>
              About
            </Link>
            . For site-wide privacy, see the{" "}
            <Link to="/privacy" {...stylex.props(styles.inlineLink)}>
              site privacy policy
            </Link>
            . For questions about this deployment, contact the operator of{" "}
            {siteHost}.
          </Trans>
        </p>
      </div>
    </article>
  );
}
