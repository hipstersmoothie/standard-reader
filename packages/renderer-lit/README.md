# @standard-reader/renderer-lit

A **headless, unstyled web-components renderer** for [Standard Site](https://standard.site)
documents, built on [Lit](https://lit.dev). It renders `lit-html` templates on
top of the framework-agnostic [`@standard-reader/renderer-core`](../renderer-core).

- A `<standard-document>` custom element — set its `document` property.
- Or a `renderDocument()` function returning a `lit-html` template you can drop
  into any Lit template or render yourself.
- Override any block or inline mark through the `components` map. Components come
  in two categories — **shared** (the common block/inline vocabulary) and
  **platform** (blocks unique to one publishing platform).
- No styles: the element renders into **light DOM** so your page's CSS applies.

## Install

```sh
npm install @standard-reader/renderer-lit lit
```

## Quick start

### As a custom element

```ts
import "@standard-reader/renderer-lit"; // registers <standard-document>

const el = document.createElement("standard-document");
el.document = { content: record.content, authorDid: record.did };
el.options = { dropCap: true };
document.body.append(el);
```

Or in a Lit template:

```ts
import { html } from "lit";
import "@standard-reader/renderer-lit";

html`<standard-document
  .document=${doc}
  .options=${{ dropCap: true }}
></standard-document>`;
```

### As a render function

```ts
import { render } from "lit";
import { renderDocument } from "@standard-reader/renderer-lit";

render(renderDocument(doc, { options: { dropCap: true } }), container);
```

With no `components` supplied, the document renders as unstyled semantic HTML
(`<p>`, `<h2>`, `<figure><img>`, `<pre><code>`, `<ul>`, …). Data-backed platform
embeds (polls, galleries, note embeds, Offprint components) render nothing until
you supply components for them.

## The document input

Every renderer takes one input for the document — the content payload of a
`site.standard.document`. The format is detected from the payload's `$type`.

```ts
interface StandardSiteDocument {
  /** The content-union payload — the `contentJson` of a document record. */
  content: unknown;
  /** Explicit format `$type`, used only when `content.$type` is absent. */
  contentFormat?: string | null;
  /** DID of the repo hosting image blobs (required for blob-backed images). */
  authorDid?: string;
  /** Header description; a leading heading matching it is dropped as a dupe. */
  description?: string | null;
}
```

Supported content formats:

| Family             | `$type`                                       | Vocabulary        |
| ------------------ | --------------------------------------------- | ----------------- |
| Leaflet            | `pub.leaflet.content`, `pub.leaflet.document` | Leaflet blocks    |
| pckt               | `blog.pckt.content`                           | pckt blocks       |
| Offprint           | `app.offprint.content`                        | shared structured |
| BlockNote          | `org.blocknote.document#content`              | shared structured |
| Fables             | `ca.justexe.fables.blocks`                    | shared structured |
| OXA                | `pub.oxa.document.document`                   | shared structured |
| WSS rich-text      | `com.wss.content.rich-text`                   | shared structured |
| item-block formats | (several)                                     | shared structured |

## Customizing components

Pass a partial `components` map; anything omitted uses the unstyled default.
Each component is a function returning a `lit-html` renderable.

```ts
import { html } from "lit";
import { renderDocument } from "@standard-reader/renderer-lit";

renderDocument(doc, {
  components: {
    shared: {
      root: (children) => html`<article class="prose">${children}</article>`,
      heading: ({ level }, children) =>
        level <= 1 ? html`<h1>${children}</h1>` : html`<h2>${children}</h2>`,
      link: ({ href }, children) => html`<my-link href=${href}>${children}</my-link>`,
      // Full control of inline formatting:
      facetText: (props, ctx) => /* …use ctx to render your own inline tree… */,
    },
    leaflet: {
      poll: ({ pollUri }) => html`<live-poll uri=${pollUri}></live-poll>`,
    },
    pckt: {
      gallery: ({ ref }) => html`<pckt-gallery record=${ref}></pckt-gallery>`,
    },
    offprint: {
      component: ({ componentUri }) => html`<offprint-component uri=${componentUri}></offprint-component>`,
    },
  },
});
```

On the element, set `.components` (and `.options`) the same way:

```ts
el.components = {
  leaflet: {
    poll: ({ pollUri }) => html`<live-poll uri=${pollUri}></live-poll>`,
  },
};
```

### Shared components

Override these once and they apply to Leaflet, pckt, Offprint and every
third-party format.

**Blocks:** `root`, `paragraph`, `heading`, `blockquote`, `callout`,
`horizontalRule`, `bulletList`, `orderedList`, `listItem`, `taskList`,
`taskListItem`, `code`, `image`, `iframe`, `website`, `table`, `math`,
`button`, `blueskyEmbed`, `imageGrid`, `imageCarousel`, `imageDiff`,
`footnotes`, `footnoteItem`, `unknown`.

**Inline (facets):** `facetText`, `strong`, `emphasis`, `inlineCode`,
`underline`, `strikethrough`, `highlight`, `link`, `mention`,
`footnoteReference`.

### Platform components

Platform components render blocks unique to one platform — usually interactive
or data-backed embeds the headless defaults can't fetch. Supply your own to make
them live:

```ts
renderDocument(doc, {
  components: {
    leaflet: {
      poll: ({ pollUri }) => html`<live-poll uri=${pollUri}></live-poll>`,
      standardSitePublication: ({ uri }) =>
        html`<publication-card uri=${uri}></publication-card>`,
    },
    pckt: {
      gallery: ({ ref }) => html`<pckt-gallery record=${ref}></pckt-gallery>`,
      noteEmbed: ({ uri }) => html`<note-card uri=${uri}></note-card>`,
    },
    offprint: {
      component: ({ componentUri }) =>
        html`<offprint-component uri=${componentUri}></offprint-component>`,
    },
  },
});
```

> **Resolving the data these components need.** The platform components — and
> the inline `mention` / `link` components — hand you AT-URIs and DIDs
> (`pollUri`, `ref`, `componentUri`, `uri`, `did`, …) that you resolve to
> records and identities yourself. A hosted AT Protocol data service like
> [**microcosm**](https://www.microcosm.blue/) works great for many of them, so
> you don't have to stand up your own AppView:
>
> - [**Slingshot**](https://slingshot.microcosm.blue/) — an edge record +
>   identity cache. Resolve a record by AT-URI (the poll, gallery blob, note
>   post, Offprint component, embedded publication/document) or resolve a
>   handle/DID to build mention chips and smart links.
> - [**Constellation**](https://constellation.microcosm.blue/) — a network-wide
>   backlink index, handy for the interaction data these embeds show (poll
>   tallies, who-embedded-this, reply counts).
>
> Both are free and hosted, and pair naturally with a data-fetching layer
> (TanStack Query, SWR, or your framework's own data layer) inside your platform
> components.

### Customizing inline formatting

Inline marks are shared components too. Override a single mark to restyle it, or
inject app behavior — e.g. resolve `@`-mentions to profile chips, or route links
through your client-side router:

```ts
renderDocument(doc, {
  components: {
    shared: {
      mention: ({ did, atUri }, children) =>
        html`<mention-chip did=${did ?? ""} at-uri=${atUri ?? ""}>${children}</mention-chip>`,
      link: ({ href }, children) =>
        html`<smart-link href=${href}>${children}</smart-link>`,
    },
  },
});
```

To take **full** control of inline rendering, override `facetText`: it receives
the raw `{ plaintext, facets }` plus the render context and you render however
you like. Otherwise the default `facetText` segments the text and composes the
individual mark components above.

## Options

```ts
interface RendererOptions {
  dropCap?: boolean; // flag the first paragraph (its `dropCap` prop)
  skipLeadingImage?: boolean; // drop a leading hero image
  resolveImageUrl?: ImageUrlResolver; // override blob → URL (defaults to the Bluesky CDN)
}
```

### Images

By default, blob-backed images resolve to a Bluesky CDN URL built from the blob
CID and `authorDid` (the CDN serves any PDS blob by `(did, cid)`); absolute
`https` sources pass through. Override `resolveImageUrl` in `options` to route
through your own image proxy:

```ts
renderDocument(doc, {
  options: {
    resolveImageUrl: ({ blob, externalSrc, authorDid }) =>
      externalSrc ?? myCdn(authorDid, blob),
  },
});
```

The resolved URL reaches your `shared.image` component as `src`.

## Parsing without rendering

The pure parsers, the render tree, and the block-vocabulary types are not in
this package — they live in the framework-agnostic core. Install
[`@standard-reader/renderer-core`](../renderer-core) directly when you want to
pre-process a document, index it, or build your own renderer:

```ts
import {
  buildRenderTree,
  segmentInline,
  leafletBlocks,
  pcktBlocks,
  offprintBlocks,
  structuredFormatBlocks,
  type LeafletRenderableBlock,
  type StructuredRenderableBlock,
} from "@standard-reader/renderer-core";

const blocks = leafletBlocks(content); // Array<LeafletRenderableBlock>
```

## TypeScript

Every component contract is exported, so custom components are fully typed:

```ts
import { html } from "lit";
import type {
  LitComponentsInput,
  LitSharedComponents,
} from "@standard-reader/renderer-lit";

const image: LitSharedComponents["image"] = ({ src, alt }) =>
  html`<my-image .src=${src} alt=${alt}></my-image>`;

const components: LitComponentsInput = {
  shared: { image },
};
```

## License

MIT
