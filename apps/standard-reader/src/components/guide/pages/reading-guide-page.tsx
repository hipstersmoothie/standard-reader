"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { docsStyles } from "../../docs/docs-page.stylex";
import { GuideFigure, GuideAssetFigure } from "../guide-figure";
import { guideStyles } from "../guide-page.stylex";
import { GuideCallout, UiLabel } from "../guide-primitives";
import { GuideShell } from "../guide-shell";

/**
 * The share card for a real passage, captured from `/api/og/quote`. Refresh it
 * with any share link from an article's selection toolbar:
 *   curl -o public/guide/share-card.png \
 *     "$PUBLIC_URL/api/og/quote?did=<did>&rkey=<rkey>&q=<shareId>"
 */
const SAMPLE_QUOTE_CARD_SRC = "/guide/share-card.png";

export function ReadingGuidePage() {
  const { t } = useLingui();

  return (
    <GuideShell
      area="reading"
      title={<Trans>Reading an article</Trans>}
      dek={
        <Trans>
          What every control on an article does — including having it read aloud
          to you, and making the text comfortable for your eyes.
        </Trans>
      }
    >
      <h2
        {...stylex.props(docsStyles.h2, docsStyles.h2First)}
        id="the-reading-view"
      >
        <Trans>The reading view</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Select any headline to open it. Articles are laid out as a single
          column at a comfortable width, with the publication&apos;s own colors
          and typography where it has them.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          A slim bar stays at the top as you scroll. It holds the back arrow,
          who wrote the piece, and the actions below; the thin line beneath it
          fills up as you move through the article, so you always know how much
          is left.
        </Trans>
      </p>
      <ul {...stylex.props(docsStyles.prose)}>
        <li {...stylex.props(guideStyles.listItem)}>
          <UiLabel>
            <Trans>Subscribe</Trans>
          </UiLabel>{" "}
          —{" "}
          <Trans>get this publication&apos;s new writing in your feeds.</Trans>
        </li>
        <li {...stylex.props(guideStyles.listItem)}>
          <UiLabel>
            <Trans>Save for later</Trans>
          </UiLabel>{" "}
          — <Trans>put the article in your Saved queue.</Trans>
        </li>
        <li {...stylex.props(guideStyles.listItem)}>
          <UiLabel>
            <Trans>Listen</Trans>
          </UiLabel>{" "}
          — <Trans>have the article read aloud.</Trans>
        </li>
        <li {...stylex.props(guideStyles.listItem)}>
          <UiLabel>
            <Trans>Share</Trans>
          </UiLabel>{" "}
          —{" "}
          <Trans>
            copy a link, or post the article to Bluesky with a preview card.
          </Trans>
        </li>
      </ul>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          At the end of the article you can <UiLabel>Recommend</UiLabel> it, see
          more from the same publication, and find related reading from
          elsewhere on the network.
        </Trans>
      </p>

      <GuideFigure
        shot="article"
        alt={t`An article open in Standard Reader: a headline, byline, and body text in a single centered column, with a slim bar of actions pinned to the top of the window.`}
        caption={
          <Trans>
            One column, the publication&apos;s own type, and a progress line
            under the top bar.
          </Trans>
        }
      />

      <h2 {...stylex.props(docsStyles.h2)} id="listen">
        <Trans>Listening to an article</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Select <UiLabel>Listen</UiLabel> in the top bar and the article is
          read aloud. The first time takes a few seconds to warm up; after that
          it starts straight away.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          A player appears just above the navigation and stays there while you
          move around the app, so you can keep listening while you browse. It
          has play and pause, a jump back fifteen seconds, a speed control, a
          bar you can drag to move through the article, and a close button. The
          word being spoken is highlighted in the text and kept on screen; if
          you scroll away yourself, that stops until you select{" "}
          <UiLabel>Follow along</UiLabel>.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          To start from a particular paragraph instead of the beginning, select
          the text and choose <UiLabel>Read from here</UiLabel>.
        </Trans>
      </p>
      <GuideCallout title={<Trans>Good to know</Trans>}>
        <Trans>
          The voice is generated on your own device, not on a server — nothing
          about what you listen to is sent anywhere. That also means the first
          use downloads the voice, so it is worth doing on a good connection. If
          you would rather choose the voice than have one picked to suit the
          author, that setting lives in your account menu.
        </Trans>
      </GuideCallout>

      <h2 {...stylex.props(docsStyles.h2)} id="comfort">
        <Trans>Making the text comfortable</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Text size, line width, and the font used for article bodies are all
          adjustable — serif, sans-serif, or any font from the Google Fonts
          catalog. The controls are in your account menu and on the{" "}
          <Link to="/settings" {...stylex.props(docsStyles.proseLink)}>
            settings page
          </Link>
          , and they apply to every article from then on.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          These are separate from the app-wide appearance settings, which is
          deliberate: you can have compact, small interface text and large,
          wide-set article text at the same time.{" "}
          <Link
            to="/guide/personalizing"
            {...stylex.props(docsStyles.proseLink)}
          >
            Making it yours
          </Link>{" "}
          covers the rest.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="images">
        <Trans>Images and links</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Select any image in an article to open it full size. If the article
          has a gallery, arrows move between its images, and any description the
          author wrote is shown alongside. Press <UiLabel>Escape</UiLabel> or
          select outside the image to close it.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Links inside an article go where the author pointed them. When a link
          leads to another article that Standard Reader knows about, it opens
          here rather than sending you out to the web.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="read-state">
        <Trans>Read and unread</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Opening an article marks it read, which is how Home and Latest know
          what is still waiting for you. You can flip it back with{" "}
          <UiLabel>Mark as unread</UiLabel>, and clear a whole publication at
          once with <UiLabel>Mark all as read</UiLabel> from its menu.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          If you would rather the app did not keep a history of what you have
          opened, you can turn that off in settings. Unread counts stop being
          meaningful when you do — that is the trade.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="sharing">
        <Trans>Sharing an article</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          <UiLabel>Share</UiLabel> copies a link, or posts the article to
          Bluesky with a proper preview card. On a phone it can hand off to
          whatever you normally share with.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Links you share work for anyone, signed in or not — they open the
          article in the reader, and nobody is asked to make an account to read
          it.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="sharing-a-passage">
        <Trans>Sharing a passage</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Sharing a whole article is a blunt instrument when what struck you was
          one paragraph. Select any text in an article and a small toolbar
          appears over the selection.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          <UiLabel>Share</UiLabel> there gives you a link to <b>that passage</b>
          . Whoever opens it lands on the article with your words highlighted,
          exactly where you left off — so the point you were making is the first
          thing they see, not something they have to hunt for.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          The same toolbar can start the narration from that paragraph with{" "}
          <UiLabel>Read from here</UiLabel>, and — if you use them — save the
          passage to <UiLabel>Margin</UiLabel> or <UiLabel>Semble</UiLabel> as
          an annotation.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Paste that link anywhere that unfurls a preview — Bluesky, a chat, a
          document — and the passage itself is the preview:
        </Trans>
      </p>
      <GuideAssetFigure
        src={SAMPLE_QUOTE_CARD_SRC}
        width={1200}
        height={630}
        alt={t`A share preview card: a large quotation mark above the shared passage set in italic serif, with the publication's icon, name, handle, and description along the bottom.`}
        caption={
          <Trans>
            The card is generated from the passage you picked, so what people
            see first is the sentence you wanted them to read.
          </Trans>
        }
      />

      <h2 {...stylex.props(docsStyles.h2)} id="conversation">
        <Trans>Comments and related reading</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Standard Reader has no comment box of its own. Instead, below each
          article it gathers the conversation that already happened elsewhere:
          Bluesky posts linking to the piece, replies to the author&apos;s own
          announcement, and notes people made on it in annotation tools. Select
          any of them to reply where the conversation actually is.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Under that, <UiLabel>Cited in</UiLabel> lists other articles that link
          to this one, and <UiLabel>Related reading</UiLabel> suggests pieces
          from across the network on the same subjects — usually from
          publications you have not met yet.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="original-site">
        <Trans>Opening the original site instead</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Some people would rather read on the publication&apos;s own site, with
          its own design. Turn on the open-on-the-original-site setting in your
          account menu and every article link opens there in a new tab instead
          of in the reader. Articles that have no site of their own still open
          here.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          For a single article, the top bar&apos;s menu has{" "}
          <UiLabel>Open on publication</UiLabel> without changing the setting.
        </Trans>
      </p>
    </GuideShell>
  );
}
