"use client";

import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { getPublicUrlClient } from "#/lib/public-url";
import { SITE_NAME } from "#/lib/site-metadata";

import { primaryColor, uiColor } from "../../design-system/theme/color.stylex";
import {
  horizontalSpace,
  verticalSpace,
} from "../../design-system/theme/semantic-spacing.stylex";
import { spacing } from "../../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "../../design-system/theme/typography.stylex";
import { Kicker } from "./primitives";

const MOBILE = "@media (max-width: 47.5rem)";

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    marginLeft: "auto",
    marginRight: "auto",
    maxWidth: "640px",
    paddingBottom: {
      [MOBILE]: spacing["20"],
      default: spacing["20"],
    },
    paddingLeft: {
      [MOBILE]: horizontalSpace["3xl"],
      default: horizontalSpace["3xl"],
    },
    paddingRight: {
      [MOBILE]: horizontalSpace["3xl"],
      default: horizontalSpace["3xl"],
    },
    paddingTop: {
      [MOBILE]: verticalSpace["7xl"],
      default: verticalSpace["10xl"],
    },
    width: "100%",
  },
  head: {
    textAlign: "center",
    marginBottom: verticalSpace["7xl"],
  },
  headKicker: {
    display: "block",
    marginBottom: verticalSpace["4xl"],
  },
  title: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: {
      [MOBILE]: fontSize["4xl"],
      default: fontSize["5xl"],
    },
    fontStyle: "italic",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.xs,
    textWrap: "balance",
    marginBottom: verticalSpace["4xl"],
    marginTop: verticalSpace.none,
  },
  updated: {
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    letterSpacing: tracking.wider,
    textTransform: "uppercase",
  },
  body: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: {
      [MOBILE]: fontSize.lg,
      default: "1.1875rem",
    },
    lineHeight: 1.68,
  },
  paragraph: {
    marginBottom: spacing["5"],
    marginTop: verticalSpace.none,
  },
  list: {
    marginBottom: spacing["5"],
    marginTop: verticalSpace.none,
    paddingLeft: horizontalSpace["4xl"],
  },
  listItem: {
    marginBottom: verticalSpace.lg,
  },
  sectionHeading: {
    color: primaryColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.widest,
    textTransform: "uppercase",
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginBottom: verticalSpace["3xl"],
    marginTop: verticalSpace["9xl"],
    paddingTop: verticalSpace["5xl"],
  },
  sectionHeadingPlain: {
    borderTopWidth: 0,
    marginTop: verticalSpace["5xl"],
    paddingTop: verticalSpace.none,
  },
  inlineLink: {
    font: "inherit",
    borderWidth: 0,
    backgroundColor: "transparent",
    color: primaryColor.text2,
    cursor: "pointer",
    textDecorationColor: primaryColor.component3,
    textDecorationLine: "underline",
    textDecorationThickness: "2px",
    textUnderlineOffset: spacing["1"],
    paddingBottom: verticalSpace.none,
    paddingLeft: horizontalSpace.none,
    paddingRight: horizontalSpace.none,
    paddingTop: verticalSpace.none,
  },
});

