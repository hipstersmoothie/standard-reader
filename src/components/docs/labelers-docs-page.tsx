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
            <strong>3. Declare your label values.</strong> Describe each value
            (severity, default warn/hide, blur behavior) in an{" "}
            <a
              href="/docs/lexicons#lex-service"
              {...stylex.props(docsStyles.proseLink)}
            >
              app.standard-reader.labeler.service
            </a>{" "}
            descriptor, served from{" "}
            <code {...stylex.props(docsStyles.codeInline)}>
              app.standard-reader.labeler.getServices
            </code>{" "}
            (a <code {...stylex.props(docsStyles.codeInline)}>did:web</code>{" "}
            labeler has no repo to hold the record).
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

        <h2 id={LABELERS_DOCS_IDS.reference} {...stylex.props(docsStyles.h2)}>
          <Trans>Reference implementation</Trans>
        </h2>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            For a complete, minimal reference implementation (Jetstream → detect
            → sign → SQLite → serve), see the{" "}
            <code {...stylex.props(docsStyles.codeInline)}>claudeslop</code>{" "}
            labeler in{" "}
            <code {...stylex.props(docsStyles.codeInline)}>
              services/claudeslop
            </code>
            .
          </Trans>
        </p>
      </div>
    </DocsRefShell>
  );
}
