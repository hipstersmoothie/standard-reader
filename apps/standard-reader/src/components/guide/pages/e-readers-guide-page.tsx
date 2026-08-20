"use client";

import { Trans } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { docsStyles } from "../../docs/docs-page.stylex";
import { GuideCallout, GuideSteps, UiLabel } from "../guide-primitives";
import { GuideShell } from "../guide-shell";

/**
 * Reading Standard Reader on a device that is not a browser.
 *
 * Written for the reader who already owns a Kobo or a Kindle and wants their
 * unread queue on it — not for someone shopping for a workflow. So it opens
 * with the one thing they came for (the catalog URL), and only then explains
 * what an OPDS catalog is.
 *
 * The honest limitation about progress sync is stated in its own section
 * rather than buried: position travels device → app, and between devices, but
 * not app → device, and a reader who expects otherwise will think it is broken.
 */
export function EreadersGuidePage() {
  return (
    <GuideShell
      area="e-readers"
      dek={
        <Trans>
          Your unread queue, your saved articles and every publication you
          subscribe to, on a Kobo, a Kindle, a reMarkable or a phone — as real
          EPUB files, with the images, ready to read on a plane.
        </Trans>
      }
      title={<Trans>E-readers</Trans>}
    >
      <h2
        {...stylex.props(docsStyles.h2, docsStyles.h2First)}
        id="what-you-get"
      >
        <Trans>What you get</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Standard Reader publishes an <b>OPDS catalog</b> — the same thing a
          library or a bookstore hands an e-reading app. Point an app at it once
          and your shelves appear on the device: <b>Unread</b>,{" "}
          <b>Saved for later</b>, <b>Subscriptions</b>, each of your lists, and
          every publication you follow. Open any of them and each article has a
          download button.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          The files are built when you ask for them, from the same article
          bodies the reader shows — images pulled in, footnotes as real
          endnotes, a link back to the original at the end of every piece.
          Nothing is trimmed to an excerpt. A whole publication, a list or a
          collection can also come down as one book, with a table of contents.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Comics come down as <b>CBZ</b> as well, so comic apps get their page
          turns and their scrubber instead of a reflowable book that fights
          them.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="setting-it-up">
        <Trans>Setting it up</Trans>
      </h2>
      <GuideSteps>
        <Trans>
          <b>Copy your catalog URL.</b> It is in{" "}
          <Link {...stylex.props(docsStyles.proseLink)} to="/settings">
            Settings
          </Link>{" "}
          under <UiLabel>E-readers</UiLabel>. It is yours — it carries your
          subscriptions and your saved articles.
        </Trans>
        <Trans>
          <b>Add it to your reading app.</b> In KOReader that is{" "}
          <UiLabel>Search → OPDS catalog → +</UiLabel>. Foliate, Marvin, Aldiko,
          Thorium, Panels and Chunky all have a similar “add catalog” screen.
          Paste the URL and leave the username and password blank.
        </Trans>
        <Trans>
          <b>Browse and download.</b> Your shelves are the top level. Tap an
          article to pull the EPUB onto the device.
        </Trans>
      </GuideSteps>

      <h2 {...stylex.props(docsStyles.h2)} id="one-article">
        <Trans>Sending one article</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          You do not need a catalog for a single piece. Every article's share
          menu has <UiLabel>Download EPUB</UiLabel> — and{" "}
          <UiLabel>Download CBZ</UiLabel> on a comic. A publication's{" "}
          <UiLabel>…</UiLabel> menu has <UiLabel>Send to e-reader…</UiLabel>,
          which offers its recent articles as one book and shows the catalog URL
          for that publication on its own.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="progress-sync">
        <Trans>Keeping your place</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          KOReader can sync your reading position through Standard Reader, so
          picking up a book on a second device puts you where you stopped.
          Settings → <UiLabel>E-readers</UiLabel> has the three values it wants:
          the sync server URL, your username, and a sync key.
        </Trans>
      </p>
      <GuideSteps>
        <Trans>
          In KOReader, open <UiLabel>Tools → Progress sync</UiLabel> and choose{" "}
          <UiLabel>Custom sync server</UiLabel>.
        </Trans>
        <Trans>
          Paste the sync server URL, then log in with your handle and the sync
          key. There is no separate account to register.
        </Trans>
        <Trans>
          Turn on <UiLabel>Sync every N pages</UiLabel> if you want it to happen
          without asking.
        </Trans>
      </GuideSteps>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Your position also flows back here: read half of something on the Kobo
          and the article shows as half-read in the app, and in{" "}
          <UiLabel>Continue reading</UiLabel>. That direction is one-way. A
          position on a device is a place in <i>that device's</i> rendering of
          the file, and there is no honest way to turn a percentage back into
          one, so the app never sends a position out to a device that did not
          record it.
        </Trans>
      </p>
      <GuideCallout title={<Trans>What the sync key can do</Trans>}>
        <Trans>
          The sync key only carries your reading position. It cannot read your
          account, post anything, or change what you subscribe to — and it is
          not your Bluesky password. If you lose a device, ask us to rotate it.
        </Trans>
      </GuideCallout>

      <h2 {...stylex.props(docsStyles.h2)} id="whats-missing">
        <Trans>What will not be there</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          A few articles on the network are really link posts — a headline and a
          URL, bridged in from somewhere else, with no body to package. Those
          are left out of the catalog rather than offered as a file that would
          open to nothing. You will still find them in the app, where they link
          out to the site that has the writing.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Downloading does not mark anything read, and reading on a device does
          not remove it from your unread shelf until KOReader syncs a position
          back. Polls, signup forms and other live embeds become links — a book
          cannot run them.
        </Trans>
      </p>
    </GuideShell>
  );
}
