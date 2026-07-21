# @standard-reader/renderer-angular

A **headless, unstyled Angular renderer** for [Standard Site](https://standard.site)
documents, built on the framework-agnostic
[`@standard-reader/renderer-core`](../renderer-core).

- A standalone `<sr-standard-document>` component — bind the `document` input.
- Renders unstyled semantic HTML you style with your own CSS.
- Override the media and data-backed blocks with `<ng-template>` refs via the
  `components` input — **shared** (image, code, table, embeds, …) and
  **platform** (a Leaflet poll, a pckt gallery, an Offprint component, …).

This is the same renderer that powers the Standard Reader app, factored out so
you can drop richly-formatted cross-platform posts into your own UI.

## Install

```sh
npm install @standard-reader/renderer-angular @angular/core @angular/common
# to fetch documents to render (optional):
npm install @standard-reader/lexicons @atproto/lex-client
```

## Quick start

Fetch a document with the typed Standard Reader API client
([`@standard-reader/lexicons`](https://www.npmjs.com/package/@standard-reader/lexicons) and [`@atproto/lex-client`](https://www.npmjs.com/package/@atproto/lex-client)) — a
single `getDocument` call returns the card metadata **and** the renderable body:

```ts
import { Client } from "@atproto/lex-client";
import {
  standardReader,
  STANDARD_READER_SERVICE,
} from "@standard-reader/lexicons";

const client = new Client(STANDARD_READER_SERVICE);

const doc = await client.call(standardReader.getDocument, {
  document: "at://did:plc:…/site.standard.document/…",
});
```

`doc` lines up field-for-field with the renderer's `document` input:

```ts
import { Component } from "@angular/core";
import { StandardDocumentComponent } from "@standard-reader/renderer-angular";

@Component({
  selector: "app-article",
  standalone: true,
  imports: [StandardDocumentComponent],
  template: `<sr-standard-document
    [document]="document"
    [options]="{ dropCap: true }"
  />`,
})
export class ArticleComponent {
  document = {
    content: doc.content,
    contentFormat: doc.contentFormat,
    authorDid: doc.did,
    description: doc.description,
  };
}
```

With no `components` input, the document renders as unstyled semantic HTML
(`<p>`, `<h2>`, `<figure><img>`, `<pre><code>`, `<ul>`, …) that you style with
ordinary CSS. Data-backed platform blocks (polls, galleries, note embeds,
Offprint components) render nothing until you provide a template for them.

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

Overrides are `<ng-template>` refs keyed by node type, passed via `components`.
Each template receives the node's props as its `$implicit` context — bind them
with `let-p`.

```ts
@Component({
  standalone: true,
  imports: [StandardDocumentComponent, LivePollComponent, PcktGalleryComponent],
  template: `
    <ng-template #poll let-p><live-poll [uri]="p.pollUri" /></ng-template>
    <ng-template #gallery let-p><pckt-gallery [record]="p.ref" /></ng-template>
    <ng-template #image let-p>
      <my-image [src]="p.src" [alt]="p.alt" [ratio]="p.aspectRatio" />
    </ng-template>

    <sr-standard-document
      [document]="doc"
      [components]="{
        shared: { image },
        leaflet: { poll },
        pckt: { gallery },
      }"
    />
  `,
})
export class ArticleComponent {
  @ViewChild("poll", { static: true }) poll!: TemplateRef<any>;
  /* … Angular binds the #poll/#gallery/#image templates automatically … */
}
```

The `components` input is a partial map with four groups — `shared`, `leaflet`,
`pckt`, `offprint`. Anything you omit falls back to the unstyled default (or, for
data-backed platform blocks, to nothing).

### Shared components

Override these once and they apply to Leaflet, pckt, Offprint and every
third-party format. Only the media and data-backed blocks are template-
overridable:

**Blocks:** `image`, `code`, `iframe`, `website`, `table`, `math`, `button`,
`blueskyEmbed`, `imageGrid`, `imageCarousel`, `imageDiff`, `unknown`.

Structural blocks (paragraphs, headings, blockquotes, lists, callouts,
footnotes) and inline marks are **not** template-overridable — they render as
unstyled semantic HTML you target with CSS. Inline formatting comes through as
`<strong>`, `<em>`, `<a>`, `<code>`, mention/link anchors, and so on, so a
stylesheet scoped to `sr-standard-document` is all you need to theme them.

```ts
@Component({
  standalone: true,
  imports: [StandardDocumentComponent, MyImageComponent, MyCodeComponent],
  template: `
    <ng-template #image let-p>
      <my-image [src]="p.src" [alt]="p.alt" [ratio]="p.aspectRatio" />
    </ng-template>
    <ng-template #code let-p>
      <my-code [code]="p.code" [language]="p.language" />
    </ng-template>

    <sr-standard-document
      [document]="doc"
      [components]="{ shared: { image, code } }"
    />
  `,
})
export class ArticleComponent {}
```

### Platform components

Platform components render blocks unique to one publishing platform — usually
interactive or data-backed embeds the headless defaults can't fetch. Supply a
template to make them live:

```ts
@Component({
  standalone: true,
  imports: [StandardDocumentComponent /* + your embed components */],
  template: `
    <ng-template #poll let-p><live-poll [uri]="p.pollUri" /></ng-template>
    <ng-template #publication let-p>
      <publication-card [uri]="p.uri" />
    </ng-template>
    <ng-template #gallery let-p><pckt-gallery [record]="p.ref" /></ng-template>
    <ng-template #note let-p><note-card [uri]="p.uri" /></ng-template>
    <ng-template #component let-p>
      <offprint-component [uri]="p.componentUri" />
    </ng-template>

    <sr-standard-document
      [document]="doc"
      [components]="{
        leaflet: { poll, standardSitePublication: publication },
        pckt: { gallery, noteEmbed: note },
        offprint: { component },
      }"
    />
  `,
})
export class ArticleComponent {}
```

The platform keys are `leaflet.poll` / `signup` / `separator` /
`standardSitePost` / `standardSitePublication`, `pckt.gallery` / `noteEmbed`,
and `offprint.component`.

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

## Options

```ts
interface RendererOptions {
  /** Drop cap on the first paragraph (rendered as `data-drop-cap`). */
  dropCap?: boolean;
  /** Drop a leading image block (e.g. when a hero is shown above the body). */
  skipLeadingImage?: boolean;
  /** Override how blob refs become image URLs; defaults to the Bluesky CDN. */
  resolveImageUrl?: ImageUrlResolver;
}
```

### Images

By default, blob-backed images resolve to a Bluesky CDN URL built from the blob
CID and `authorDid` (the CDN serves any PDS blob by `(did, cid)`); absolute
`https` sources pass through. Override `resolveImageUrl` in `options` to route
through your own image proxy:

```ts
@Component({
  standalone: true,
  imports: [StandardDocumentComponent],
  template: `
    <ng-template #image let-p>
      <img [src]="p.src" [alt]="p.alt" loading="lazy" />
    </ng-template>

    <sr-standard-document
      [document]="doc"
      [components]="{ shared: { image } }"
      [options]="{
        resolveImageUrl: resolveImageUrl,
      }"
    />
  `,
})
export class ArticleComponent {
  resolveImageUrl = ({ blob, externalSrc, authorDid }) =>
    externalSrc ?? myCdn(authorDid, blob);
}
```

The resolved URL reaches your `image` template as `src`.

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

Every component contract is exported, so your override templates are fully typed.
Type a `TemplateRef` with the `Tpl<…>` helper, or type the whole `components`
input with `AngularComponents`:

```ts
import type {
  AngularComponents,
  AngularSharedComponents,
  Tpl,
} from "@standard-reader/renderer-angular";

// One template's `$implicit` context:
@ViewChild("image", { static: true })
image!: Tpl<{ src: string; alt: string }>;

// Or the whole input:
const components: AngularComponents = {
  shared: { image: this.image },
};
```

## License

MIT
