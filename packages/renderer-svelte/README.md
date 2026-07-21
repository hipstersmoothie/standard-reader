# @standard-reader/renderer-svelte

A **headless, unstyled Svelte 5 renderer** for [Standard Site](https://standard.site)
documents. Same idea as the React/Vue/Solid/Lit renderers, built on the shared
[`@standard-reader/renderer-core`](../renderer-core).

- A `<StandardDocument>` component — pass the `document` prop.
- Override any block or inline mark with a **snippet** — **shared** (the common
  block/inline vocabulary) and **platform** (blocks unique to one publishing
  platform).
- No styles: the defaults are the barest semantic HTML, rendered into light DOM.

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

### Shared vs platform, and resolving data

Shared snippets render the vocabulary every format has in common; platform
snippets (`leaflet.poll`, `pckt.gallery`, `offprint.component`, …) render the
interactive, often data-backed embeds — with no snippet, they render nothing.

Those platform snippets (and the inline `mention` / `link` snippets) hand you
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
