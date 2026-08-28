"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { docsStyles } from "../../docs/docs-page.stylex";
import { GuideFigure } from "../guide-figure";
import { guideStyles } from "../guide-page.stylex";
import { GuideCallout, UiLabel } from "../guide-primitives";
import { GuideShell } from "../guide-shell";

export function FindingGuidePage() {
  const { t } = useLingui();

  return (
    <GuideShell
      area="finding"
      title={<Trans>Finding things to read</Trans>}
      dek={
        <Trans>
          Five ways in: what is new from your follows, what the whole network is
          publishing, the directory, search, and topics.
        </Trans>
      }
    >
      <h2 {...stylex.props(docsStyles.h2, docsStyles.h2First)} id="home">
        <Trans>Home</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Home is the catch-up screen. It opens with the date and how much you
          have not read, leads with one featured article, and then lists what is
          new from the publications you subscribe to.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Alongside it, two short lists do the discovery work:{" "}
          <UiLabel>Trending</UiLabel> is what the network is reading this week,
          and <UiLabel>You might follow</UiLabel> suggests publications based on
          who you already follow. They change as you do.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="latest">
        <Trans>Latest</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Latest is the plain chronological list — newest first, nothing
          reordered. Four tabs decide what goes in it:
        </Trans>
      </p>
      <ul {...stylex.props(docsStyles.prose)}>
        <li {...stylex.props(guideStyles.listItem)}>
          <UiLabel>
            <Trans>Unread</Trans>
          </UiLabel>{" "}
          — <Trans>what is left from the publications you subscribe to.</Trans>
        </li>
        <li {...stylex.props(guideStyles.listItem)}>
          <UiLabel>
            <Trans>Subscriptions</Trans>
          </UiLabel>{" "}
          —{" "}
          <Trans>
            everything you subscribe to, read or not. This is the default.
          </Trans>
        </li>
        <li {...stylex.props(guideStyles.listItem)}>
          <UiLabel>
            <Trans>All</Trans>
          </UiLabel>{" "}
          — <Trans>the whole network as it publishes.</Trans>
        </li>
        <li {...stylex.props(guideStyles.listItem)}>
          <UiLabel>
            <Trans>Trending</Trans>
          </UiLabel>{" "}
          —{" "}
          <Trans>
            the same network, ordered by what is being read rather than by time.
          </Trans>
        </li>
      </ul>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Each tab carries a count, and <UiLabel>Mark all as read</UiLabel>{" "}
          clears the backlog when a week gets away from you.
        </Trans>
      </p>
      <GuideFigure
        shot="latest"
        alt={t`The Latest screen showing a row of filter tabs — Unread, Subscriptions, All, and Trending — each with a number beside it, above a chronological list of articles.`}
        caption={
          <Trans>
            Latest, with the filter tabs and their counts across the top.
          </Trans>
        }
      />

      <h2 {...stylex.props(docsStyles.h2)} id="discover">
        <Trans>Discover</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Discover is the directory of every publication the network knows about
          — not a curated shelf. It runs top to bottom from most personal to
          most complete:
        </Trans>
      </p>
      <ul {...stylex.props(docsStyles.prose)}>
        <li {...stylex.props(guideStyles.listItem)}>
          <UiLabel>
            <Trans>Recommended for you</Trans>
          </UiLabel>{" "}
          — <Trans>tuned to what you already subscribe to.</Trans>
        </li>
        <li {...stylex.props(guideStyles.listItem)}>
          <UiLabel>
            <Trans>Followed by people you follow</Trans>
          </UiLabel>{" "}
          — <Trans>what your corner of Bluesky reads.</Trans>
        </li>
        <li {...stylex.props(guideStyles.listItem)}>
          <UiLabel>
            <Trans>Trending publications</Trans>
          </UiLabel>{" "}
          — <Trans>the most active this week.</Trans>
        </li>
        <li {...stylex.props(guideStyles.listItem)}>
          <UiLabel>
            <Trans>All publications</Trans>
          </UiLabel>{" "}
          —{" "}
          <Trans>
            everything, filtered by topic and sorted by readers, activity, or
            name. Switch between a grid and a list, whichever you scan faster.
          </Trans>
        </li>
      </ul>
      <GuideFigure
        shot="discover"
        alt={t`The Discover screen: a horizontal row of recommended publication cards, a list of trending publications, and below them the full directory with topic filters and a grid of publication cards.`}
        caption={
          <Trans>
            Discover, from recommendations at the top to the full directory at
            the bottom.
          </Trans>
        }
      />

      <h2 {...stylex.props(docsStyles.h2)} id="search">
        <Trans>Search</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Search covers publication names, people&apos;s handles, topics, and
          the text of articles. Results are split into publications, people, and
          articles, and each result shows the passage that matched with your
          words highlighted, so you can tell a real match from a coincidence
          without opening it. Articles come back in order of how well they
          answer the query — a title that matches what you typed comes before an
          article that merely mentions those words somewhere in its body — so
          searching a headline you half-remember finds it.
        </Trans>
      </p>
      <GuideFigure
        shot="search"
        alt={t`Search results for a query, split into Publications, People, and Articles sections, with the matching words highlighted inside each result's excerpt.`}
      />

      <h2 {...stylex.props(docsStyles.h2)} id="topics">
        <Trans>Topics</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Articles and publications carry topic tags. Select one anywhere you
          see it — under a headline, on a publication card, in Discover — and
          you get everything filed under it: an <UiLabel>Articles</UiLabel> tab
          you can sort by recent, trending, or most popular, and a{" "}
          <UiLabel>Publications</UiLabel> tab of everyone who writes about it.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          This is the fastest way from &ldquo;I liked this one piece&rdquo; to
          &ldquo;who else writes about this?&rdquo;
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="people">
        <Trans>People you follow</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Plenty of people you already follow on Bluesky write long-form
          somewhere.{" "}
          <Link to="/friends" {...stylex.props(docsStyles.proseLink)}>
            People you follow
          </Link>{" "}
          finds them and puts their publications, and their newest articles, in
          one place. It is usually the highest-yield screen in the app the first
          week you use it.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Selecting anyone&apos;s name opens their author page: everything they
          publish, what they follow, and what they have recommended.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="add-publication">
        <Trans>Adding a publication by name</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          If you already know what you are looking for, the{" "}
          <UiLabel>Add publication</UiLabel> button opens a single field that
          does three things at once. Leave it empty and it shows what is
          trending. Type a few words and it searches the directory. Paste a
          handle or a domain — <b>@stdout.dev</b>, <b>stdout.dev</b> — and it
          looks that author up directly.
        </Trans>
      </p>
      <GuideCallout title={<Trans>Not in the directory yet?</Trans>}>
        <Trans>
          Pasting a handle works even for publications the network has not
          indexed yet — it goes and asks that author&apos;s account directly.
          Subscribe and it starts appearing in your feeds like any other.
        </Trans>
      </GuideCallout>
    </GuideShell>
  );
}
