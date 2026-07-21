# @standard-reader/renderer-vue

A **headless, unstyled Vue 3 renderer** for [Standard Site](https://standard.site)
documents. Same idea as the React and Lit renderers, rendered with Vue's `h()`
render functions — all sit on the shared
[`@standard-reader/renderer-core`](../renderer-core).

- A `<StandardDocument>` component — pass the `document` prop.
- Or a `renderDocument()` function returning a vnode for your own render fns.
- Override any block or inline mark through the `components` map — **shared**
  (the common block/inline vocabulary) and **platform** (blocks unique to one
  publishing platform).
- No styles: the defaults are the barest semantic HTML.

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
