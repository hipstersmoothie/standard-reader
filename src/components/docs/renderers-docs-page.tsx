"use client";

import { Trans } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";

import {
  RENDERERS_DOCS_IDS,
  RENDERERS_DOCS_SCROLL_SPY_IDS,
  renderersDocsJumpNavGroups,
} from "#/lib/renderers-docs/navigation";

import { DocsMobileNav } from "./docs-mobile-nav";
import { docsStyles } from "./docs-page.stylex";
import { DocsRefShell } from "./docs-ref-shell";
import { DocsRenderersNav } from "./docs-renderers-nav";
import { DocsSideNav } from "./docs-side-nav";

const NPM_BASE = "https://www.npmjs.com/package";

const PACKAGES = [
  { name: "@standard-reader/renderer-react", framework: "React" },
  { name: "@standard-reader/renderer-vue", framework: "Vue 3" },
  { name: "@standard-reader/renderer-solid", framework: "SolidJS" },
  { name: "@standard-reader/renderer-svelte", framework: "Svelte 5" },
  { name: "@standard-reader/renderer-lit", framework: "Lit / web components" },
  { name: "@standard-reader/renderer-angular", framework: "Angular" },
] as const;

function PackageLink({ name }: { name: string }) {
  return (
    <a
      href={`${NPM_BASE}/${name}`}
      target="_blank"
      rel="noreferrer"
      {...stylex.props(docsStyles.proseLink)}
    >
      <code {...stylex.props(docsStyles.codeInline)}>{name}</code>
    </a>
  );
}

export function RenderersDocsPage() {
  return (
    <DocsRefShell
      scrollSpyIds={RENDERERS_DOCS_SCROLL_SPY_IDS}
      nav={<DocsSideNav area="renderers" />}
      toc={<DocsRenderersNav />}
      mobileJumpNav={
        <DocsMobileNav
          area="renderers"
          groups={renderersDocsJumpNavGroups()}
          selectId="docs-renderers-jump-nav"
          fallbackId={RENDERERS_DOCS_SCROLL_SPY_IDS[0] ?? ""}
        />
      }
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
            Install instructions, the full props reference, and
            framework-specific usage examples live in each package&apos;s README
            on npm.
          </Trans>
        </p>
        <ul {...stylex.props(docsStyles.prose)}>
          {PACKAGES.map((pkg) => (
            <li key={pkg.name}>
              <PackageLink name={pkg.name} /> — {pkg.framework}
              {pkg.name === "@standard-reader/renderer-react" ? (
                <>
                  {" "}
                  <Trans>(this is what Standard Reader itself uses)</Trans>
                </>
              ) : null}
              .
            </li>
          ))}
        </ul>

        <h2 {...stylex.props(docsStyles.h2)} id={RENDERERS_DOCS_IDS.components}>
          <Trans>Customizing components</Trans>
        </h2>
        <p {...stylex.props(docsStyles.prose)}>
          <Trans>
            Every renderer takes one input for the document — the content
            payload of a{" "}
            <code {...stylex.props(docsStyles.codeInline)}>
              site.standard.document
            </code>{" "}
            — and an optional{" "}
            <code {...stylex.props(docsStyles.codeInline)}>components</code> map.
            The format is detected from the payload&apos;s{" "}
            <code {...stylex.props(docsStyles.codeInline)}>$type</code>. With no{" "}
            <code {...stylex.props(docsStyles.codeInline)}>components</code>{" "}
            prop, a document renders as unstyled semantic HTML.
          </Trans>
        </p>
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
            everywhere. See each package&apos;s README on npm for the
            framework-specific shape and worked examples.
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
            <PackageLink name="@standard-reader/renderer-core" /> is public:
            reach for it to inspect or transform a document without rendering it,
            or to build a renderer for a framework not listed above. A renderer
            is just a walk over its normalized tree — map each block type to your
            framework&apos;s primitive, and run text through the core&apos;s
            inline segmenter to render marks, links, mentions and footnote
            references. The existing renderers are the reference implementations;
            the API is documented in the{" "}
            <PackageLink name="@standard-reader/renderer-core" /> README on npm.
          </Trans>
        </p>
      </div>
    </DocsRefShell>
  );
}
