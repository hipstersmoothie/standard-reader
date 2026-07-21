# @standard-reader/renderer-solid

A **headless, unstyled SolidJS renderer** for [Standard Site](https://standard.site)
documents, built on the framework-agnostic
[`@standard-reader/renderer-core`](../renderer-core).

- A `<StandardDocument>` component — pass the `document` prop.
- Or a `renderDocument()` function.
- Override any block or inline mark through the `components` map — **shared**
  (the common block/inline vocabulary) and **platform** (blocks unique to one
  publishing platform).
- No styles: the defaults are the barest semantic HTML.

The renderer is authored with Solid's hyperscript (`solid-js/h`), so it ships as
plain JS with no JSX build step of its own — it drops into any Solid app.

## Install

```sh
npm install @standard-reader/renderer-solid solid-js
```

## Quick start

```tsx
import { StandardDocument } from "@standard-reader/renderer-solid";

function Article(props: { record: any }) {
  return (
    <StandardDocument
      document={{ content: props.record.content, authorDid: props.record.did }}
      options={{ dropCap: true }}
    />
  );
}
```

With no `components`, the document renders as unstyled semantic HTML (`<p>`,
`<h2>`, `<figure><img>`, `<pre><code>`, `<ul>`, …). Data-backed platform embeds
(polls, galleries, note embeds, Offprint components) render nothing until you
supply components for them.

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
Each component returns a Solid element (JSX or hyperscript both work).

```tsx
const components = {
  shared: {
    root: (children) => <article class="prose">{children}</article>,
    heading: ({ level }, children) => <h2 class="hd">{children}</h2>,
    link: ({ href }, children) => <MyLink href={href}>{children}</MyLink>,
    // Full control of inline formatting:
    facetText: (props, ctx) => /* …render your own inline tree… */ null,
  },
  leaflet: {
    poll: ({ pollUri }) => <LivePoll uri={pollUri} />,
  },
  pckt: {
    gallery: ({ ref }) => <PcktGallery record={ref} />,
  },
  offprint: {
    component: ({ componentUri }) => <OffprintComponent uri={componentUri} />,
  },
};

<StandardDocument document={doc} components={components} />;
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

Platform components render the blocks unique to one publishing platform —
usually the interactive or data-backed embeds the headless defaults can't fetch.
Supply your own under the matching format key (`leaflet`, `pckt`, `offprint`) to
make them live:

```tsx
const components = {
  leaflet: {
    poll: ({ pollUri }) => <LivePoll uri={pollUri} />,
    standardSitePublication: ({ uri }) => <PublicationCard uri={uri} />,
  },
  pckt: {
    gallery: ({ ref }) => <PcktGallery record={ref} />,
    noteEmbed: ({ uri }) => <NoteCard uri={uri} />,
  },
  offprint: {
    component: ({ componentUri }) => <OffprintComponent uri={componentUri} />,
  },
};
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

```tsx
const components = {
  shared: {
    mention: ({ did, atUri }, children) => (
      <MentionChip did={did} atUri={atUri}>{children}</MentionChip>
    ),
    link: ({ href }, children) => <SmartLink href={href}>{children}</SmartLink>,
  },
};
```

To take **full** control of inline rendering, override `facetText` — it receives
the raw `{ plaintext, facets }` (plus the render context) and you render however
you like. Otherwise the default `facetText` segments the text and composes the
individual mark components above.

## Options

```ts
interface RendererOptions {
  dropCap?: boolean;
  skipLeadingImage?: boolean;
  resolveImageUrl?: ImageUrlResolver; // defaults to the Bluesky CDN
}
```

### Images

By default, blob-backed images resolve to a Bluesky CDN URL built from the blob
CID and `authorDid` (the CDN serves any PDS blob by `(did, cid)`); absolute
`https` sources pass through. Override `resolveImageUrl` in `options` to route
through your own image proxy:

```tsx
<StandardDocument
  document={doc}
  options={{
    resolveImageUrl: ({ blob, externalSrc, authorDid }) =>
      externalSrc ?? myCdn(authorDid, blob),
  }}
/>
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

```tsx
import type {
  SolidComponentsInput,
  SolidSharedComponents,
} from "@standard-reader/renderer-solid";

const image: SolidSharedComponents["image"] = (props) => (
  <MyImage src={props.src} alt={props.alt} />
);

const components: SolidComponentsInput = {
  shared: { image },
};
```

## License

MIT
