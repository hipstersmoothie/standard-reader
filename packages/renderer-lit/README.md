# @standard-reader/renderer-lit

A **headless, unstyled web-components renderer** for [Standard Site](https://standard.site)
documents, built on [Lit](https://lit.dev). Same idea as
[`@standard-reader/renderer-react`](../renderer-react), rendered with `lit-html`
instead of React — both sit on the shared
[`@standard-reader/renderer-core`](../renderer-core).

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

### Shared vs platform, and resolving data

Shared components (`root`, `paragraph`, `heading`, `image`, `code`, `table`, the
inline marks `strong`/`link`/`mention`/…) render the vocabulary every format has
in common. Platform components (`leaflet.poll`, `pckt.gallery`,
`offprint.component`, …) render the interactive, often data-backed embeds — the
headless defaults render nothing, so supply your own.

Those platform components (and the inline `mention` / `link` components) hand you
AT-URIs and DIDs to resolve to records/identities. A hosted AT Protocol data
service like [microcosm](https://www.microcosm.blue/) works great for many of
them — [Slingshot](https://slingshot.microcosm.blue/) for record + identity
resolution, [Constellation](https://constellation.microcosm.blue/) for
network-wide backlinks and interaction counts.

## Options

```ts
interface RendererOptions {
  dropCap?: boolean; // flag the first paragraph (its `dropCap` prop)
  skipLeadingImage?: boolean; // drop a leading hero image
  resolveImageUrl?: ImageUrlResolver; // override blob → URL (defaults to the Bluesky CDN)
}
```

## License

MIT
