"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { getPublicUrlClient } from "#/lib/public-url";

import { docsStyles } from "../../docs/docs-page.stylex";
import { GuideEmbedSample } from "../guide-embed-sample";
import { GUIDE_EMBED_SAMPLE } from "../guide-embed-sample.constants";
import { GuideCallout, GuideSteps, UiLabel } from "../guide-primitives";
import { GuideShell } from "../guide-shell";

/**
 * The two embeddable cards — subscribe (a publication) and follow (an account)
 * — on one page.
 *
 * They used to be a section under "Publishing your site", which was the wrong
 * home for both: you need no records of your own to paste one, and the follow
 * card is about a person rather than a site. What they actually share is the
 * awkward part — the button has to open Standard Reader rather than act in
 * place, because the record it writes goes to the *visitor's* repo with the
 * visitor's own OAuth session. That's the thing this page exists to explain.
 */
export function EmbedsGuidePage() {
  const { t } = useLingui();
  const origin = getPublicUrlClient();
  const publicationName = GUIDE_EMBED_SAMPLE.name;

  return (
    <GuideShell
      area="embeds"
      title={<Trans>Embed buttons</Trans>}
      dek={
        <Trans>
          A subscribe button for a publication, or a follow button for you —
          dropped onto your own site as a small card, so a reader who found you
          there can start following you without going looking for you somewhere
          else.
        </Trans>
      }
    >
      <h2
        {...stylex.props(docsStyles.h2, docsStyles.h2First)}
        id="what-you-get"
      >
        <Trans>What you get</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Two cards, and a plain link if you would rather style your own button.
          Both are generated from a page you can already see — there is no
          account to make, no key to get, and no ownership check. Anyone can
          build the snippet for any publication; it is a link with a nice
          picture on it.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          The card is an{" "}
          <code {...stylex.props(docsStyles.codeInline)}>iframe</code> plus a
          few lines of script. The script listens for the card&apos;s own height
          and resizes the frame to match, so a long publication name or a
          two-line bio does not end up scrolling inside a box. Paste both parts.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="subscribe-embed">
        <Trans>A subscribe button for a publication</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Open the publication&apos;s page on Standard Reader and use{" "}
          <UiLabel>Share → Embed subscribe</UiLabel>. Pick a layout, copy the
          snippet, paste it where you want the card.
        </Trans>
      </p>
      <GuideEmbedSample
        src={`${origin}/embed/subscribe/${GUIDE_EMBED_SAMPLE.did}/${GUIDE_EMBED_SAMPLE.rkey}?layout=portrait`}
        title={t`Subscribe to ${publicationName}`}
        initialHeight={322}
      />

      <h2 {...stylex.props(docsStyles.h2)} id="follow-embed">
        <Trans>A follow button for you</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          The same card exists for a person. Open your own profile and use the
          menu beside <UiLabel>Follow</UiLabel> →{" "}
          <UiLabel>Embed follow</UiLabel>.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Reach for this one when a publication is the wrong unit: your writing
          is spread across several of them, you post under your own name rather
          than a masthead, or the site you are putting the card on is a personal
          homepage rather than one publication&apos;s. Following you also picks
          up everything you publish, so a reader who follows the person does not
          have to keep track of which masthead a piece landed under.
        </Trans>
      </p>
      <GuideEmbedSample
        src={`${origin}/embed/follow/${GUIDE_EMBED_SAMPLE.did}?layout=portrait`}
        title={t`Follow the author of ${publicationName}`}
        initialHeight={304}
      />

      <h2 {...stylex.props(docsStyles.h2)} id="layouts">
        <Trans>Landscape, portrait, or a plain link</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Both dialogs offer the same three, and you can switch between them
          before copying — the preview above the snippet is the real card, not a
          mockup.
        </Trans>
      </p>
      <GuideSteps>
        <Trans>
          <b>Landscape</b> is a compact row: avatar, name, button. It suits a
          sidebar, a footer, or the end of a post — anywhere you want a line
          rather than a block. The description is dropped at this size.
        </Trans>
        <Trans>
          <b>Portrait</b> stacks everything and keeps the description. Better as
          a standalone call to action, or in a narrow column.
        </Trans>
        <Trans>
          <b>Link</b> is not a card at all — just an anchor to the same
          destination, unstyled, for when you would rather it match your own
          buttons. No iframe and no script.
        </Trans>
      </GuideSteps>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          The snippet fixes the card at 400px wide, which is the width the
          preview shows. Change the{" "}
          <code {...stylex.props(docsStyles.codeInline)}>width</code> on the
          wrapper and the frame follows; the height keeps managing itself.
        </Trans>
      </p>
      <GuideCallout title={<Trans>If you drop the script</Trans>}>
        <Trans>
          The height in the pasted markup is only a first guess, corrected the
          moment the card loads. Keep the{" "}
          <code {...stylex.props(docsStyles.codeInline)}>script</code> tag and
          you never think about it. Remove it — some site builders will not let
          you paste one — and you should set a height yourself with room to
          spare, because nothing will resize the frame afterwards.
        </Trans>
      </GuideCallout>

      <h2 {...stylex.props(docsStyles.h2)} id="styling">
        <Trans>What the card takes from your brand</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          A subscribe card reads the publication&apos;s own{" "}
          <code {...stylex.props(docsStyles.codeInline)}>basicTheme</code>{" "}
          colors, so it matches whatever you set on the publication with no
          extra parameters. An account has no theme record anywhere on the
          network — there is nowhere to put one — so a follow card always paints
          in Standard Reader&apos;s default palette.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Neither card picks up fonts. Both use Standard Reader&apos;s own type,
          on purpose: a card that half-matches your site reads worse than one
          that plainly does not, and web fonts inside an iframe are a load cost
          your visitors pay for a button. If the type matters more than the
          card, take the <b>Link</b> tab and style it yourself.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="what-happens">
        <Trans>What happens when someone clicks it</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          The button opens Standard Reader in a new tab rather than doing
          something in place, and that is not a shortcut we took. Subscribing
          writes a record to <i>the visitor&apos;s</i> own repo, signed by their
          own account — so it has to happen somewhere they are signed in, which
          is our domain, not yours. Your page never sees who they are.
        </Trans>
      </p>
      <GuideSteps>
        <Trans>
          <b>Signed in already?</b> The follow is written immediately and they
          land on a short confirmation. Two clicks total.
        </Trans>
        <Trans>
          <b>Signed out?</b> They get a stripped-down sign-in naming what they
          are about to follow — your avatar, your name, nothing else of ours. It
          asks for the narrowest permission that covers the follow, not a full
          account sign-in, so someone who only wants to follow you is not
          handing over the rest.
        </Trans>
        <Trans>
          <b>Already following, or looking at their own card?</b> They are told
          so and nothing is written twice.
        </Trans>
      </GuideSteps>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          A subscribe writes a{" "}
          <code {...stylex.props(docsStyles.codeInline)}>
            site.standard.graph.subscription
          </code>
          . A follow writes an{" "}
          <code {...stylex.props(docsStyles.codeInline)}>
            app.standard-reader.graph.follow
          </code>{" "}
          and, behind it, subscriptions to the publications you own — so the
          people who followed you from your own site stay yours if you ever
          leave Standard Reader. Both live in the reader&apos;s repo, not in a
          list we keep.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          If you want to skip the card entirely, link straight to{" "}
          <code {...stylex.props(docsStyles.codeInline)}>
            /subscribe/{"{did}"}/{"{rkey}"}
          </code>{" "}
          or{" "}
          <code {...stylex.props(docsStyles.codeInline)}>
            /follow/{"{did}"}
          </code>{" "}
          and style your own button — that is all the <b>Link</b> tab hands you.
          The follow link takes your handle in place of the DID, though the DID
          is the one that survives a handle change.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="troubleshooting">
        <Trans>When the card does not show up</Trans>
      </h2>
      <GuideSteps>
        <Trans>
          <b>A blank space where the card should be.</b> Almost always the host
          page&apos;s own content security policy refusing to frame another
          origin. Your site needs to allow{" "}
          <code {...stylex.props(docsStyles.codeInline)}>{origin}</code> as a
          frame source; the browser console will say so outright.
        </Trans>
        <Trans>
          <b>The card is there but clipped, or has its own scrollbar.</b> The
          resize script did not make it into the page — some editors strip{" "}
          <code {...stylex.props(docsStyles.codeInline)}>script</code> tags
          silently. Either paste it somewhere that keeps it, or set a generous
          fixed height.
        </Trans>
        <Trans>
          <b>The name or avatar is out of date.</b> The card reads your profile
          when it loads, so it catches up on its own — but a browser that
          already has the frame cached may need a reload to notice.
        </Trans>
      </GuideSteps>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Wiring your own site&apos;s records so its posts show up here at all
          is a different job —{" "}
          <Link to="/guide/publishing" {...stylex.props(docsStyles.proseLink)}>
            Publishing your site
          </Link>{" "}
          covers that, and you do not need any of it to use a button on this
          page.
        </Trans>
      </p>
    </GuideShell>
  );
}
