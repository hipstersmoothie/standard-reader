"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";

import { EMBED_RESIZE_MESSAGE } from "#/lib/embed-snippet";
import { getPublicUrlClient } from "#/lib/public-url";

import {
  HighlightedHtml,
  HighlightedJson,
} from "../../docs/docs-highlighted-code";
import { docsStyles } from "../../docs/docs-page.stylex";
import { GuideShell } from "../guide-shell";

const DISCOVERY_SNIPPET = `<meta
  name="at:canonical"
  content="at://did:plc:you/site.standard.document/<rkey>"
/>
<meta
  name="at:alternate"
  content="at://did:plc:you/site.standard.publication/<rkey>"
/>
<meta name="at:author" content="at://did:plc:you" />`;

const DISCOVERY_LEGACY_SNIPPET = `<link
  rel="site.standard.document"
  href="at://did:plc:you/site.standard.document/<rkey>"
/>
<link
  rel="site.standard.publication"
  href="at://did:plc:you/site.standard.publication/<rkey>"
/>`;

const EXAMPLE_RECORD = JSON.stringify(
  {
    $type: "site.standard.document",
    site: "https://example.com",
    path: "/posts/hello-world",
    title: "Hello, world",
    publishedAt: "2026-07-01T12:00:00.000Z",
    content: {
      $type: "at.markpub.markdown",
      text: {
        $type: "at.markpub.text",
        markdown: "# Hello, world\n\nThis renders inline in Standard Reader.",
      },
    },
  },
  null,
  2,
);

function CodePanel({ tag, code }: { tag: string; code: string }) {
  return (
    <div {...stylex.props(docsStyles.reqPanel)}>
      <div {...stylex.props(docsStyles.reqBar)}>
        <span {...stylex.props(docsStyles.reqTag)}>{tag}</span>
      </div>
      <HighlightedHtml html={code} />
    </div>
  );
}

/**
 * Kept as a const rather than an inline JSX literal: Lingui inlines string
 * literals into the extracted message, and the braces here would then be parsed
 * as an ICU placeholder — which fails catalog compilation for every locale. As
 * a variable reference it extracts as a placeholder instead.
 */
const HTML_PAYLOAD_EXAMPLE = '{ html: "..." }';

// A real, live publication — placeholder ids wouldn't render anything.
const SAMPLE_PUBLICATION = {
  did: "did:plc:s2rczyxit2v5vzedxqs326ri",
  rkey: "3lz3s33asuc2l",
  name: "Annotated",
};

/**
 * Annotated's owner — the same repo DID, shown as an author rather than as a
 * masthead. No name here: the card reads the live profile, and the iframe title
 * names the publication we already know instead of guessing at a person.
 */
const SAMPLE_AUTHOR = {
  did: SAMPLE_PUBLICATION.did,
};

/**
 * A live embed card, wired to the same `postMessage` resize handshake the
 * copied snippet uses — so the sample on this page behaves exactly like the one
 * a publisher pastes on their own site.
 */
function EmbedSample({
  src,
  title,
  initialHeight,
}: {
  src: string;
  title: string;
  initialHeight: number;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(initialHeight);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (
        event.data?.type !== EMBED_RESIZE_MESSAGE ||
        typeof event.data.height !== "number"
      ) {
        return;
      }
      if (event.source === iframeRef.current?.contentWindow) {
        setHeight(Math.ceil(event.data.height));
      }
    }
    globalThis.addEventListener("message", onMessage);
    return () => globalThis.removeEventListener("message", onMessage);
  }, []);

  return (
    <div
      style={{
        backgroundColor: "#f9f7f2",
        borderRadius: "1.55rem",
        maxWidth: "100%",
        overflow: "hidden",
        width: "25rem",
      }}
    >
      {/* oxlint-disable-next-line iframe-has-title --
          the title IS set below; the rule can't statically resolve a
          tagged-template expression. */}
      <iframe
        ref={iframeRef}
        src={src}
        width={400}
        height={height}
        style={{
          border: 0,
          colorScheme: "normal",
          display: "block",
          width: "100%",
        }}
        title={title}
        loading="lazy"
      />
    </div>
  );
}

