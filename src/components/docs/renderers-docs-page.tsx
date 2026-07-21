"use client";

import { Trans } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";

import { RENDERERS_DOCS_IDS } from "#/lib/renderers-docs/navigation";

import { docsStyles } from "./docs-page.stylex";
import { DocsRefShell } from "./docs-ref-shell";
import { DocsRenderersMobileJumpNav } from "./docs-renderers-mobile-jump-nav";
import { DocsRenderersNav } from "./docs-renderers-nav";

const INSTALL = `npm install @standard-reader/renderer-react react react-dom`;

const QUICKSTART = `import { StandardDocumentRenderer } from "@standard-reader/renderer-react";

function Article({ record }) {
  return (
    <StandardDocumentRenderer
      document={{
        content: record.content, // the content-union payload (has a $type)
        authorDid: record.did,    // repo that hosts image blobs
        description: record.description,
      }}
    />
  );
}`;

const DOCUMENT_TYPE = `interface StandardSiteDocument {
  // The content-union payload — the "content" of a site.standard.document.
  content: unknown;
  // Explicit format $type, used only when content.$type is absent.
  contentFormat?: string | null;
  // DID of the repo hosting image blobs (required for blob-backed images).
  authorDid?: string;
  // Header description; a leading heading matching it is dropped as a dupe.
  description?: string | null;
}`;

const COMPONENTS_EXAMPLE = `<StandardDocumentRenderer
  document={doc}
  components={{
    shared: {
      // one Root/Paragraph/Heading/Image/Code/Link/Mention/... for every format
      Root: ({ children }) => <div className="prose">{children}</div>,
      Link: ({ href, children }) => <SmartLink href={href}>{children}</SmartLink>,
    },
    leaflet: { Poll: ({ pollUri }) => <LivePoll uri={pollUri} /> },
    pckt: { Gallery: ({ ref }) => <PcktGallery recordUri={ref} /> },
    offprint: { Component: ({ componentUri }) => <Snippet uri={componentUri} /> },
  }}
/>`;

const CORE_EXAMPLE = `import { buildRenderTree, segmentInline } from "@standard-reader/renderer-core";

const tree = buildRenderTree(document, options);
if (!tree) return null; // unsupported format or empty body

// tree.children  — BlockNode[]  (paragraph, heading, image, code, leaflet.poll, …)
// tree.footnotes — the endnotes
// segmentInline(text, tree.footnoteNumbers) — an InlineNode[] of marks/links/…`;

function CodeBlock({ tag, code }: { tag: string; code: string }) {
  return (
    <div {...stylex.props(docsStyles.reqPanel)}>
      <div {...stylex.props(docsStyles.reqBar)}>
        <span {...stylex.props(docsStyles.reqTag)}>{tag}</span>
      </div>
      <pre {...stylex.props(docsStyles.reqCode)}>{code}</pre>
    </div>
  );
}

