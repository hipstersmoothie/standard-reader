"use client";

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
          <Kicker>Legal</Kicker>
        </div>
        <h1 {...stylex.props(styles.title)}>Browser extension privacy</h1>
        <p {...stylex.props(styles.updated)}>Last updated June 13, 2026</p>
      </header>

      <div {...stylex.props(styles.body)}>
        <p {...stylex.props(styles.paragraph)}>
          The {SITE_NAME} browser extension helps you save articles and follow
          publications on the standard.site network from any tab. It connects to
          the same account as the web app at{" "}
          <a href={siteUrl} {...stylex.props(styles.inlineLink)}>
            {siteHost}
          </a>
          . This policy covers the extension only; the{" "}
          <Link to="/privacy" {...stylex.props(styles.inlineLink)}>
            site privacy policy
          </Link>{" "}
          describes data handling on the website itself.
        </p>

        <h2
          {...stylex.props(styles.sectionHeading, styles.sectionHeadingPlain)}
        >
          What the extension accesses
        </h2>

        <ul {...stylex.props(styles.list)}>
          <li {...stylex.props(styles.listItem)}>
            <strong>Page URLs.</strong> When you open the popup, use the page
            overlay, or choose a context-menu action, the extension sends the
            relevant URL to {SITE_NAME}&apos;s <code>/api/extension/*</code>{" "}
            endpoints so we can match it against our index and offer save,
            follow, or open actions. Page content is not uploaded.
          </li>
          <li {...stylex.props(styles.listItem)}>
            <strong>Session cookie.</strong> After you sign in through the web
            app, the extension background worker reads your HttpOnly session
            cookie on {siteHost} to authenticate API requests. Content scripts
            do not read this cookie directly.
          </li>
          <li {...stylex.props(styles.listItem)}>
            <strong>Extension settings.</strong> Your overlay and Bluesky embed
            preferences are stored locally in <code>chrome.storage.sync</code>{" "}
            (or the equivalent in other browsers) and are not sent to our
            servers except as part of normal extension operation on your device.
          </li>
          <li {...stylex.props(styles.listItem)}>
            <strong>Read aloud.</strong> When you choose Listen, the extension
            may fetch indexed article text from{" "}
            <code>/api/extension/narration</code> (same content as the in-app
            reader) or read the open page locally when the index has no full
            body. Speech is synthesized on your device; audio is not streamed
            from our servers.
          </li>
        </ul>

        <h2 {...stylex.props(styles.sectionHeading)}>
          What the extension does not do
        </h2>

        <ul {...stylex.props(styles.list)}>
          <li {...stylex.props(styles.listItem)}>
            We do not run a separate analytics pipeline inside the extension.
          </li>
          <li {...stylex.props(styles.listItem)}>
            We do not sell or share extension data with third parties.
          </li>
          <li {...stylex.props(styles.listItem)}>
            We do not scrape or upload arbitrary page text — only URLs needed
            for index matching, indexed article text you request for read-aloud,
            or on-device extraction from the page you are listening to.
          </li>
        </ul>

        <h2 {...stylex.props(styles.sectionHeading)}>
          How requests are handled
        </h2>

        <p {...stylex.props(styles.paragraph)}>
          Network calls to {siteHost} run in the extension background worker,
          not in page scripts injected into sites you visit. That keeps your
          session handling in one place and limits what runs on third-party
          pages to URL matching, UI (overlay chip, Bluesky embed save button),
          and messaging with the background worker.
        </p>

        <h2 {...stylex.props(styles.sectionHeading)}>Account actions</h2>

        <p {...stylex.props(styles.paragraph)}>
          When you save or follow from the extension, {SITE_NAME} writes AT
          Protocol records to <em>your</em> repository through the same server
          paths as the web app. Those records follow the network&apos;s
          visibility rules and your account settings.
        </p>

        <h2 {...stylex.props(styles.sectionHeading)}>Your choices</h2>

        <p {...stylex.props(styles.paragraph)}>
          You can disable the page overlay and Bluesky embed save button in the
          extension options page. You can sign out from the web app to
          invalidate the session cookie the extension uses. Uninstalling the
          extension removes locally stored settings from your browser profile.
        </p>

        <h2 {...stylex.props(styles.sectionHeading)}>Changes</h2>

        <p {...stylex.props(styles.paragraph)}>
          We may update this policy as the extension changes. The &ldquo;Last
          updated&rdquo; date at the top will change when we do. Continued use
          of the extension after an update means you accept the revised policy.
        </p>

        <h2 {...stylex.props(styles.sectionHeading)}>Questions</h2>

        <p {...stylex.props(styles.paragraph)}>
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
        </p>
      </div>
    </article>
  );
}
