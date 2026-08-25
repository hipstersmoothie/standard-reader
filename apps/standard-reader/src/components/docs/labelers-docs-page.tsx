"use client";

import { Trans } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";

import {
  LABELERS_DOCS_IDS,
  LABELERS_DOCS_SCROLL_SPY_IDS,
  labelersDocsJumpNavGroups,
} from "#/lib/labelers-docs/navigation";

import { DocsLabelersNav } from "./docs-labelers-nav";
import { DocsMobileNav } from "./docs-mobile-nav";
import { docsStyles } from "./docs-page.stylex";
import { DocsRefShell } from "./docs-ref-shell";
import { DocsSideNav } from "./docs-side-nav";

export function LabelersDocsPage() {
  return (
    <DocsRefShell
      scrollSpyIds={LABELERS_DOCS_SCROLL_SPY_IDS}
      nav={<DocsSideNav area="labelers" />}
      toc={<DocsLabelersNav />}
      mobileJumpNav={
        <DocsMobileNav
          area="labelers"
          groups={labelersDocsJumpNavGroups()}
          selectId="docs-labelers-jump-nav"
          fallbackId={LABELERS_DOCS_SCROLL_SPY_IDS[0] ?? ""}
        />
      }
    >
      <div {...stylex.props(docsStyles.masthead)}>
        <div {...stylex.props(docsStyles.kicker)}>
          <Trans>Developer docs</Trans>
        </div>
        <h1 {...stylex.props(docsStyles.title)}>
          <Trans>Labelers</Trans>
        </h1>
        <p {...stylex.props(docsStyles.dek)}>
          <Trans>
            Publish AT Protocol labels that Standard Reader shows — and can warn
            on or hide by — as readers read.
          </Trans>
        </p>
      </div>

      <div {...stylex.props(docsStyles.introProse)}>
        <h2
          id={LABELERS_DOCS_IDS.overview}
          {...stylex.props(docsStyles.h2, docsStyles.h2First)}
        >
          <Trans>Overview</Trans>
        </h2>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            A labeler is any DID that publishes AT Proto labels. Readers add one
            by DID on the{" "}
            <a href="/labelers" {...stylex.props(docsStyles.proseLink)}>
              Labelers
            </a>{" "}
            page, and Standard Reader then shows that labeler&apos;s labels —
            and can warn on or hide labeled posts — as they read. Labelers are
            discovered the standard way; nothing about them is specific to us.
          </Trans>
        </p>

        <h2 id={LABELERS_DOCS_IDS.running} {...stylex.props(docsStyles.h2)}>
          <Trans>Running a labeler</Trans>
        </h2>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            <strong>1. Identity &amp; signing key.</strong> Give it a DID (a{" "}
            <code {...stylex.props(docsStyles.codeInline)}>did:web</code> is
            simplest) whose DID document advertises an{" "}
            <code {...stylex.props(docsStyles.codeInline)}>
              #atproto_labeler
            </code>{" "}
            service endpoint and an{" "}
            <code {...stylex.props(docsStyles.codeInline)}>#atproto_label</code>{" "}
            public signing key.
          </Trans>
        </p>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            <strong>2. Serve labels.</strong> Sign and emit{" "}
            <code {...stylex.props(docsStyles.codeInline)}>
              com.atproto.label.defs#label
            </code>{" "}
            objects, and expose the standard{" "}
            <code {...stylex.props(docsStyles.codeInline)}>
              com.atproto.label.queryLabels
            </code>{" "}
            (HTTP) and{" "}
            <code {...stylex.props(docsStyles.codeInline)}>
              com.atproto.label.subscribeLabels
            </code>{" "}
            (WebSocket) endpoints.
          </Trans>
        </p>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            <strong>3. Declare your label values.</strong> Publish an{" "}
            <code {...stylex.props(docsStyles.codeInline)}>
              app.bsky.labeler.service
            </code>{" "}
            record in your repo describing each value — severity, default
            warn/hide, blur behavior — and advertise{" "}
            <code {...stylex.props(docsStyles.codeInline)}>
              #atproto_labeler
            </code>{" "}
            in your DID document. That is the standard AT Protocol declaration,
            documented in the{" "}
            <a
              href="https://atproto.com/specs/label"
              rel="noreferrer"
              target="_blank"
              {...stylex.props(docsStyles.proseLink)}
            >
              labels specification
            </a>
            ; there is nothing Standard Reader specific to do.
          </Trans>
        </p>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            We used to also accept a labeler registered by a Standard
            Reader&#8209;specific descriptor record. That is gone. It existed
            only so a{" "}
            <code {...stylex.props(docsStyles.codeInline)}>did:web</code>{" "}
            labeler — which has no repo, and so cannot publish the standard
            declaration — could join the directory. If you already run a labeler
            for the wider network it works here unchanged, which was always the
            point: a labeler can label any content on the network, so there is
            no reason for this app to invent its own way of describing one.
          </Trans>
        </p>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            Labels may apply to a document&apos;s{" "}
            <code {...stylex.props(docsStyles.codeInline)}>at://</code> URI or
            to an account DID. Account labels are shown on that account&apos;s
            author and publication pages and on every document it published, so
            a label about a publisher does not need to be re-emitted per post.
          </Trans>
        </p>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            <strong>4. Let readers subscribe.</strong> When a reader subscribes
            we write an{" "}
            <a
              href="/docs/lexicons#lex-labeler.subscription"
              {...stylex.props(docsStyles.proseLink)}
            >
              app.standard-reader.labeler.subscription
            </a>{" "}
            record to their repo, carrying their per-label warn/hide
            preferences.
          </Trans>
        </p>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            That record also carries an{" "}
            <code {...stylex.props(docsStyles.codeInline)}>enabled</code> flag.
            A reader can mute your labeler here — keeping the subscription and
            their per-label settings, but not applying your labels while they
            read — without unsubscribing, which is useful when they follow a
            labeler on another app that they don’t want acting on long-form
            reading. Its absence means enabled.
          </Trans>
        </p>

        <h2 id={LABELERS_DOCS_IDS.reference} {...stylex.props(docsStyles.h2)}>
          <Trans>Further reading</Trans>
        </h2>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            Labelers are an AT Protocol concept, not a Standard Reader one, so
            the protocol documentation is the reference:{" "}
            <a
              href="https://atproto.com/specs/label"
              rel="noreferrer"
              target="_blank"
              {...stylex.props(docsStyles.proseLink)}
            >
              labels
            </a>{" "}
            covers the label object, its signature and the{" "}
            <code {...stylex.props(docsStyles.codeInline)}>queryLabels</code> /{" "}
            <code {...stylex.props(docsStyles.codeInline)}>
              subscribeLabels
            </code>{" "}
            endpoints, and{" "}
            <a
              href="https://atproto.com/specs/moderation"
              rel="noreferrer"
              target="_blank"
              {...stylex.props(docsStyles.proseLink)}
            >
              moderation
            </a>{" "}
            covers how labels are meant to be applied. Anything that satisfies
            those works here.
          </Trans>
        </p>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            Standard Reader no longer ships labelers of its own. Running one
            taught us nothing the network doesn&apos;t already provide, and for
            the one signal we did use — an account declaring itself a bot — the
            answer was already in its profile record, so we read it there
            instead of asking a labeler to repeat it.
          </Trans>
        </p>
      </div>
    </DocsRefShell>
  );
}
