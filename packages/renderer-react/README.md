# @standard-reader/renderer-react

A **headless, unstyled** React renderer for [Standard Site](https://standard.site) documents.

You give it a Standard Site document; it parses the content — Leaflet, pckt,
Offprint, and every third-party block format Standard Reader understands — into a
normalized block stream and renders each block with **your** components. It ships
no styles, no CSS, and no design system. The default components are the barest
semantic HTML, and every one of them is overridable.

This is the same renderer that powers the Standard Reader app, factored out so
you can drop richly-formatted cross-platform posts into your own UI.

> Built on [`@standard-reader/renderer-core`](../renderer-core), the
> framework-agnostic parser + render tree.

- **One prop for the document.** Pass the content payload; the format is detected
  from its `$type`.
- **One prop for the components.** Override any block or inline mark. Components
  come in two categories — **shared** (the common block/inline vocabulary) and
  **platform** (blocks unique to one publishing platform).
- **Bring your own everything** — styling, links, image loading, mentions,
  interactive embeds.

## Install

```sh
npm install @standard-reader/renderer-react
# peers:
npm install react react-dom
```

## Quick start

```tsx
import { StandardDocumentRenderer } from "@standard-reader/renderer-react";

function Article({ record }) {
  return (
    <StandardDocumentRenderer
      document={{
        content: record.content, // the content-union payload (has a `$type`)
        authorDid: record.did, // repo that hosts image blobs
        description: record.description,
      }}
    />
  );
}
```

With no `components` prop, the document renders as unstyled semantic HTML
(`<p>`, `<h2>`, `<figure><img>`, `<pre><code>`, `<ul>`, …). Data-backed platform
embeds (polls, galleries, note embeds, Offprint components) render nothing until
you supply components for them.

## The `document` prop

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

## The `components` prop

`components` is a partial map; anything you omit falls back to the unstyled
default. It has four groups:

```tsx
<StandardDocumentRenderer
  document={doc}
  components={{
    shared: {/* block + inline components shared across every format */},
    leaflet: {
      /* Leaflet-only blocks: Poll, Signup, Separator, StandardSitePost,
         StandardSitePublication, PageEmbed */
    },
    pckt: {/* pckt-only blocks: Gallery, NoteEmbed */},
    offprint: {/* Offprint-only blocks: Component */},
  }}
/>
```

### Shared components

Override these once and they apply to Leaflet, pckt, Offprint and every
third-party format.

**Blocks:** `Root`, `Paragraph`, `Heading`, `Blockquote`, `Callout`,
`HorizontalRule`, `BulletList`, `OrderedList`, `ListItem`, `TaskList`,
`TaskListItem`, `Code`, `Image`, `Iframe`, `Website`, `Table`, `Math`,
`Button`, `BlueskyEmbed`, `ImageGrid`, `ImageCarousel`, `ImageDiff`,
`Footnotes`, `FootnoteItem`, `Unknown`.

**Inline (facets):** `FacetText`, `Strong`, `Emphasis`, `InlineCode`,
`Underline`, `Strikethrough`, `Highlight`, `Link`, `Mention`,
`FootnoteReference`.

```tsx
import { StandardDocumentRenderer } from "@standard-reader/renderer-react";
import styles from "./article.module.css";

<StandardDocumentRenderer
  document={doc}
  components={{
    shared: {
      Root: ({ children }) => <div className={styles.prose}>{children}</div>,
      Paragraph: ({ children, dropCap }) => (
        <p className={dropCap ? styles.dropCap : styles.p}>{children}</p>
      ),
      Heading: ({ level, children }) => {
        const Tag = `h${level}` as const;
        return <Tag className={styles.heading}>{children}</Tag>;
      },
      Link: ({ href, children }) => (
        <a className={styles.link} href={href}>
          {children}
        </a>
      ),
    },
  }}
/>;
```

### Platform components

These render blocks unique to one platform — usually interactive or data-backed
embeds the headless defaults can't fetch. Supply your own to make them live:

```tsx
<StandardDocumentRenderer
  document={doc}
  components={{
    leaflet: {
      Poll: ({ pollUri }) => <LivePoll uri={pollUri} />,
      StandardSitePublication: ({ uri }) => <PublicationCard uri={uri} />,
    },
    pckt: {
      Gallery: ({ ref }) => <PcktGallery recordUri={ref} />,
      NoteEmbed: ({ uri }) => <NoteCard uri={uri} />,
    },
    offprint: {
      Component: ({ componentUri }) => <OffprintComponent uri={componentUri} />,
    },
  }}
/>
```

> **Resolving the data these components need.** The platform components — and
> the inline `Mention` / `Link` components — hand you AT-URIs and DIDs
> (`pollUri`, `ref`, `componentUri`, `uri`, `did`, …) that you resolve to
> records and identities yourself. A hosted AT Protocol data service like
> [**microcosm**](https://www.microcosm.blue/) works great for many of them, so
> you don't have to stand up your own AppView:
>
> - [**Slingshot**](https://slingshot.microcosm.blue/) — an edge record +
>   identity cache. Resolve a record by AT-URI (the poll, gallery blob, note
>   post, Offprint component, embedded publication/document) or resolve a
>   handle/DID (`identity.resolveMiniDoc`) to build `Mention` chips and smart
>   `Link`s.
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
components={{
  shared: {
    Mention: ({ did, atUri, children }) => (
      <MentionChip did={did} atUri={atUri}>{children}</MentionChip>
    ),
    Link: ({ href, children }) => <SmartLink href={href}>{children}</SmartLink>,
  },
}}
```

To take **full** control of inline rendering, override `FacetText` — it receives
the raw `{ plaintext, facets }` and you render however you like. Otherwise the
default `FacetText` segments the text and composes the individual mark
components above.

## Options

```ts
interface RendererOptions {
  /** Drop cap on the first paragraph (passed as `dropCap` to `Paragraph`). */
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
`https` sources pass through. Override `resolveImageUrl` to route through your
own image proxy:

```tsx
<StandardDocumentRenderer
  document={doc}
  options={{
    resolveImageUrl: ({ blob, externalSrc, authorDid }) =>
      externalSrc ?? myCdn(authorDid, blob),
  }}
/>
```

The resolved URL is passed to your `shared.Image` component as `src`.

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
  RendererComponentsInput,
  ImageProps,
  MentionProps,
} from "@standard-reader/renderer-react";

const components: RendererComponentsInput = {
  shared: {
    Image: (props: ImageProps) => <MyImage {...props} />,
  },
};
```

## License

MIT
