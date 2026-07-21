# @standard-reader/renderer-svelte

A **headless, unstyled** Svelte 5 renderer for
[Standard Site](https://standard.site) documents.

You give it a Standard Site document; it parses the content — Leaflet, pckt,
Offprint, and every third-party block format Standard Reader understands — into a
normalized block stream and renders each block with **your** snippets. It ships
no styles, no CSS, and no design system. The default snippets are the barest
semantic HTML, rendered into light DOM, and every one of them is overridable.

> Built on [`@standard-reader/renderer-core`](../renderer-core), the
> framework-agnostic parser + render tree.

- **One prop for the document.** Pass the content payload; the format is detected
  from its `$type`.
- **One prop for the components.** Override any block or inline mark with a
  Svelte **snippet**. Snippets come in two categories — **shared** (the common
  block/inline vocabulary) and **platform** (blocks unique to one publishing
  platform).
- **Bring your own everything** — styling, links, image loading, mentions,
  interactive embeds.

## Install

```sh
npm install @standard-reader/renderer-svelte svelte
```

## Quick start

```svelte
<script>
  import { StandardDocument } from "@standard-reader/renderer-svelte";
  let { record } = $props();
</script>

<StandardDocument
  document={{ content: record.content, authorDid: record.did }}
  options={{ dropCap: true }}
/>
```

With no `components` prop, the document renders as unstyled semantic HTML
(`<p>`, `<h2>`, `<figure><img>`, `<pre><code>`, `<ul>`, …). Data-backed platform
embeds (polls, galleries, note embeds, Offprint components) render nothing until
you supply snippets for them.

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

Overrides are Svelte **snippets** keyed by node type. Container nodes receive a
`children` snippet you render with `{@render children()}`; leaf and data-backed
nodes just receive their props. Anything you don't override renders as the
unstyled default.

```svelte
<script>
  import { StandardDocument } from "@standard-reader/renderer-svelte";
  let { document } = $props();
</script>

{#snippet paragraph({ dropCap, children })}
  <p class:drop={dropCap}>{@render children()}</p>
{/snippet}

{#snippet heading({ level, children })}
  <svelte:element this={`h${level}`} class="hd">{@render children()}</svelte:element>
{/snippet}

{#snippet poll({ pollUri })}
  <LivePoll uri={pollUri} />
{/snippet}

<StandardDocument
  {document}
  components={{
    shared: { paragraph, heading },
    leaflet: { poll },
  }}
/>
```

### Shared snippets

Override these once and they apply to Leaflet, pckt, Offprint and every
third-party format.

**Blocks:** `root`, `paragraph`, `heading`, `blockquote`, `callout`,
`horizontalRule`, `bulletList`, `orderedList`, `listItem`, `taskList`,
`taskListItem`, `code`, `image`, `iframe`, `website`, `table`, `math`,
`button`, `blueskyEmbed`, `imageGrid`, `imageCarousel`, `imageDiff`,
`footnotes`, `footnoteItem`, `unknown`.

**Inline (facets):** `strong`, `emphasis`, `inlineCode`, `underline`,
`strikethrough`, `highlight`, `link`, `mention`, `footnoteReference`.

```svelte
<script>
  import { StandardDocument } from "@standard-reader/renderer-svelte";
  let { document } = $props();
</script>

{#snippet root({ children })}
  <div class="prose">{@render children()}</div>
{/snippet}

{#snippet paragraph({ dropCap, children })}
  <p class:drop-cap={dropCap} class="p">{@render children()}</p>
{/snippet}

{#snippet link({ href, children })}
  <a class="link" {href}>{@render children()}</a>
{/snippet}

<StandardDocument
  {document}
  components={{ shared: { root, paragraph, link } }}
/>
```

### Platform snippets

Platform snippets render blocks unique to one platform — usually interactive or
data-backed embeds the headless defaults can't fetch. Supply your own to make
them live; with no snippet, they render nothing.

```svelte
{#snippet poll({ pollUri })}
  <LivePoll uri={pollUri} />
{/snippet}

{#snippet standardSitePublication({ uri })}
  <PublicationCard {uri} />
{/snippet}

{#snippet gallery({ ref })}
  <PcktGallery recordUri={ref} />
{/snippet}

{#snippet noteEmbed({ uri })}
  <NoteCard {uri} />
{/snippet}

{#snippet component({ componentUri })}
  <OffprintComponent uri={componentUri} />
{/snippet}

<StandardDocument
  {document}
  components={{
    leaflet: { poll, standardSitePublication },
    pckt: { gallery, noteEmbed },
    offprint: { component },
  }}
/>
```

The Leaflet vocabulary also has `signup`, `separator`, `standardSitePost` and
`pageEmbed` (a container snippet that receives `children`).

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

Inline marks are shared snippets too. Override a single mark to restyle it, or
inject app behavior — e.g. resolve `@`-mentions to profile chips, or route links
through your client-side router. Each mark snippet receives a `children` snippet
you render with `{@render children()}`; `link` also gets `href`, and `mention`
gets `atUri` and `did`. Anything you don't override falls back to the default,
which segments the text and composes the individual mark snippets for you.

```svelte
{#snippet mention({ did, atUri, children })}
  <MentionChip {did} {atUri}>{@render children()}</MentionChip>
{/snippet}

{#snippet link({ href, children })}
  <SmartLink {href}>{@render children()}</SmartLink>
{/snippet}

<StandardDocument {document} components={{ shared: { mention, link } }} />
```

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

```svelte
<StandardDocument
  {document}
  options={{
    resolveImageUrl: ({ blob, externalSrc, authorDid }) =>
      externalSrc ?? myCdn(authorDid, blob),
  }}
/>
```

The resolved URL reaches your `image` snippet as `src`.

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

Every snippet contract is exported, so custom snippets are fully typed. Annotate
the `components` prop with `SvelteComponents` (or reach for a group type such as
`SvelteSharedComponents`) and each snippet's parameters are inferred:

```svelte
<script lang="ts">
  import { StandardDocument } from "@standard-reader/renderer-svelte";
  import type { SvelteComponents } from "@standard-reader/renderer-svelte";

  let { document } = $props();
</script>

{#snippet image({ src, alt })}
  <img class="rounded" {src} {alt} />
{/snippet}

<StandardDocument
  {document}
  components={{ shared: { image } } satisfies SvelteComponents}
/>
```

The exported types are `SvelteComponents`, `SvelteSharedComponents`,
`SvelteInlineComponents`, `SvelteLeafletComponents`, `SveltePcktComponents`,
`SvelteOffprintComponents`, and `RichCell`.

## License

MIT