export function RenderersDocsPage() {
  return (
    <DocsRefShell
      scrollSpyIds={[
        RENDERERS_DOCS_IDS.overview,
        RENDERERS_DOCS_IDS.packages,
        RENDERERS_DOCS_IDS.quickstart,
        RENDERERS_DOCS_IDS.document,
        RENDERERS_DOCS_IDS.components,
        RENDERERS_DOCS_IDS.platformData,
        RENDERERS_DOCS_IDS.core,
      ]}
      nav={<DocsRenderersNav />}
      mobileJumpNav={<DocsRenderersMobileJumpNav />}
    >
      <div {...stylex.props(docsStyles.masthead)}>
        <div {...stylex.props(docsStyles.kicker)}>
          <Trans>Developer docs</Trans>
        </div>
        <h1 {...stylex.props(docsStyles.title)}>
          <Trans>Rendering Standard Site documents</Trans>
        </h1>
        <p {...stylex.props(docsStyles.dek)}>
          <Trans>
            The same renderer that powers Standard Reader, published as
            headless, unstyled packages. Give one a{" "}
            <code {...stylex.props(docsStyles.codeInline)}>
              site.standard.document
            </code>{" "}
            and your own components, and drop richly-formatted cross-platform
            posts into your own app — in React, Vue, Solid, Svelte, web
            components, or Angular.
          </Trans>
        </p>
      </div>

      <div {...stylex.props(docsStyles.introProse)}>
        <h2
          {...stylex.props(docsStyles.h2, docsStyles.h2First)}
          id={RENDERERS_DOCS_IDS.overview}
        >
          <Trans>Overview</Trans>
        </h2>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            A publication body can arrive in many formats — Leaflet, Pckt,
            Offprint, and a long tail of third-party block and markdown formats.
            These packages parse all of them and render each block with{" "}
            <strong>your</strong> components. They ship no styles and no design
            system: the defaults are the barest semantic HTML, and every
            component is overridable.
          </Trans>
        </p>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            All the format-specific work happens once, in a framework-agnostic
            core that normalizes every format into one block vocabulary. Each
            framework renderer is a thin walk over that shared tree, so the same
            mental model — one document input, one components map — transfers
            between frameworks.
          </Trans>
        </p>

        <h2 {...stylex.props(docsStyles.h2)} id={RENDERERS_DOCS_IDS.packages}>
          <Trans>Packages</Trans>
        </h2>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            Pick the package for your framework; all sit on the same core.
          </Trans>
        </p>
        <ul {...stylex.props(docsStyles.prose)}>
          <li>
            <code {...stylex.props(docsStyles.codeInline)}>
              @standard-reader/renderer-react
            </code>{" "}
            — <Trans>React (this is what Standard Reader itself uses).</Trans>
          </li>
          <li>
            <code {...stylex.props(docsStyles.codeInline)}>
              @standard-reader/renderer-vue
            </code>{" "}
            — <Trans>Vue 3.</Trans>
          </li>
          <li>
            <code {...stylex.props(docsStyles.codeInline)}>
              @standard-reader/renderer-solid
            </code>{" "}
            — <Trans>SolidJS.</Trans>
          </li>
          <li>
            <code {...stylex.props(docsStyles.codeInline)}>
              @standard-reader/renderer-svelte
            </code>{" "}
            — <Trans>Svelte 5.</Trans>
          </li>
          <li>
            <code {...stylex.props(docsStyles.codeInline)}>
              @standard-reader/renderer-lit
            </code>{" "}
            — <Trans>Lit / web components.</Trans>
          </li>
          <li>
            <code {...stylex.props(docsStyles.codeInline)}>
              @standard-reader/renderer-angular
            </code>{" "}
            — <Trans>Angular.</Trans>
          </li>
        </ul>

        <h2 {...stylex.props(docsStyles.h2)} id={RENDERERS_DOCS_IDS.quickstart}>
          <Trans>Quick start</Trans>
        </h2>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            The React package, for example. With no{" "}
            <code {...stylex.props(docsStyles.codeInline)}>components</code>{" "}
            prop, a document renders as unstyled semantic HTML.
          </Trans>
        </p>
        <CodeBlock tag="sh" code={INSTALL} />
        <CodeBlock tag="tsx" code={QUICKSTART} />

        <h2 {...stylex.props(docsStyles.h2)} id={RENDERERS_DOCS_IDS.document}>
          <Trans>The document input</Trans>
        </h2>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            Every renderer takes one input for the document — the content
            payload of a{" "}
            <code {...stylex.props(docsStyles.codeInline)}>
              site.standard.document
            </code>
            . The format is detected from the payload&apos;s{" "}
            <code {...stylex.props(docsStyles.codeInline)}>$type</code>.
          </Trans>
        </p>
        <CodeBlock tag="ts" code={DOCUMENT_TYPE} />

        <h2 {...stylex.props(docsStyles.h2)} id={RENDERERS_DOCS_IDS.components}>
          <Trans>Customizing components</Trans>
        </h2>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            The <code {...stylex.props(docsStyles.codeInline)}>components</code>{" "}
            map is a partial override — anything you omit uses the unstyled
            default. It comes in two categories:
          </Trans>
        </p>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            <strong>Shared</strong> components render the block and inline
            vocabulary that every format has in common — paragraphs, headings,
            images, code, lists, tables, and the inline marks (bold, links,
            mentions, footnotes). Override one and it applies across every
            format.
          </Trans>
        </p>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            <strong>Platform</strong> components render the blocks unique to one
            publishing platform — a Leaflet poll or signup, a Pckt gallery or
            note embed, an Offprint component. These are the interactive, often
            data-backed embeds; the headless defaults render nothing, so you
            supply your own to make them live.
          </Trans>
        </p>
        <CodeBlock tag="tsx" code={COMPONENTS_EXAMPLE} />
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            The exact override mechanism is idiomatic per framework — a
            components object of functions in React, Vue and Solid,{" "}
            <code {...stylex.props(docsStyles.codeInline)}>lit-html</code>{" "}
            templates in Lit, snippets in Svelte, or{" "}
            <code {...stylex.props(docsStyles.codeInline)}>
              &lt;ng-template&gt;
            </code>{" "}
            refs in Angular — but the split and the vocabulary are the same
            everywhere. See each package&apos;s README for the
            framework-specific shape.
          </Trans>
        </p>

        <h2
          {...stylex.props(docsStyles.h2)}
          id={RENDERERS_DOCS_IDS.platformData}
        >
          <Trans>Resolving platform data</Trans>
        </h2>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            The platform components — and the inline mention and link components
            — hand you AT-URIs and DIDs to resolve to records and identities
            yourself. A hosted AT Protocol data service like{" "}
            <a
              href="https://www.microcosm.blue/"
              target="_blank"
              rel="noreferrer"
              {...stylex.props(docsStyles.proseLink)}
            >
              microcosm
            </a>{" "}
            works great for many of them:{" "}
            <a
              href="https://slingshot.microcosm.blue/"
              target="_blank"
              rel="noreferrer"
              {...stylex.props(docsStyles.proseLink)}
            >
              Slingshot
            </a>{" "}
            for record and identity resolution, and{" "}
            <a
              href="https://constellation.microcosm.blue/"
              target="_blank"
              rel="noreferrer"
              {...stylex.props(docsStyles.proseLink)}
            >
              Constellation
            </a>{" "}
            for network-wide backlinks and interaction counts (poll tallies,
            reply counts, who-embedded-this).
          </Trans>
        </p>

        <h2 {...stylex.props(docsStyles.h2)} id={RENDERERS_DOCS_IDS.core}>
          <Trans>The core, and new frameworks</Trans>
        </h2>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            You usually depend on a framework renderer, not the core directly.
            But{" "}
            <code {...stylex.props(docsStyles.codeInline)}>
              @standard-reader/renderer-core
            </code>{" "}
            is public: reach for it to inspect or transform a document without
            rendering it, or to build a renderer for a framework not listed
            above. A renderer is just a walk over its normalized tree.
          </Trans>
        </p>
        <CodeBlock tag="ts" code={CORE_EXAMPLE} />
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            Walk the blocks, map each block type to your framework&apos;s
            primitive, and run text through{" "}
            <code {...stylex.props(docsStyles.codeInline)}>segmentInline</code>{" "}
            to render marks, links, mentions and footnote references. The
            existing renderers are the reference implementations.
          </Trans>
        </p>
      </div>
    </DocsRefShell>
  );
}
