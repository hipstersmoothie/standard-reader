"use client";

import { Trans } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import {
  INTRODUCTION_DOCS_IDS,
  INTRODUCTION_DOCS_SCROLL_SPY_IDS,
  introductionDocsJumpNavGroups,
} from "#/lib/introduction-docs/navigation";

import { DocsIntroductionNav } from "./docs-introduction-nav";
import { DocsMobileNav } from "./docs-mobile-nav";
import { docsStyles } from "./docs-page.stylex";
import { DocsRefShell } from "./docs-ref-shell";
import { DocsSideNav } from "./docs-side-nav";

export function IntroductionDocsPage() {
  return (
    <DocsRefShell
      scrollSpyIds={INTRODUCTION_DOCS_SCROLL_SPY_IDS}
      nav={<DocsSideNav area="introduction" />}
      toc={<DocsIntroductionNav />}
      mobileJumpNav={
        <DocsMobileNav
          area="introduction"
          groups={introductionDocsJumpNavGroups()}
          selectId="docs-introduction-jump-nav"
          fallbackId={INTRODUCTION_DOCS_SCROLL_SPY_IDS[0] ?? ""}
        />
      }
    >
      <div {...stylex.props(docsStyles.masthead)}>
        <div {...stylex.props(docsStyles.kicker)}>
          <Trans>Developer docs</Trans>
        </div>
        <h1 {...stylex.props(docsStyles.title)}>
          <Trans>Build on Standard</Trans>
        </h1>
        <p {...stylex.props(docsStyles.dek)}>
          <Trans>
            Standard is an open reading network built on the AT Protocol.
            Publications live as records in their author&apos;s repository, and
            anyone can read, index, or render them. These docs cover the
            surfaces you build against.
          </Trans>
        </p>
      </div>

      <div {...stylex.props(docsStyles.introProse)}>
        <h2
          {...stylex.props(docsStyles.h2, docsStyles.h2First)}
          id={INTRODUCTION_DOCS_IDS.overview}
        >
          <Trans>Overview</Trans>
        </h2>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            A publication on Standard is a{" "}
            <code {...stylex.props(docsStyles.codeInline)}>
              site.standard.document
            </code>{" "}
            record in the author&apos;s AT Protocol repository — not a row in a
            database we own. Standard Reader indexes those records into a public
            read-model and renders them, but nothing about the format is
            proprietary: the schemas are open, the content is portable across
            publishing platforms, and the same renderer we ship is available to
            you.
          </Trans>
        </p>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            That means you can build in whichever direction you need — read the
            indexed network through the API, render documents inside your own
            app, model your own records against the lexicons, or make your
            existing site discoverable and readable on Standard.
          </Trans>
        </p>

        <h2 {...stylex.props(docsStyles.h2)} id={INTRODUCTION_DOCS_IDS.areas}>
          <Trans>What&apos;s in these docs</Trans>
        </h2>
        <ul {...stylex.props(docsStyles.prose)}>
          <li>
            <Link to="/docs/api" {...stylex.props(docsStyles.proseLink)}>
              <Trans>API</Trans>
            </Link>{" "}
            —{" "}
            <Trans>
              public XRPC queries and procedures for the Standard Reader
              read-model, with live examples.
            </Trans>
          </li>
          <li>
            <Link to="/docs/labelers" {...stylex.props(docsStyles.proseLink)}>
              <Trans>Labelers</Trans>
            </Link>{" "}
            —{" "}
            <Trans>
              publish AT Protocol labels Standard Reader shows — and can warn on
              or hide by — as readers read.
            </Trans>
          </li>
          <li>
            <Link to="/docs/renderers" {...stylex.props(docsStyles.proseLink)}>
              <Trans>Renderers</Trans>
            </Link>{" "}
            —{" "}
            <Trans>
              headless, unstyled packages that turn a document into your own
              components, in React, Vue, Solid, Svelte, Lit, or Angular.
            </Trans>
          </li>
          <li>
            <Link to="/docs/lexicons" {...stylex.props(docsStyles.proseLink)}>
              <Trans>Lexicons</Trans>
            </Link>{" "}
            —{" "}
            <Trans>
              the AT Protocol schemas that define Standard records and the
              shared definitions they build on.
            </Trans>
          </li>
          <li>
            <Link to="/docs/publishing" {...stylex.props(docsStyles.proseLink)}>
              <Trans>Publishing</Trans>
            </Link>{" "}
            —{" "}
            <Trans>
              how to make a site discoverable on Standard and have its content
              read inline, without adopting a platform.
            </Trans>
          </li>
        </ul>

        <h2
          {...stylex.props(docsStyles.h2)}
          id={INTRODUCTION_DOCS_IDS.conventions}
        >
          <Trans>Conventions</Trans>
        </h2>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            These docs assume working familiarity with the AT Protocol —
            repositories, records, DIDs, NSIDs, and XRPC. Identifiers are
            written as their fully-qualified NSID (for example{" "}
            <code {...stylex.props(docsStyles.codeInline)}>
              site.standard.document
            </code>
            ), and record references use{" "}
            <code {...stylex.props(docsStyles.codeInline)}>at://</code> URIs.
            Anything the network hosts — records, blobs, identities — is
            addressed the same way whether you reach it through the API, a
            renderer, or your own service.
          </Trans>
        </p>
      </div>
    </DocsRefShell>
  );
}
