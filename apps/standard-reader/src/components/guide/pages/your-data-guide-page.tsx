"use client";

import { Trans } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { docsStyles } from "../../docs/docs-page.stylex";
import { guideStyles } from "../guide-page.stylex";
import { GuideCallout, UiLabel } from "../guide-primitives";
import { GuideShell } from "../guide-shell";

export function YourDataGuidePage() {
  return (
    <GuideShell
      area="your-data"
      title={<Trans>Your account and data</Trans>}
      dek={
        <Trans>
          Where your reading is kept, who else can see it, what you agreed to
          when you signed in, and how to take it back.
        </Trans>
      }
    >
      <h2
        {...stylex.props(docsStyles.h2, docsStyles.h2First)}
        id="where-it-lives"
      >
        <Trans>Where your reading lives</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          When you follow a publication, save an article, recommend one, or open
          one, that fact is written into <b>your own account&apos;s storage</b>{" "}
          — the same place your Bluesky profile and posts are kept, run by
          whoever hosts your account.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          This is the part that makes Standard Reader different from a normal
          app, and it has real consequences:
        </Trans>
      </p>
      <ul {...stylex.props(docsStyles.prose)}>
        <li {...stylex.props(guideStyles.listItem)}>
          <Trans>
            Your follows and saves are yours. If you stop using Standard Reader,
            they stay where they are.
          </Trans>
        </li>
        <li {...stylex.props(guideStyles.listItem)}>
          <Trans>
            Another app on the same network can read them, so your reading list
            is not trapped in one product.
          </Trans>
        </li>
        <li {...stylex.props(guideStyles.listItem)}>
          <Trans>
            They are public. Not advertised, not put in a feed — but readable by
            anyone who goes looking, the same as who you follow on Bluesky.
          </Trans>
        </li>
      </ul>
      <GuideCallout title={<Trans>Worth deciding early</Trans>}>
        <Trans>
          Reading history is the one most people have a view about. It is public
          like the rest, it is what makes unread counts work, and it can be
          turned off — or deleted later — in settings.
        </Trans>
      </GuideCallout>

      <h2 {...stylex.props(docsStyles.h2)} id="what-we-store">
        <Trans>What Standard Reader stores</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          We keep a copy of the public network — publications, articles, and who
          follows what — so the app can search, rank, and load quickly. That
          copy includes the records described above. It is a cache of things
          that are already public, not a second private profile of you.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Settings that have nowhere else to go — your theme and language when
          you are signed out — are kept in your browser. The full account is on
          the{" "}
          <Link to="/privacy" {...stylex.props(docsStyles.proseLink)}>
            privacy page
          </Link>
          .
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="permissions">
        <Trans>Permissions you grant</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Signing in asks for permission to write only the kinds of records the
          app actually needs — follows, saves, recommendations, read records,
          and lists. It cannot post to Bluesky as you.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          A few things ask for more, at the moment you first use them rather
          than up front: publishing a collection, and posting to the feedback
          board. When that happens you will see an{" "}
          <UiLabel>Upgrade permissions</UiLabel> prompt explaining what is being
          added. Decline it and the rest of the app carries on working.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="connected-apps">
        <Trans>Connected apps</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          The <UiLabel>Connected apps</UiLabel> section of settings lists
          anything signed in to your account through Standard Reader — the
          browser extension, most commonly. <UiLabel>Disconnect</UiLabel> ends
          that session without touching the others or logging you out here.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="deleting">
        <Trans>Deleting your data</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          At the bottom of settings, <UiLabel>Personal data</UiLabel> deletes
          categories of records outright: your reading history, your saved
          articles, or the publication lists you made. Each asks for
          confirmation and explains what will change.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          These deletions remove the records from your account itself, not just
          from our copy — which is why they cannot be undone. Deleting your
          reading history, for example, makes everything look unread again
          everywhere.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Logging out leaves everything intact and signs you out on this device.
        </Trans>
      </p>
    </GuideShell>
  );
}
