"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { docsStyles } from "../../docs/docs-page.stylex";
import { GuideFigure } from "../guide-figure";
import { GuideCallout, UiLabel } from "../guide-primitives";
import { GuideShell } from "../guide-shell";

export function KeepingTrackGuidePage() {
  const { t } = useLingui();

  return (
    <GuideShell
      area="keeping-track"
      title={<Trans>Keeping track</Trans>}
      dek={
        <Trans>
          Following, saving, recommending, and — once you subscribe to more than
          a handful of publications — keeping the whole thing tidy.
        </Trans>
      }
    >
      <h2 {...stylex.props(docsStyles.h2, docsStyles.h2First)} id="subscribing">
        <Trans>Subscribing to a publication</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          <UiLabel>Subscribe</UiLabel> is the whole mechanism. New writing from
          anything you subscribe to appears on Home and in Latest, and the
          publication is listed in your sidebar. There is no email sign-up and
          no separate account with the publisher.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          The button sits next to a publication&apos;s name wherever you meet it
          — a card in a feed, the top of an article, the publication&apos;s own
          page. Select it again to unsubscribe.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="following-a-person">
        <Trans>Following a person</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          People work differently. You <b>subscribe</b> to a publication; you{" "}
          <UiLabel>Follow</UiLabel> a person, from their author page. The
          distinction matters, because following a person does two things a
          subscription does not.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          First, it covers <b>everything they publish</b> — every publication
          they run today, and any they start later, without you having to notice
          and subscribe to it. Writers here often keep several: a main one,
          something occasional, a project that turns into its own thing.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Second, it brings you <b>what they recommend</b>. Articles they have
          recommended start appearing in your feed, marked with who recommended
          them. That is the quiet engine behind finding new writing here: you
          are not only subscribing to what someone writes, you are borrowing
          their taste in what to read.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          So subscribe to the publication when you want that particular thing,
          and follow the person when you want the writer — and their reading. In
          the sidebar and in Subscriptions the two are listed together, with a{" "}
          <UiLabel>Type</UiLabel> column telling them apart.
        </Trans>
      </p>
      <GuideCallout title={<Trans>Unfollowing a person</Trans>}>
        <Trans>
          Because following a person is what created the subscriptions to their
          publications, unfollowing them takes those with it. The confirmation
          says how many, so nothing disappears by surprise.
        </Trans>
      </GuideCallout>

      <h2 {...stylex.props(docsStyles.h2)} id="saving">
        <Trans>Saving for later</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          <UiLabel>Save for later</UiLabel> puts an article in a queue you can
          come back to, without marking it read.{" "}
          <Link to="/saved" {...stylex.props(docsStyles.proseLink)}>
            Saved
          </Link>{" "}
          in the sidebar holds them, newest first, with a badge showing how many
          are waiting. Saving again removes it.
        </Trans>
      </p>
      <GuideFigure
        shot="saved"
        alt={t`The Saved screen: a list of article cards the reader has set aside, each with its publication, headline, and excerpt.`}
      />

      <h2 {...stylex.props(docsStyles.h2)} id="recommending">
        <Trans>Recommending an article</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          At the end of every article is{" "}
          <UiLabel>Recommend this article</UiLabel>. It is the closest thing
          here to a like, and it does two useful things: it keeps the piece in
          your own list of recommendations, and it feeds the network&apos;s
          sense of what is worth reading — including the suggestions other
          people see.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Your recommendations are public, the same way a like on Bluesky is.
          They are listed in your account menu under{" "}
          <UiLabel>Recommended articles</UiLabel>, and on your author page.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="history">
        <Trans>Your reading history</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Every article you open while signed in is recorded, newest first, at{" "}
          <Link to="/history" {...stylex.props(docsStyles.proseLink)}>
            Reading history
          </Link>{" "}
          in your account menu. It is what makes unread counts work, and it is
          the fastest way to find a piece you remember reading but cannot name.
        </Trans>
      </p>
      <GuideCallout title={<Trans>If you would rather not</Trans>}>
        <Trans>
          History can be turned off in settings, and the menu entry disappears
          with it. Because these records live in your account, they are readable
          by other apps on the network — worth knowing before you decide.
        </Trans>
      </GuideCallout>

      <h2 {...stylex.props(docsStyles.h2)} id="subscriptions">
        <Trans>Managing your subscriptions</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Selecting the <UiLabel>Subscriptions</UiLabel> heading in the sidebar
          opens one table of everything you follow — publications and people
          together. Each row shows unread count, when it last published, how
          many articles and readers it has, its topic, and which of your lists
          it belongs to.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Every column sorts, and the filter box narrows by name, handle, or
          topic. Sorting by <UiLabel>Last post</UiLabel> is the quickest way to
          find the publications that quietly stopped writing; sorting by{" "}
          <UiLabel>Unread</UiLabel> finds the ones you are drowning in.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Select several rows at once and you can add them all to a list, or
          unfollow them all together.
        </Trans>
      </p>
      <GuideFigure
        shot="subscriptions"
        alt={t`The Subscriptions screen: a sortable table where each row is a publication or person the reader follows, with columns for type, unread count, last post, articles, followers, topic, and lists.`}
        caption={
          <Trans>
            One sortable table for everything you follow. Every column sorts;
            selecting rows turns on the bulk actions.
          </Trans>
        }
      />

      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Once the table itself gets long, two things pick up where it leaves
          off:{" "}
          <Link to="/guide/lists" {...stylex.props(docsStyles.proseLink)}>
            lists
          </Link>{" "}
          group what you follow into the sidebar, and{" "}
          <Link to="/guide/collections" {...stylex.props(docsStyles.proseLink)}>
            collections
          </Link>{" "}
          let you assemble articles into an edition of your own.
        </Trans>
      </p>
    </GuideShell>
  );
}
