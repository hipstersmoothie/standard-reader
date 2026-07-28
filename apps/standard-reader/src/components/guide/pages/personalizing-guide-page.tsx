"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { docsStyles } from "../../docs/docs-page.stylex";
import { GuideFigure } from "../guide-figure";
import { guideStyles } from "../guide-page.stylex";
import { GuideCallout, UiLabel } from "../guide-primitives";
import { GuideShell } from "../guide-shell";

export function PersonalizingGuidePage() {
  const { t } = useLingui();

  return (
    <GuideShell
      area="personalizing"
      title={<Trans>Making it yours</Trans>}
      dek={
        <Trans>
          Colors, type, spacing, how feeds behave, and what arrives by email.
          Nearly all of it lives on one settings page.
        </Trans>
      }
    >
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Everything on this page is under{" "}
          <Link to="/settings" {...stylex.props(docsStyles.proseLink)}>
            Settings
          </Link>
          , in your account menu at the bottom of the sidebar. The most-used
          controls are also in that menu directly, so you can change them
          without leaving what you are reading.
        </Trans>
      </p>
      <GuideFigure
        shot="settings"
        alt={t`The settings page, showing sections for Appearance, Behavior, Feed, Sidebar, Weekly digest, Reading, Moderation, Connected apps, and Personal data.`}
      />

      <h2 {...stylex.props(docsStyles.h2)} id="theme">
        <Trans>Light, dark, and custom colors</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          <UiLabel>Theme</UiLabel> offers light, dark, match-your-system, or{" "}
          <UiLabel>Custom</UiLabel>. Custom opens a set of eight hand-made
          palettes — four light, four dark — plus the option to name your own
          two colors: the paper the app is printed on and the accent used for
          links and buttons.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Everything else is worked out from those two. A palette decides for
          itself whether it is light or dark, so a custom theme stops following
          your system. If the accent you pick would be hard to read against your
          paper, the picker says so rather than quietly changing it — the color
          you chose is the color you get.
        </Trans>
      </p>
      <GuideFigure
        shot="settings-appearance"
        alt={t`The custom palette picker: a row of eight preset color palettes, each shown as a tile of its paper and accent colors, with controls beneath for choosing your own two colors.`}
        caption={
          <Trans>
            Eight presets, or your own paper and accent. The rest of the
            interface is derived from them.
          </Trans>
        }
      />

      <h2 {...stylex.props(docsStyles.h2)} id="type-and-density">
        <Trans>Type size, shape, and density</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Four more dials sit under Appearance, and they apply in every theme —
          they are not color:
        </Trans>
      </p>
      <ul {...stylex.props(docsStyles.prose)}>
        <li {...stylex.props(guideStyles.listItem)}>
          <UiLabel>
            <Trans>Interface font</Trans>
          </UiLabel>{" "}
          —{" "}
          <Trans>
            editorial, plain sans-serif, or any family from Google Fonts.
          </Trans>
        </li>
        <li {...stylex.props(guideStyles.listItem)}>
          <UiLabel>
            <Trans>Text size</Trans>
          </UiLabel>{" "}
          —{" "}
          <Trans>
            five steps. This scales the whole app, not just the type: buttons,
            spacing, and panels grow with it.
          </Trans>
        </li>
        <li {...stylex.props(guideStyles.listItem)}>
          <UiLabel>
            <Trans>Roundness</Trans>
          </UiLabel>{" "}
          — <Trans>how rounded corners are, from sharp to soft.</Trans>
        </li>
        <li {...stylex.props(guideStyles.listItem)}>
          <UiLabel>
            <Trans>Density</Trans>
          </UiLabel>{" "}
          —{" "}
          <Trans>
            compact, default, or relaxed. This changes the space between things,
            never the size of the controls themselves.
          </Trans>
        </li>
      </ul>

      <h2 {...stylex.props(docsStyles.h2)} id="reading-preferences">
        <Trans>Reading preferences</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          The <UiLabel>Reading</UiLabel> section governs article bodies only, on
          top of whatever the app-wide settings are:{" "}
          <UiLabel>Text size</UiLabel>, <UiLabel>Column width</UiLabel> — how
          many words fit on a line — and <UiLabel>Body font</UiLabel>, which
          takes a serif, a sans-serif, or any Google Fonts family you search
          for.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          <UiLabel>Listen aloud voice</UiLabel> is here too. Left on{" "}
          <UiLabel>Auto</UiLabel>, a voice is chosen to suit each author;
          otherwise pick one and it is used for everything.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Under <UiLabel>Behavior</UiLabel>: whether articles open on their
          original website instead of in the reader, whether collections open as
          magazine editions, whether your reading history is recorded, and
          whether a publication&apos;s whole back catalogue counts as unread the
          moment you follow it.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="publication-themes">
        <Trans>Letting publications use their own colors</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          <UiLabel>Use publication themes</UiLabel> lets each publication paint
          its own page and articles in its own colors and fonts, the way its
          website looks. The sidebar and navigation stay in your theme, so you
          never lose your bearings, and publications that have not chosen any
          colors keep the standard look.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="feed-preferences">
        <Trans>Feed preferences</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          <UiLabel>Hide recommend and comment counts</UiLabel> removes the
          numbers from article cards, lists, and bylines. You can still
          recommend an article — only the tallies go away. If counts make you
          read differently, this is worth trying.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          <UiLabel>Loading more</UiLabel> chooses between infinite scroll and a{" "}
          <UiLabel>Load more</UiLabel> button that waits until you ask.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Under <UiLabel>Sidebar</UiLabel>, you can hide destinations you never
          use. Subscriptions and your own lists always stay.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="digest">
        <Trans>The weekly digest</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Turn on <UiLabel>Weekly digest email</UiLabel> and once a week you get
          a summary of what the publications you follow have published, with a
          preview shown on the settings page before you commit. It is off unless
          you ask for it, and one setting turns it off again.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="moderation">
        <Trans>Moderation and labels</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Standard Reader shows content from across an open network, so
          moderation is something you choose rather than something we decide for
          everyone. <UiLabel>Labelers</UiLabel> are independent services that
          mark content — spam, adult material, whatever they specialise in — and
          you subscribe to the ones whose judgement you trust.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Select <UiLabel>Browse labelers</UiLabel> to see what is available.
          Once subscribed, their labels appear as you read and can warn you,
          blur the content, or hide it entirely. Labelers you already follow on
          Bluesky carry over.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="language">
        <Trans>Language</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          <UiLabel>Language</UiLabel> at the top of Appearance changes the
          interface — menus, labels, and buttons. Articles are always shown in
          the language they were written in; nothing is translated.
        </Trans>
      </p>
      <GuideCallout title={<Trans>Signed out?</Trans>}>
        <Trans>
          Theme and language work without an account — they are remembered in
          your browser rather than in your account, so they do not follow you to
          another device.
        </Trans>
      </GuideCallout>
    </GuideShell>
  );
}