function SubscribeEmbedSample({ origin }: { origin: string }) {
  const { t } = useLingui();
  const publicationName = SAMPLE_PUBLICATION.name;

  return (
    <EmbedSample
      src={`${origin}/embed/subscribe/${SAMPLE_PUBLICATION.did}/${SAMPLE_PUBLICATION.rkey}?layout=portrait`}
      title={t`Subscribe to ${publicationName}`}
      initialHeight={322}
    />
  );
}

function FollowEmbedSample({ origin }: { origin: string }) {
  const { t } = useLingui();
  const publicationName = SAMPLE_PUBLICATION.name;

  return (
    <EmbedSample
      src={`${origin}/embed/follow/${SAMPLE_AUTHOR.did}?layout=portrait`}
      title={t`Follow the author of ${publicationName}`}
      initialHeight={304}
    />
  );
}

export function PublishingGuidePage() {
  const origin = getPublicUrlClient();

  return (
    <GuideShell
      area="publishing"
      title={<Trans>Publishing your site</Trans>}
      dek={
        <Trans>
          How to wire a personal site&apos;s own{" "}
          <code {...stylex.props(docsStyles.codeInline)}>site.standard.*</code>{" "}
          records so Standard Reader can find it and read articles inline,
          without going through Leaflet, Pckt, Offprint, or another publishing
          tool.
        </Trans>
      }
    >
      <h2 {...stylex.props(docsStyles.h2, docsStyles.h2First)} id="overview">
        <Trans>Overview</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Standard Reader indexes{" "}
          <code {...stylex.props(docsStyles.codeInline)}>
            site.standard.document
          </code>{" "}
          and{" "}
          <code {...stylex.props(docsStyles.codeInline)}>
            site.standard.publication
          </code>{" "}
          records out of AT Proto repos. Platforms like Leaflet, Pckt, and
          Offprint write these records for you as part of publishing, so their
          authors get the full reader treatment automatically. If you run your
          own site and hand-roll your own{" "}
          <code {...stylex.props(docsStyles.codeInline)}>site.standard</code>{" "}
          integration instead, you write those records yourself — this page
          covers what to add, including Markpub, the markdown format we
          recommend for a hand-rolled body.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="discovery">
        <Trans>Discovery</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Say in your page&apos;s{" "}
          <code {...stylex.props(docsStyles.codeInline)}>head</code> which
          records it is built from, and any client on the network can resolve
          the page back to them. Our browser extension uses this: when you land
          on a URL it hasn&apos;t indexed yet, it reads those tags rather than
          guessing from the URL.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Use the <code {...stylex.props(docsStyles.codeInline)}>at:</code> meta
          tags — the convention the Atmosphere settled on in 2026.{" "}
          <code {...stylex.props(docsStyles.codeInline)}>at:canonical</code>{" "}
          names the records the page is made of, the ones it would have no
          reason to exist without.{" "}
          <code {...stylex.props(docsStyles.codeInline)}>at:alternate</code>{" "}
          names records the page merely shows — the publication a document
          belongs to, a companion Bluesky post.{" "}
          <code {...stylex.props(docsStyles.codeInline)}>at:author</code> names
          the identity that wrote it. Every name repeats, so a page with two
          alternates emits two tags.
        </Trans>
      </p>
      <CodePanel tag="head" code={DISCOVERY_SNIPPET} />
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Standard Reader emits these on its own article, publication,
          collection, list and profile pages, and reads them from yours.
        </Trans>
      </p>
      <h3 {...stylex.props(docsStyles.h3)}>
        <Trans>The site.standard link rels</Trans>
      </h3>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Emit these too. Discovery hints are part of the site.standard spec
          itself — a <code {...stylex.props(docsStyles.codeInline)}>link</code>{" "}
          tag whose <code {...stylex.props(docsStyles.codeInline)}>rel</code> is
          the record&apos;s collection and whose{" "}
          <code {...stylex.props(docsStyles.codeInline)}>href</code> is its{" "}
          <code {...stylex.props(docsStyles.codeInline)}>at://</code> URI — and
          plenty of clients across the network still read only these. Include
          the{" "}
          <code {...stylex.props(docsStyles.codeInline)}>
            site.standard.publication
          </code>{" "}
          hint when the document belongs to a publication record.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          The two say overlapping things, and that&apos;s fine: the meta tags
          carry intent the rels can&apos;t, while the rels are what the
          site.standard spec asks for. Carry both, which is what Standard Reader
          itself does on every article, publication and collection page.
        </Trans>
      </p>
      <CodePanel tag="head" code={DISCOVERY_LEGACY_SNIPPET} />

      <h2 {...stylex.props(docsStyles.h2)} id="subscribe-embed">
        <Trans>Subscribe embed</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Every publication page also serves a themed, embeddable subscribe
          widget — an iframe you can drop on your own site so visitors can
          subscribe without leaving your page. The easiest way to get it: open
          your publication&apos;s page on Standard Reader, use{" "}
          <strong>Share → Embed subscribe</strong>, pick landscape or portrait,
          and copy the snippet — no account or ownership check required to
          generate it.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          It reads the publication&apos;s{" "}
          <code {...stylex.props(docsStyles.codeInline)}>basicTheme</code>{" "}
          colors automatically, so the card matches your brand with no extra
          params — fonts aren&apos;t picked up though; the card always uses
          Standard Reader&apos;s own type. Here&apos;s a live one:
        </Trans>
      </p>
      <SubscribeEmbedSample origin={origin} />
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Clicking Subscribe opens Standard Reader itself, not your page —
          subscribing writes a{" "}
          <code {...stylex.props(docsStyles.codeInline)}>
            site.standard.graph.subscription
          </code>{" "}
          record to the reader&apos;s own PDS via their own OAuth session, so it
          has to happen on our domain. If you&apos;d rather skip the iframe,
          link straight to{" "}
          <code {...stylex.props(docsStyles.codeInline)}>
            /subscribe/{"{did}"}/{"{rkey}"}
          </code>{" "}
          and style your own button.
        </Trans>
      </p>

      <h2 {...stylex.props(docsStyles.h2)} id="follow-embed">
        <Trans>Follow embed</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          The same widget exists for <em>you</em>, not just your publications.
          Open your own profile on Standard Reader and use{" "}
          <strong>the ⌄ menu → Embed follow</strong> to get a card that follows
          your account — useful when your writing is spread across several
          publications, or when you post as yourself rather than under a
          masthead. Same three tabs (landscape, portrait, link), same auto-
          resizing iframe.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          An account has no theme record of its own, so the follow card always
          paints in Standard Reader&apos;s default palette rather than your
          brand colors. Clicking Follow writes an{" "}
          <code {...stylex.props(docsStyles.codeInline)}>
            app.standard-reader.graph.follow
          </code>{" "}
          record to the reader&apos;s own PDS — and, as with any follow,
          materializes subscriptions to your publications so those readers stay
          yours if you leave. To skip the iframe, link straight to{" "}
          <code {...stylex.props(docsStyles.codeInline)}>
            /follow/{"{did}"}
          </code>{" "}
          and style your own button; a handle works there in place of the DID.
        </Trans>
      </p>
      <FollowEmbedSample origin={origin} />

      <h2 {...stylex.props(docsStyles.h2)} id="inline-reading">
        <Trans>Rendering Content in Standard Reader</Trans>
      </h2>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Whether tapping an article opens it inline in Standard Reader, or
          takes the reader straight to your site, depends on one thing: does the
          record&apos;s{" "}
          <code {...stylex.props(docsStyles.codeInline)}>content</code> field
          hold a body in a format Standard Reader knows how to render? If{" "}
          <code {...stylex.props(docsStyles.codeInline)}>content</code> is
          missing, or set to a format we don&apos;t recognize, the article is
          treated as an external post and always opens on your site — even if{" "}
          <code {...stylex.props(docsStyles.codeInline)}>textContent</code>{" "}
          carries a plain-text excerpt. To get inline reading, publish the
          article body in{" "}
          <code {...stylex.props(docsStyles.codeInline)}>content</code> using
          one of the recognized formats below.
        </Trans>
      </p>

      <h3 {...stylex.props(docsStyles.h3)} id="content-formats">
        <Trans>Supported content formats</Trans>
      </h3>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          <strong>
            <a
              href="https://markpub.at"
              target="_blank"
              rel="noreferrer"
              {...stylex.props(docsStyles.proseLink)}
            >
              Markpub
            </a>{" "}
            (recommended).
          </strong>{" "}
          <code {...stylex.props(docsStyles.codeInline)}>
            at.markpub.markdown
          </code>{" "}
          — markdown with facets for rich text. It&apos;s not part of the
          site.standard spec either — no markdown format is — but it&apos;s the
          only one that&apos;s actually spec&apos;d in a meaningful, reusable
          way, rather than one app&apos;s own ad hoc shape. Use this for a
          hand-rolled integration unless you already produce one of the platform
          formats below.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          <strong>Leaflet, Pckt, Offprint.</strong>{" "}
          <code {...stylex.props(docsStyles.codeInline)}>
            pub.leaflet.content
          </code>
          ,{" "}
          <code {...stylex.props(docsStyles.codeInline)}>
            blog.pckt.content
          </code>
          , and{" "}
          <code {...stylex.props(docsStyles.codeInline)}>
            app.offprint.content
          </code>{" "}
          — the block-based formats those tools write natively.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          Everything below is compatibility support for formats already out
          there in other apps&apos; own repos — none of it is part of the
          site.standard spec, and none of it is something to model a new
          integration on.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          <strong>HTML-in-record.</strong> Formats whose payload is{" "}
          <code {...stylex.props(docsStyles.codeInline)}>
            {HTML_PAYLOAD_EXAMPLE}
          </code>{" "}
          — each from a different, unrelated app, e.g.{" "}
          <code {...stylex.props(docsStyles.codeInline)}>
            org.wordpress.html
          </code>{" "}
          (WordPress) or{" "}
          <code {...stylex.props(docsStyles.codeInline)}>co.idno.html</code>{" "}
          (Idno). Sanitized before render, never injected raw.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          <strong>Structured blocks.</strong> Rich block-editor documents, each
          in that editor&apos;s own schema — e.g.{" "}
          <code {...stylex.props(docsStyles.codeInline)}>
            org.blocknote.document#content
          </code>{" "}
          (BlockNote) or{" "}
          <code {...stylex.props(docsStyles.codeInline)}>
            pub.oxa.document.document
          </code>{" "}
          (Oxa). Only useful if you&apos;re already producing one of these; not
          worth adopting from scratch.
        </Trans>
      </p>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          <strong>Other markdown shapes (avoid).</strong>{" "}
          <code {...stylex.props(docsStyles.codeInline)}>
            site.standard.content.markdown
          </code>{" "}
          and a scattering of third-party{" "}
          <code {...stylex.props(docsStyles.codeInline)}>#markdown</code> shapes
          — e.g.{" "}
          <code {...stylex.props(docsStyles.codeInline)}>
            site.standard.document#markdown
          </code>{" "}
          — carry a raw markdown string under a format-specific key. Don&apos;t
          add another one — publish Markpub instead.
        </Trans>
      </p>

      <h3 {...stylex.props(docsStyles.h3)} id="example">
        <Trans>Example record</Trans>
      </h3>
      <p {...stylex.props(docsStyles.prose)}>
        <Trans>
          A minimal loose document — no publication, Markpub markdown body:
        </Trans>
      </p>
      <div {...stylex.props(docsStyles.reqPanel)}>
        <div {...stylex.props(docsStyles.reqBar)}>
          <span {...stylex.props(docsStyles.reqTag)}>
            site.standard.document
          </span>
        </div>
        <HighlightedJson json={EXAMPLE_RECORD} />
      </div>
    </GuideShell>
  );
}
