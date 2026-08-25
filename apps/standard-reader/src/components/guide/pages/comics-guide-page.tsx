"use client";

import { Trans } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { docsStyles } from "../../docs/docs-page.stylex";
import { guideStyles } from "../guide-page.stylex";
import { GuideCallout, GuideSteps, UiLabel } from "../guide-primitives";
import { GuideShell } from "../guide-shell";

/**
 * The comic view, from the author's side.
 *
 * Everything the comic reader does is derived from posts a cartoonist is
 * already making — there is no comic record, no page field, no issue field. So
 * this page is mostly about the conventions those derivations read: one
 * publisher setting, the shape of a post, and the way titles are written.
 *
 * Deliberately concrete about the two thresholds (`COMIC_PAGE_SHARE`,
 * `ISSUE_TITLE_MATCH_SHARE`): an author whose comic is not lighting up needs to
 * know how close it is, and "mostly" is not something you can check your own
 * archive against.
 */
export function ComicsGuidePage() {
  return (
    <GuideShell
      area="comics"
      title={<Trans>Publishing a comic</Trans>}
      dek={
        <Trans>
          Standard Reader has a reading mode built for comics — a shelf of
          covers instead of a list of post titles, and a full-screen theater
          that flips through your pages. You do not author anything specially
          for it. This page is how to make sure your comic gets it.
        </Trans>
      }
    >
      <h2
        {...stylex.props(docsStyles.h2, docsStyles.h2First)}
        id="what-readers-get"
      >
        <Trans>What readers get</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          A comic publication gets two things an ordinary blog does not. Its
          page shows a <b>shelf of covers</b> — your art, at trade-paperback
          proportions — rather than dozens of near-identical rows reading{" "}
          <i>Pg. 1</i>, <i>Pg. 2</i>, <i>Pg. 3</i>. And opening one drops the
          reader into the <b>comic reader</b>: a dark, chrome-free theater
          holding one page at a time.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          The theater treats the whole publication as one book. Page numbers run
          straight through from your first page to your latest, so a reader who
          holds down the arrow key walks the entire run without stopping at the
          end of every issue. Arrow keys, space, Page Up and Page Down all turn
          pages; Home and End jump to either end; on a phone the outer edges of
          the screen turn pages, a swipe does too, and pinch-to-zoom gets a
          reader into a dense panel. There is a full-screen toggle on the{" "}
          <UiLabel>f</UiLabel> key. Past the last page is a back cover telling
          them they are caught up and inviting them to subscribe.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          The current page lives in the address bar, so a reader can link
          someone straight to a page, and reopening the comic puts them back
          where they stopped.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="turning-it-on">
        <Trans>Turning the comic view on</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          There is no “this is a comic” switch anywhere on the network, and
          nothing to set on Standard Reader — we do not host your publication.
          Two things have to be true instead.
        </Trans>
      </p>
      <GuideSteps>
        <Trans>
          <b>Your publication has to say it reads forwards.</b> That is a
          setting on the publication itself, in whatever tool you publish with —
          the one that says the work is read from its first post rather than
          newest-first. In the underlying record it is{" "}
          <code {...stylex.props(docsStyles.codeInline)}>
            preferences.prevNextDirection
          </code>{" "}
          set to <code {...stylex.props(docsStyles.codeInline)}>ltr</code>.
          Leaflet writes this field; if you roll your own records, see{" "}
          <Link to="/guide/publishing" {...stylex.props(docsStyles.proseLink)}>
            Publishing your site
          </Link>
          . Without it a comic is just a blog that happens to post drawings.
        </Trans>
        <Trans>
          <b>Your posts have to read as pages.</b> We look at your 40 newest
          posts and count the ones that render at least one image and carry no
          more than about 700 words of prose. If at least 60% of them do, the
          publication is a comic. If they do not, it is treated as a serialized
          book — still read front-to-back, but as articles with an{" "}
          <UiLabel>Up next</UiLabel> link rather than as pages of art.
        </Trans>
      </GuideSteps>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Both are re-checked as your archive grows, and the setting is picked
          up the first time anyone opens your publication after you change it —
          you do not have to tell us. Being read as a book rather than a comic
          is never a dead end for a reader: every route into the comic reader
          also links to the ordinary reading view, and an issue with no art
          falls back to it outright.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="pages">
        <Trans>What counts as a page</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          A page is an image your post&apos;s body renders, and they are flipped
          through in the order they appear in the post. One image per post is
          the usual shape and the one everything here is tuned for, but a post
          carrying three images contributes three pages, in order — useful for
          posting a whole issue at once.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          A post with no images contributes nothing to flip through, so it does
          not get a cover on the shelf and cannot be paged to: an announcement,
          a hiatus note, or a con schedule lives in the archive&apos;s read and
          unread views rather than in the book. If a text post matters to the
          story, give it a piece of art and it becomes a page like any other.
        </Trans>
      </p>
      <GuideCallout title={<Trans>Page numbers are absolute</Trans>}>
        <Trans>
          The counter reads <i>Page 12 of 340</i> across the whole publication,
          not within one issue. That means inserting or removing a page in an
          early issue renumbers everything after it — worth knowing before you
          go back and edit an old post that readers may have linked to.
        </Trans>
      </GuideCallout>

      <h2 {...stylex.props(docsStyles.h2)} id="titles">
        <Trans>Naming issues and pages</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Nothing in the format has a field for “issue 3” — the only place that
          number exists is your post titles, so that is where we read it back
          out of. Title your pages the way comics have always been titled and
          consecutive pages collapse back into the issue they came from, one
          cover per issue:
        </Trans>
      </p>
      <ul {...stylex.props(docsStyles.prose)}>
        <li {...stylex.props(guideStyles.listItem)}>
          <Trans>
            <b>Fray In The Veil #2, Pg. 7</b> — series, issue, page.
          </Trans>
        </li>
        <li {...stylex.props(guideStyles.listItem)}>
          <Trans>
            <b>FITV #1 Cover</b> — the same, with a page label instead of a
            number.
          </Trans>
        </li>
      </ul>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          The one part that is required is the hash before the issue number — a
          bare number in a title is never read as an issue, because too many
          ordinary titles start with one. After the number you can use a comma,
          a colon, a dash, or nothing at all; everything following it is treated
          as the page label and is not otherwise parsed, so write it however you
          like.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Grouping is all-or-nothing per publication: at least 70% of your
          titles have to parse before we trust the numbers enough to group by
          them. If they do not — a webcomic naming its posts <i>Pg01</i>,{" "}
          <i>Pg02</i> has no issues to speak of — you still get a shelf, just
          one cover per post instead of one per issue. That is a fine way to run
          a comic; it is not a failure state.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          A single post whose title breaks the pattern does not split an issue
          in two. An interstitial in the middle of issue 3 joins issue 3, and a
          one-off announcement will not start a phantom issue of its own.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="covers">
        <Trans>Cover art</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          An issue is fronted by the page whose title says it is the cover —
          anything with the word <i>cover</i> in the page label.{" "}
          <i>Inner cover</i> is deliberately not treated as one, since it is the
          leaf behind the cover rather than the cover itself. When no page
          claims it, the issue&apos;s first page fronts it, which is what the
          reader sees on opening anyway.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Covers are drawn in a 2:3 frame — the standard trade-paperback shape —
          and art is scaled to fill it, so anything much wider or squarer gets
          cropped at the edges. If your logo or your title lettering sits near
          the very edge of a landscape cover, expect it to be trimmed on the
          shelf. The full page is untouched in the reader; this only affects the
          thumbnail.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="notes">
        <Trans>The words beside the art</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Most cartoonists write a line or two under the page — a caption, a
          process note, a word about next week. That writing is not lost in the
          theater. If a page&apos;s post carries prose, the note button in the
          top bar lights up and lays it over the art, in the theater&apos;s own
          type, with a way through to the full post. It closes when the reader
          turns the page, because it belongs to the page it was written about.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Pages with nothing written under them leave the button disabled rather
          than making it appear and vanish as the reader flips, so there is no
          penalty for a silent page.
        </Trans>
      </p>
      <GuideCallout title={<Trans>Keep the essay for its own post</Trans>}>
        <Trans>
          The prose length is also what separates a comic from an illustrated
          blog: a post carrying more than about 700 words stops counting as a
          page of comic, and if most of your posts are like that the publication
          reads as a book instead. A long process essay is better as its own
          post — which readers will find in the archive — than appended to a
          page.
        </Trans>
      </GuideCallout>

      <h2 {...stylex.props(docsStyles.h2)} id="alt-text">
        <Trans>Alt text</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Alt text on a comic page is the page, for anyone who cannot see it —
          in the theater there is no surrounding article to fall back on, so
          whatever you wrote is the whole experience. It is also what your comic
          is found by in search.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          One thing worth knowing: if a paragraph of your post body repeats a
          page&apos;s alt text word for word, we drop it from the note rather
          than showing the reader a description of the picture they are looking
          at. So transcribing your dialogue into the alt and again into the body
          does not double up.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="read-state">
        <Trans>How readers pick it back up</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Read state is per post, and your posts are pages, so an issue counts
          as unread while any page in it is — a comic read halfway through is
          not read. Its cover wears the same unread dot an unread article does,
          and clicking it opens on the first page that reader has not seen, not
          back at the cover. Walking pages in the theater marks them off behind
          them.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          In practice this means a reader who subscribes mid-run can come back
          after a month and land exactly where they stopped, which is the single
          biggest thing that keeps people reading a serial. Readers who have
          turned reading history off see no dots — nothing is tracked for them —
          and readers who are not signed in see the shelf as a stranger would.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="troubleshooting">
        <Trans>When it still reads as a blog</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          If your publication page shows a list of titles instead of a shelf,
          walk these in order:
        </Trans>
      </p>
      <ul {...stylex.props(docsStyles.prose)}>
        <li {...stylex.props(guideStyles.listItem)}>
          <Trans>
            <b>Is the forwards-reading setting saved?</b> This is the one that
            is almost always the answer. Check it in your publishing tool, and
            note that it lives on the publication, not on individual posts.
          </Trans>
        </li>
        <li {...stylex.props(guideStyles.listItem)}>
          <Trans>
            <b>Do your recent posts render their art in the body?</b> A post
            that only links to the page on your site, or that carries the
            drawing as a cover image with an empty body, has no pages to flip.
          </Trans>
        </li>
        <li {...stylex.props(guideStyles.listItem)}>
          <Trans>
            <b>Are your last 40 posts mostly art?</b> A run of text posts —
            Kickstarter updates, con reports — can tip a comic under the line
            until the art resumes.
          </Trans>
        </li>
        <li {...stylex.props(guideStyles.listItem)}>
          <Trans>
            <b>Getting a shelf but not issues?</b> Then the setting is right and
            it is the titles: check that at least 7 in 10 carry a hash and an
            issue number.
          </Trans>
        </li>
      </ul>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          If all of that is true and your comic still reads as a blog, tell us
          on the feedback board with a link to the publication — that is a bug
          on our side, and worth hearing about.
        </Trans>
      </p>
    </GuideShell>
  );
}
