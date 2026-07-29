"use client";

import { Trans } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { docsStyles } from "../../docs/docs-page.stylex";
import { GuideCallout, GuideSteps, UiLabel } from "../guide-primitives";
import { GuideShell } from "../guide-shell";

export function ListsGuidePage() {
  return (
    <GuideShell
      area="lists"
      title={<Trans>Lists and your sidebar</Trans>}
      dek={
        <Trans>
          Once you subscribe to more than a handful of publications, one long
          list stops helping. Lists group them, and the sidebar can be arranged
          around how you actually read.
        </Trans>
      }
    >
      <h2
        {...stylex.props(docsStyles.h2, docsStyles.h2First)}
        id="what-a-list-is"
      >
        <Trans>What a list is</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          A list is a folder for the publications and people you subscribe to —{" "}
          <b>Work</b>, <b>Fiction</b>, <b>Read on Sunday</b>, whatever is useful
          to you. It has a name, an optional description, and members.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Being in a list does not change your feeds. Everything you subscribe
          to still arrives on Home and in Latest exactly as before; a list only
          changes how the sidebar is organised, and gives you a page you can
          read — or share — on its own.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          A publication can be in as many lists as you like, or none. Lists are
          also <b>public</b>: each one has its own page and its own feed, and{" "}
          <b>other people can follow it</b>. Following a list subscribes someone
          to everything in it at once — so a good list is a way to hand a whole
          reading habit to somebody, and it keeps working as you add to it.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="making-one">
        <Trans>Making a list</Trans>
      </h2>
      <GuideSteps>
        <Trans>
          Select <UiLabel>New list</UiLabel> from the sidebar&apos;s
          Subscriptions controls.
        </Trans>
        <Trans>
          Give it a name. The description is optional and appears on the
          list&apos;s public page.
        </Trans>
        <Trans>
          Add publications or people, then <UiLabel>Create list</UiLabel>.
        </Trans>
      </GuideSteps>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          You can edit or delete a list later from the same place —{" "}
          <UiLabel>Edit list</UiLabel> reopens the same dialog, and deleting a
          list never unfollows anything inside it.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="adding">
        <Trans>Adding and removing publications</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Anywhere you see a publication, its menu has{" "}
          <UiLabel>Add to list</UiLabel>. That dialog also creates a new list on
          the spot, so you do not have to plan your groups in advance.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          To move several at once, open{" "}
          <Link
            to="/guide/keeping-track"
            {...stylex.props(docsStyles.proseLink)}
          >
            Subscriptions
          </Link>
          , select the rows you want, and add them all to a list in one action.
          That is much faster than doing it publication by publication.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="sidebar-groups">
        <Trans>Lists in the sidebar</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Each list becomes its own group under Subscriptions, with the number
          of unread articles beside it. Anything you subscribe to that is not in
          a list stays in the ungrouped section below.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Groups collapse and expand, so you can keep the sidebar short and open
          only what you are reading today. <UiLabel>Collapse all lists</UiLabel>{" "}
          and <UiLabel>Expand all lists</UiLabel> do it in one go.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="arranging">
        <Trans>Arranging the sidebar</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          <UiLabel>Reorder subscriptions…</UiLabel> lets you drag your lists
          into the order you want, so the ones you read most sit at the top.
          Select <UiLabel>Finish reordering</UiLabel> when you are done.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Which destinations appear at all is a separate setting —{" "}
          <UiLabel>Customize sidebar</UiLabel> under{" "}
          <Link
            to="/guide/personalizing"
            {...stylex.props(docsStyles.proseLink)}
          >
            Making it yours
          </Link>{" "}
          hides the ones you never use. Subscriptions and your lists always
          stay.
        </Trans>
      </p>
      <GuideCallout title={<Trans>It follows you</Trans>}>
        <Trans>
          Your lists, their order, and which ones are collapsed are stored in
          your account rather than in this browser, so the sidebar looks the
          same on your laptop and your phone.
        </Trans>
      </GuideCallout>
    </GuideShell>
  );
}
