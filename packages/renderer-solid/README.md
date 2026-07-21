# @standard-reader/renderer-solid

A **headless, unstyled SolidJS renderer** for [Standard Site](https://standard.site)
documents. Same idea as the React/Vue/Lit renderers, built on the shared
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

### Shared vs platform, and resolving data

Shared components render the vocabulary every format has in common; platform
components (`leaflet.poll`, `pckt.gallery`, `offprint.component`, …) render the
interactive, often data-backed embeds — the headless defaults render nothing, so
supply your own.

Those platform components (and the inline `mention` / `link` components) hand you
AT-URIs and DIDs to resolve to records/identities. A hosted AT Protocol data
service like [microcosm](https://www.microcosm.blue/) works great for many of
them — [Slingshot](https://slingshot.microcosm.blue/) for record + identity
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
