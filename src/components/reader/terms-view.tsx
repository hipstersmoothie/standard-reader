"use client";

import { Trans } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { getPublicUrlClient } from "#/lib/public-url";
import { SITE_NAME } from "#/lib/site-metadata";

import { legalPageStyles as styles } from "./legal-page-styles";
import { Kicker } from "./primitives";

export function TermsView() {
  const siteUrl = getPublicUrlClient();
  const siteHost = siteUrl.replace(/^https?:\/\//, "");

  return (
    <article {...stylex.props(styles.root)} data-screen-label="Terms">
      <header {...stylex.props(styles.head)}>
        <div {...stylex.props(styles.headKicker)}>
          <Kicker>
            <Trans>Legal</Trans>
          </Kicker>
        </div>
        <h1 {...stylex.props(styles.title)}>
          <Trans>Terms of service</Trans>
        </h1>
        <p {...stylex.props(styles.updated)}>
          <Trans>Last updated July 20, 2026</Trans>
        </p>
      </header>

      <div {...stylex.props(styles.body)}>
        <p {...stylex.props(styles.paragraph)}>
          <Trans>
            {SITE_NAME} is a web reader for standard.site publications on the AT
            Protocol. These terms govern your use of this site. By accessing or
            using the Standard Reader deployment at{" "}
            <a href={siteUrl} {...stylex.props(styles.inlineLink)}>
              {siteHost}
            </a>
            , you agree to these terms. If you do not agree, please do not use
            the site.
          </Trans>
        </p>

        <h2
          {...stylex.props(styles.sectionHeading, styles.sectionHeadingPlain)}
        >
          <Trans>What Standard Reader is</Trans>
        </h2>

        <p {...stylex.props(styles.paragraph)}>
          <Trans>
            {SITE_NAME} is an open-source reader and index for publications on
            the AT Protocol network. We do not host publication content —
            articles and publications remain in their authors&apos;
            repositories, and our database is a derived index for fast browsing
            and search. The service is provided as a convenience for reading and
            discovering writing across the network.
          </Trans>
        </p>

        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>Your account</Trans>
        </h2>

        <p {...stylex.props(styles.paragraph)}>
          <Trans>
            You may read without an account. To follow publications, save
            articles, and take other social actions, you sign in with your
            Atmosphere account (for example via Bluesky OAuth). You are
            responsible for the security of your account and for the activity
            that happens through it. When you take an action that writes to your
            AT Protocol repository, those records live in <em>your</em>{" "}
            repository and are subject to the rules of the network and your
            account provider.
          </Trans>
        </p>

        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>Acceptable use</Trans>
        </h2>

        <p {...stylex.props(styles.paragraph)}>
          <Trans>You agree not to use {SITE_NAME} to:</Trans>
        </p>

        <ul {...stylex.props(styles.list)}>
          <li {...stylex.props(styles.listItem)}>
            <Trans>
              Break the law, infringe others&apos; rights, or violate the terms
              of the AT Protocol network or your account provider.
            </Trans>
          </li>
          <li {...stylex.props(styles.listItem)}>
            <Trans>
              Attempt to disrupt, overload, or gain unauthorized access to the
              service, its infrastructure, or other users&apos; accounts.
            </Trans>
          </li>
          <li {...stylex.props(styles.listItem)}>
            <Trans>
              Scrape, harvest, or misuse the read-model index or API in ways
              that harm the service or the people whose writing it indexes.
            </Trans>
          </li>
        </ul>

        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>Content and intellectual property</Trans>
        </h2>

        <p {...stylex.props(styles.paragraph)}>
          <Trans>
            Publications and articles belong to their authors. Reading or
            indexing them through {SITE_NAME} does not transfer any rights to us
            or to you. Respect the copyright and licensing choices of the
            writers whose work you read. The {SITE_NAME} software itself is open
            source and available under the license in its{" "}
            <a
              href="https://github.com/hipstersmoothie/standard-reader"
              target="_blank"
              rel="noopener noreferrer"
              {...stylex.props(styles.inlineLink)}
            >
              source repository
            </a>
            .
          </Trans>
        </p>

        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>Privacy</Trans>
        </h2>

        <p {...stylex.props(styles.paragraph)}>
          <Trans>
            Your use of {SITE_NAME} is also governed by our{" "}
            <Link to="/privacy" {...stylex.props(styles.inlineLink)}>
              privacy policy
            </Link>
            , which describes what we collect, where your data lives, and the
            choices you have.
          </Trans>
        </p>

        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>Disclaimer and limitation of liability</Trans>
        </h2>

        <p {...stylex.props(styles.paragraph)}>
          <Trans>
            {SITE_NAME} is provided &ldquo;as is&rdquo; and &ldquo;as
            available,&rdquo; without warranties of any kind, whether express or
            implied. We do not guarantee that the service will be uninterrupted,
            error-free, or that the index will always be complete or current. To
            the fullest extent permitted by law, the operator of this deployment
            is not liable for any indirect, incidental, or consequential damages
            arising from your use of the site.
          </Trans>
        </p>

        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>Availability and changes to the service</Trans>
        </h2>

        <p {...stylex.props(styles.paragraph)}>
          <Trans>
            We may change, suspend, or discontinue any part of the service at
            any time. Because {SITE_NAME} indexes a decentralized network, the
            availability of specific publications is outside our control.
          </Trans>
        </p>

        <h2 {...stylex.props(styles.sectionHeading)}>
          <Trans>Changes to these terms</Trans>
        </h2>

        <p {...stylex.props(styles.paragraph)}>
          <Trans>
            We may update these terms as the product changes. The &ldquo;Last
            updated&rdquo; date at the top will change when we do. Continued use
            of the site after an update means you accept the revised terms.
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
            page. For questions about these terms for this deployment, contact
            the operator of the site at the URL above.
          </Trans>
        </p>
      </div>
    </article>
  );
}
