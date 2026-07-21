"use client";

import { Trans } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { getPublicUrlClient } from "#/lib/public-url";
import { SITE_NAME } from "#/lib/site-metadata";

import { legalPageStyles as styles } from "./legal-page-styles";
import { Kicker } from "./primitives";

export function PrivacyView() {
  const siteUrl = getPublicUrlClient();
  const siteHost = siteUrl.replace(/^https?:\/\//, "");

  return (
    <article {...stylex.props(styles.root)} data-screen-label="Privacy">
      <header {...stylex.props(styles.head)}>
        <div {...stylex.props(styles.headKicker)}>
          <Kicker>
            <Trans>Legal</Trans>
          </Kicker>
        </div>
        <h1 {...stylex.props(styles.title)}>
          <Trans>Privacy policy</Trans>
        </h1>
        <p {...stylex.props(styles.updated)}>
          <Trans>Last updated June 11, 2026</Trans>
        </p>
      </header>

      <div {...stylex.props(styles.body)}>
        <p {...stylex.props(styles.paragraph)}>
          <Trans>
            {SITE_NAME} is a web reader for standard.site publications on the AT
            Protocol. This policy describes what we collect when you use this
            site, how we use it, and the choices you have. It applies to the
            Standard Reader deployment you are using at{" "}
            <a href={siteUrl} {...stylex.props(styles.inlineLink)}>
              {siteHost}
            </a>
            .
          </Trans>
        </p>

        <h2
          {...stylex.props(styles.sectionHeading, styles.sectionHeadingPlain)}
        >
          <Trans>What we collect</Trans>
        </h2>

        <p {...stylex.props(styles.paragraph)}>
          <Trans>
            <strong>When you browse without signing in,</strong> we serve public
            writing from our read-model index. We may store a theme preference
            cookie and, if you have signed in before on this device, a short
            list of recently used account handles (and optional avatar URLs) to
            speed up sign-in. We do not require an account to read.
          </Trans>
        </p>

        <p {...stylex.props(styles.paragraph)}>
          <Trans>
            <strong>When you sign in</strong> with your Atmosphere account (for
            example via Bluesky OAuth), we create an app session tied to your AT
            Protocol DID. We store:
          </Trans>
        </p>

        <ul {...stylex.props(styles.list)}>
          <li {...stylex.props(styles.listItem)}>
            <Trans>
              Your display name, handle, avatar URL, and DID as returned by your
              account provider.
            </Trans>
          </li>
          <li {...stylex.props(styles.listItem)}>
            <Trans>
              OAuth tokens so we can read and write records in your repository
              on your behalf (for example follows, likes, saves, and publication
              lists).
            </Trans>
          </li>
          <li {...stylex.props(styles.listItem)}>
            <Trans>An HttpOnly session cookie that keeps you signed in.</Trans>
          </li>
          <li {...stylex.props(styles.listItem)}>
            <Trans>
              Session metadata such as IP address and browser user-agent string,
              used for security and session management.
            </Trans>
          </li>
          <li {...stylex.props(styles.listItem)}>
            <Trans>
              In-app preferences you set (theme, reading typography, whether to
              track reading history, and similar settings).
            </Trans>
          </li>
        </ul>

        <p {...stylex.props(styles.paragraph)}>
          <Trans>
            <strong>Reading activity.</strong> When reading history is enabled,
            articles you open are recorded as public AT Protocol records in{" "}
            <em>your</em> repository — not as private app-only data. You can
            turn this off in Settings; existing records remain in your repo
            until you delete them from the Personal data section.
          </Trans>
        </p>

        <p {...stylex.props(styles.paragraph)}>
          <Trans>
            <strong>Analytics.</strong> When configured, we use{" "}
            <a
              href="https://plausible.io/privacy-focused-web-analytics"
              target="_blank"
              rel="noreferrer"
              {...stylex.props(styles.inlineLink)}
            >
              Plausible Analytics
            </a>
            , a privacy-oriented analytics service that does not use cookies for
            tracking and does not build individual user profiles. Page views are
            aggregated; no analytics run when the service is not configured for
            this deployment.
          </Trans>
        </p>

        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>Browser extension</Trans>
        </h2>

        <p {...stylex.props(styles.paragraph)}>
          <Trans>
            If you install the {SITE_NAME} browser extension, it uses the same
            account and session cookie as this site. The extension sends page
            URLs to our <code>/api/extension/*</code> endpoints for index
            matching and keeps overlay settings in your browser&apos;s extension
            storage. See the{" "}
            <Link to="/privacy/extension" {...stylex.props(styles.inlineLink)}>
              extension privacy policy
            </Link>{" "}
            for details that apply only to the extension.
          </Trans>
        </p>

        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>What we do not do</Trans>
        </h2>

        <p {...stylex.props(styles.paragraph)}>
          <Trans>
            We do not host publication content. Articles and publications remain
            in their authors&apos; repositories; our database is a derived index
            for fast browsing and search.
          </Trans>
        </p>

        <p {...stylex.props(styles.paragraph)}>
          <Trans>
            We do not post to your account except when you take an explicit
            action that requires it (for example following a publication, liking
            or saving an article, or subscribing with the dedicated subscribe
            flow). We do not sell your personal information.
          </Trans>
        </p>

        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>Where data lives</Trans>
        </h2>

        <p {...stylex.props(styles.paragraph)}>
          <Trans>
            Your social actions (follows, likes, saves, lists) are written to
            your AT Protocol repository and are visible according to the
            network&apos;s rules and your account settings. Our Postgres
            database holds a network read-model, app session state, and cached
            public metadata — not the canonical copies of publications.
          </Trans>
        </p>

        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>Third parties</Trans>
        </h2>

        <p {...stylex.props(styles.paragraph)}>
          <Trans>
            Sign-in and record access go through your Personal Data Server and
            the wider AT Protocol network. Infrastructure providers (such as our
            database host) process data on our behalf under their own terms.
            Embedded media, fonts, or links on article pages may load resources
            from other sites when you open them.
          </Trans>
        </p>

        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>Your choices</Trans>
        </h2>

        <p {...stylex.props(styles.paragraph)}>
          <Trans>
            You can sign out at any time, which clears your app session cookie.
            You can clear site cookies in your browser to remove theme and
            saved-handle preferences. You can change reading-history tracking
            and delete personal data from Settings. To remove other AT Protocol
            records you created through the app, use a compatible client or your
            repository tools.
          </Trans>
        </p>

        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>Changes</Trans>
        </h2>

        <p {...stylex.props(styles.paragraph)}>
          <Trans>
            We may update this policy as the product changes. The &ldquo;Last
            updated&rdquo; date at the top will change when we do. Continued use
            of the site after an update means you accept the revised policy.
          </Trans>
        </p>

        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>Questions</Trans>
        </h2>

        <p {...stylex.props(styles.paragraph)}>
          <Trans>
            For more about how {SITE_NAME} works, see the{" "}
            <Link to="/about" {...stylex.props(styles.inlineLink)}>
              About
            </Link>{" "}
            page. For privacy questions about this deployment, contact the
            operator of the site at the URL above.
          </Trans>
        </p>
      </div>
    </article>
  );
}