export function PrivacyView() {
  const siteUrl = getPublicUrlClient();

  return (
    <article {...stylex.props(styles.root)} data-screen-label="Privacy">
      <header {...stylex.props(styles.head)}>
        <div {...stylex.props(styles.headKicker)}>
          <Kicker>Legal</Kicker>
        </div>
        <h1 {...stylex.props(styles.title)}>Privacy policy</h1>
        <p {...stylex.props(styles.updated)}>Last updated June 11, 2026</p>
      </header>

      <div {...stylex.props(styles.body)}>
        <p {...stylex.props(styles.paragraph)}>
          {SITE_NAME} is a web reader for standard.site publications on the AT
          Protocol. This policy describes what we collect when you use this
          site, how we use it, and the choices you have. It applies to the
          Standard Reader deployment you are using at{" "}
          <a href={siteUrl} {...stylex.props(styles.inlineLink)}>
            {siteUrl.replace(/^https?:\/\//, "")}
          </a>
          .
        </p>

        <h2
          {...stylex.props(styles.sectionHeading, styles.sectionHeadingPlain)}
        >
          What we collect
        </h2>

        <p {...stylex.props(styles.paragraph)}>
          <strong>When you browse without signing in,</strong> we serve public
          writing from our read-model index. We may store a theme preference
          cookie and, if you have signed in before on this device, a short list
          of recently used account handles (and optional avatar URLs) to speed
          up sign-in. We do not require an account to read.
        </p>

        <p {...stylex.props(styles.paragraph)}>
          <strong>When you sign in</strong> with your Atmosphere account (for
          example via Bluesky OAuth), we create an app session tied to your AT
          Protocol DID. We store:
        </p>

        <ul {...stylex.props(styles.list)}>
          <li {...stylex.props(styles.listItem)}>
            Your display name, handle, avatar URL, and DID as returned by your
            account provider.
          </li>
          <li {...stylex.props(styles.listItem)}>
            OAuth tokens so we can read and write records in your repository on
            your behalf (for example follows, likes, saves, and publication
            lists).
          </li>
          <li {...stylex.props(styles.listItem)}>
            An HttpOnly session cookie that keeps you signed in.
          </li>
          <li {...stylex.props(styles.listItem)}>
            Session metadata such as IP address and browser user-agent string,
            used for security and session management.
          </li>
          <li {...stylex.props(styles.listItem)}>
            In-app preferences you set (theme, reading typography, whether to
            track reading history, and similar settings).
          </li>
        </ul>

        <p {...stylex.props(styles.paragraph)}>
          <strong>Reading activity.</strong> When reading history is enabled,
          articles you open are recorded as public AT Protocol records in{" "}
          <em>your</em> repository — not as private app-only data. You can turn
          this off in Settings; existing records remain in your repo until you
          delete them from the Personal data section.
        </p>

        <p {...stylex.props(styles.paragraph)}>
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
        </p>

        <h2 {...stylex.props(styles.sectionHeading)}>What we do not do</h2>

        <p {...stylex.props(styles.paragraph)}>
          We do not host publication content. Articles and publications remain
          in their authors&apos; repositories; our database is a derived index
          for fast browsing and search.
        </p>

        <p {...stylex.props(styles.paragraph)}>
          We do not post to your account except when you take an explicit action
          that requires it (for example following a publication, liking or
          saving an article, or subscribing with the dedicated subscribe flow).
          We do not sell your personal information.
        </p>

        <h2 {...stylex.props(styles.sectionHeading)}>Where data lives</h2>

        <p {...stylex.props(styles.paragraph)}>
          Your social actions (follows, likes, saves, lists) are written to your
          AT Protocol repository and are visible according to the network&apos;s
          rules and your account settings. Our Postgres database holds a network
          read-model, app session state, and cached public metadata — not the
          canonical copies of publications.
        </p>

        <h2 {...stylex.props(styles.sectionHeading)}>Third parties</h2>

        <p {...stylex.props(styles.paragraph)}>
          Sign-in and record access go through your Personal Data Server and the
          wider AT Protocol network. Infrastructure providers (such as our
          database host) process data on our behalf under their own terms.
          Embedded media, fonts, or links on article pages may load resources
          from other sites when you open them.
        </p>

        <h2 {...stylex.props(styles.sectionHeading)}>Your choices</h2>

        <p {...stylex.props(styles.paragraph)}>
          You can sign out at any time, which clears your app session cookie.
          You can clear site cookies in your browser to remove theme and
          saved-handle preferences. You can change reading-history tracking and
          delete personal data from Settings. To remove other AT Protocol
          records you created through the app, use a compatible client or your
          repository tools.
        </p>

        <h2 {...stylex.props(styles.sectionHeading)}>Changes</h2>

        <p {...stylex.props(styles.paragraph)}>
          We may update this policy as the product changes. The &ldquo;Last
          updated&rdquo; date at the top will change when we do. Continued use
          of the site after an update means you accept the revised policy.
        </p>

        <h2 {...stylex.props(styles.sectionHeading)}>Questions</h2>

        <p {...stylex.props(styles.paragraph)}>
          For more about how {SITE_NAME} works, see the{" "}
          <Link to="/about" {...stylex.props(styles.inlineLink)}>
            About
          </Link>{" "}
          page. For privacy questions about this deployment, contact the
          operator of the site at the URL above.
        </p>
      </div>
    </article>
  );
}
