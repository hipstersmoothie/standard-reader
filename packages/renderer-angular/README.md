# @standard-reader/renderer-angular

A **headless, unstyled Angular renderer** for [Standard Site](https://standard.site)
documents, built on the framework-agnostic
[`@standard-reader/renderer-core`](../renderer-core).

- A standalone `<sr-standard-document>` component — bind the `document` input.
- Renders unstyled semantic HTML you style with your own CSS.
- Override the media and data-backed blocks with `<ng-template>` refs via the
  `components` input — **shared** (image, code, table, embeds, …) and
  **platform** (a Leaflet poll, a pckt gallery, an Offprint component, …).

## Install

```sh
npm install @standard-reader/renderer-angular @angular/core @angular/common
```

## Quick start

```ts
import { Component } from "@angular/core";
import { StandardDocumentComponent } from "@standard-reader/renderer-angular";

@Component({
  selector: "app-article",
  standalone: true,
  imports: [StandardDocumentComponent],
  template: `<sr-standard-document
    [document]="doc"
    [options]="{ dropCap: true }"
  />`,
})
export class ArticleComponent {
  doc = { content: this.record.content, authorDid: this.record.did };
}
```

The output is plain semantic HTML (`<p>`, `<h2>`, `<figure><img>`, `<ul>`, …)
that you style with ordinary CSS. Data-backed platform blocks (polls, galleries,
note embeds, Offprint components) render nothing until you provide a template.

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

Overridable via templates: the shared media blocks (`image`, `code`, `iframe`,
`website`, `table`, `math`, `button`, `blueskyEmbed`, `imageGrid`,
`imageCarousel`, `imageDiff`, `unknown`) and every platform block
(`leaflet.poll` / `signup` / `separator` / `standardSitePost` /
`standardSitePublication`, `pckt.gallery` / `noteEmbed`, `offprint.component`).
Structural blocks (paragraphs, headings, blockquotes, lists, callouts,
footnotes) render as semantic HTML you target with CSS.

### Resolving platform data

The platform templates hand you AT-URIs and DIDs (`pollUri`, `ref`,
`componentUri`, `uri`, …) to resolve to records/identities. A hosted AT Protocol
data service like [microcosm](https://www.microcosm.blue/) works great for many
of them — [Slingshot](https://slingshot.microcosm.blue/) for record + identity
resolution, [Constellation](https://constellation.microcosm.blue/) for
network-wide backlinks and interaction counts.

## Options

```ts
interface RendererOptions {
  dropCap?: boolean;
  skipLeadingImage?: boolean;
  resolveImageUrl?: ImageUrlResolver; // defaults to the Bluesky CDN
}
```

## License

MIT
