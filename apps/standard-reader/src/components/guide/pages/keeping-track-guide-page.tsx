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
          Following, saving, recommending, and — once you follow more than a
          handful of publications — keeping the whole thing tidy.
        </Trans>
      }
    >
      <h2 {...stylex.props(docsStyles.h2, docsStyles.h2First)} id="following">
        <Trans>Following a publication</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          <UiLabel>Follow</UiLabel> is the only subscription there is. New
          writing from anything you follow appears on Home and in Latest, and
          the publication is listed in your sidebar. There is no email sign-up
          and no separate account with the publisher.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          You can also follow a <b>person</b> rather than a publication, from
          their author page. That covers everything they publish now and
          anything they start later.
        </Trans>
      </p>

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
        <Trans>Managing everything you follow</Trans>
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

      <h2 {...stylex.props(docsStyles.h2)} id="lists">
        <Trans>Grouping publications into lists</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          A list is a folder for publications — <b>Work</b>, <b>Fiction</b>,{" "}
          <b>Read on Sunday</b>, whatever is useful. Lists appear as their own
          groups in the sidebar, so you can read one part of your follows
          without the rest.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Make one with <UiLabel>New list</UiLabel> in the sidebar, or add a
          publication to a list from its <UiLabel>Add to list</UiLabel> menu. A
          publication can be in as many lists as you like, and being in a list
          does not change your feeds — it only changes how they are grouped.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="collections">
        <Trans>Collections</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          A collection is an issue you assemble yourself: articles from anywhere
          on the network, gathered, ordered, given a cover, and rendered as a
          magazine edition other people can read and subscribe to. Group several
          into a series and it behaves like a publication of your own.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Collections live under{" "}
          <Link to="/collections" {...stylex.props(docsStyles.proseLink)}>
            Collections
          </Link>{" "}
          in the sidebar. Because publishing one writes a new kind of record to
          your account, the first time you make one you will be asked to grant
          an extra permission — that is the{" "}
          <UiLabel>Upgrade permissions</UiLabel> prompt, and it only appears
          once.
        </Trans>
      </p>
      <GuideFigure
        shot="collections"
        alt={t`The Collections screen showing covers of magazine-style editions the reader has assembled, grouped into a series.`}
        caption={
          <Trans>Collections you have made, grouped into a series.</Trans>
        }
      />
    </GuideShell>
  );
}
