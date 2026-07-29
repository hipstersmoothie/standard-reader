"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { docsStyles } from "../../docs/docs-page.stylex";
import { GuideFigure } from "../guide-figure";
import { GuideCallout, GuideSteps, UiLabel } from "../guide-primitives";
import { GuideShell } from "../guide-shell";

export function CollectionsGuidePage() {
  const { t } = useLingui();

  return (
    <GuideShell
      area="collections"
      title={<Trans>Collections</Trans>}
      dek={
        <Trans>
          An issue you assemble yourself: articles from anywhere on the network,
          gathered, ordered, and rendered as a magazine edition other people can
          read and follow.
        </Trans>
      }
    >
      <h2
        {...stylex.props(docsStyles.h2, docsStyles.h2First)}
        id="what-a-collection-is"
      >
        <Trans>What a collection is</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          A{" "}
          <Link to="/guide/lists" {...stylex.props(docsStyles.proseLink)}>
            list
          </Link>{" "}
          groups publications for your own convenience. A collection is the
          other thing: you pick individual <b>articles</b>, put them in an
          order, give the result a cover and a title, and publish it.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          The result reads like an edition of a magazine rather than a feed — a
          cover, a contents page, and the pieces in the sequence you chose.
          Anyone can read it, and readers can follow your collections the way
          they follow any publication.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Nothing is copied. A collection points at articles where they already
          live, so the writers keep their work and their readers; you are
          editing, not republishing.
        </Trans>
      </p>
      <GuideFigure
        shot="collections"
        alt={t`The Collections screen showing covers of magazine-style editions the reader has assembled, grouped into a series.`}
        caption={
          <Trans>Collections you have made, grouped into a series.</Trans>
        }
      />

      <h2 {...stylex.props(docsStyles.h2)} id="making-one">
        <Trans>Making a collection</Trans>
      </h2>
      <GuideSteps>
        <Trans>
          Open <UiLabel>Collections</UiLabel> in the sidebar and start a new
          one.
        </Trans>
        <Trans>
          Give it a title and a cover, then add articles. Anything indexed on
          the network can go in, from any publication.
        </Trans>
        <Trans>
          Drag the pieces into the order you want them read, and publish.
        </Trans>
      </GuideSteps>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          An edition is not only a list of links. You can write an{" "}
          <b>introduction</b> that sets up the issue, a <b>note</b> alongside
          any individual piece saying why it is here or what to watch for, and
          an <b>outro</b> to close. That is the difference between a folder of
          bookmarks and something edited — the writing between the pieces is
          where your voice lives.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          You can come back and edit an edition later — change the order, swap
          the cover, rewrite a note, add a piece you missed.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="permissions">
        <Trans>The one-time permission</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Publishing a collection writes a new kind of record to your account,
          and the permission you granted when you signed in does not cover it.
          The first time you make one, you will see an{" "}
          <UiLabel>Upgrade permissions</UiLabel> prompt.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Approving it sends you through your account provider once more and
          returns you to the editor. It only happens once; after that,
          collections work like anything else. Declining leaves the rest of the
          app untouched.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="series">
        <Trans>Grouping editions into a series</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Several collections can be grouped into a <b>series</b> — a run of
          issues under one name. A series behaves like a publication of your
          own: it has a page, readers can follow it, and each new edition
          reaches them the way any other publication would.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          This is the difference between making one anthology and running
          something with a rhythm to it — a weekly roundup, a themed quarterly,
          a reading list you keep adding to.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="reading-one">
        <Trans>How readers see it</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Opening a collection shows the magazine edition — cover first, then
          the pieces in order. Individual articles inside it can still be
          opened, saved, and recommended exactly as they can anywhere else.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Readers who would rather not get the magazine treatment can turn{" "}
          <UiLabel>Open collections in magazine</UiLabel> off in{" "}
          <Link
            to="/guide/personalizing"
            {...stylex.props(docsStyles.proseLink)}
          >
            settings
          </Link>
          , and collection articles open in the ordinary reader instead.
        </Trans>
      </p>
      <GuideCallout title={<Trans>Yours, like everything else</Trans>}>
        <Trans>
          A collection is a record in your own account, the same as a follow or
          a save. If you stop using Standard Reader it does not disappear, and
          another app built on the same network can read it.
        </Trans>
      </GuideCallout>
    </GuideShell>
  );
}
