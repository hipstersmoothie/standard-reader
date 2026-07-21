# @standard-reader/renderer-vue

A **headless, unstyled Vue 3 renderer** for [Standard Site](https://standard.site)
documents. It renders with Vue's `h()` render functions on top of the
framework-agnostic [`@standard-reader/renderer-core`](../renderer-core).

You give it a Standard Site document; it parses the content — Leaflet, pckt,
Offprint, and every third-party block format Standard Reader understands — into a
normalized block stream and renders each block with **your** components. It ships
no styles, no CSS, and no design system. The default components are the barest
semantic HTML, and every one of them is overridable.

> Built on [`@standard-reader/renderer-core`](../renderer-core), the
> framework-agnostic parser + render tree.

- A `<StandardDocument>` component — pass the `document` prop.
- Or a `renderDocument()` function returning a vnode for your own render fns.
- Override any block or inline mark through the `components` map — **shared**
  (the common block/inline vocabulary) and **platform** (blocks unique to one
  publishing platform).
- **Bring your own everything** — styling, links, image loading, mentions,
  interactive embeds.

## Install

```sh
npm install @standard-reader/renderer-vue vue
```

## Quick start

```vue
<script setup lang="ts">
import { StandardDocument } from "@standard-reader/renderer-vue";
const doc = { content: record.content, authorDid: record.did };
</script>

<template>
  <StandardDocument :document="doc" :options="{ dropCap: true }" />
</template>
```

Or in a render function:

```ts
import { h } from "vue";
import { renderDocument } from "@standard-reader/renderer-vue";

export default {
  props: ["doc"],
  render() {
    return renderDocument(this.doc, { options: { dropCap: true } });
  },
};
```

With no `components` map, the document renders as unstyled semantic HTML (`<p>`,
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
Each component is a function returning a vnode.

```ts
import { h } from "vue";

const components = {
  shared: {
    root: (children) => h("article", { class: "prose" }, [children]),
    heading: ({ level }, children) =>
      h(`h${level}`, { class: "hd" }, [children]),
    link: ({ href }, children) => h(MyLink, { href }, () => children),
    // Full control of inline formatting:
    facetText: (props, ctx) => /* …render your own inline tree… */ null,
  },
  leaflet: {
    poll: ({ pollUri }) => h(LivePoll, { uri: pollUri }),
  },
  pckt: {
    gallery: ({ ref }) => h(PcktGallery, { record: ref }),
  },
  offprint: {
    component: ({ componentUri }) =>
      h(OffprintComponent, { uri: componentUri }),
  },
};
```

```vue
<StandardDocument :document="doc" :components="components" />
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

Platform components render blocks unique to one publishing platform — usually
interactive or data-backed embeds the headless defaults can't fetch. Supply your
own to make them live: `leaflet` (`poll`, `signup`, `separator`,
`standardSitePost`, `standardSitePublication`, `pageEmbed`), `pckt` (`gallery`,
`noteEmbed`) and `offprint` (`component`).

```ts
import { h } from "vue";

const components = {
  leaflet: {
    poll: ({ pollUri }) => h(LivePoll, { uri: pollUri }),
    standardSitePublication: ({ uri }) => h(PublicationCard, { uri }),
  },
  pckt: {
    gallery: ({ ref }) => h(PcktGallery, { record: ref }),
    noteEmbed: ({ uri }) => h(NoteCard, { uri }),
  },
  offprint: {
    component: ({ componentUri }) => h(OffprintComponent, { uri: componentUri }),
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

```ts
import { h } from "vue";

const components = {
  shared: {
    mention: ({ did, atUri }, children) =>
      h(MentionChip, { did, atUri }, () => children),
    link: ({ href }, children) => h(SmartLink, { href }, () => children),
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
  /** Drop cap on the first paragraph (passed as `dropCap` to `paragraph`). */
  dropCap?: boolean;
  /** Drop a leading image block (e.g. when a hero is shown above the body). */
  skipLeadingImage?: boolean;
  /** Override how blob refs become image URLs. */
  resolveImageUrl?: ImageUrlResolver;
}
```

### Images

By default, blob-backed images resolve to a Bluesky CDN URL built from the blob
CID and `authorDid` (the CDN serves any PDS blob by `(did, cid)`); absolute
`https` sources pass through. Override `resolveImageUrl` in `options` to route
through your own image proxy:

```vue
<StandardDocument
  :document="doc"
  :options="{
    resolveImageUrl: ({ blob, externalSrc, authorDid }) =>
      externalSrc ?? myCdn(authorDid, blob),
  }"
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

```ts
import type {
  VueComponentsInput,
  VueSharedComponents,
} from "@standard-reader/renderer-vue";

const components: VueComponentsInput = {
  shared: {
    image: (props) => h(MyImage, props),
  },
};

// Reuse a single mark's contract:
type ImageComponent = VueSharedComponents["image"];
```

## License

MIT
