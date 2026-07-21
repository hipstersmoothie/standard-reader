# Document renderers

Standard Reader renders a **Standard Site document** — the `site.standard.document`
content union, in any of its formats (Leaflet, pckt, Offprint, and the
third-party block formats) — into UI. That renderer is published as a family of
packages so anyone can drop richly-formatted cross-platform posts into their own
app, in whatever framework they use.

## Architecture

```
                    site.standard.document (content union)
                                  │
                                  ▼
                 ┌──────────────────────────────────┐
                 │   @standard-reader/renderer-core   │  framework-agnostic
                 │  buildRenderTree() → DocumentTree  │  · parse every format
                 │  segmentInline()  → InlineNode[]   │  · normalize to one
                 └──────────────────────────────────┘    BlockNode vocabulary
                                  │                       · resolve images,
                                  │  one normalized tree    footnotes, options
        ┌───────────┬────────────┼────────────┬───────────┬───────────┐
        ▼           ▼            ▼            ▼           ▼           ▼
     react         vue         solid        svelte       lit       angular
```

All the format-specific work happens **once**, in
[`renderer-core`](./renderer-core): it detects the content format, parses it to
that format's blocks, and maps every block onto a single normalized
[`BlockNode`](./renderer-core/src/nodes.ts) vocabulary — resolving image URLs,
trimming a leading hero/duplicate heading, marking the drop-cap paragraph, and
collecting + numbering footnotes. Inline rich text becomes an `InlineNode` tree
via `segmentInline()`.

Each **framework renderer** is then just a thin walk over that tree: map each
`BlockNode` / `InlineNode` type to that framework's component or template. None
of the parsing is duplicated; adding a framework is a rendering concern only.

## Packages

| Package                                  | Framework            | Rendering primitive             |
| ---------------------------------------- | -------------------- | ------------------------------- |
| [`renderer-core`](./renderer-core)       | none                 | parser + normalized render tree |
| [`renderer-react`](./renderer-react)     | React                | React components                |
| [`renderer-vue`](./renderer-vue)         | Vue 3                | `h()` render functions          |
| [`renderer-solid`](./renderer-solid)     | SolidJS              | `solid-js/h` hyperscript        |
| [`renderer-svelte`](./renderer-svelte)   | Svelte 5             | components + snippet overrides  |
| [`renderer-lit`](./renderer-lit)         | Lit / web components | `lit-html` templates            |
| [`renderer-angular`](./renderer-angular) | Angular              | standalone components           |

The Standard Reader app itself consumes `renderer-react` (see
`src/components/reader/content/standard-renderer.tsx`), supplying its own
design-system components through the `components` prop.

## Shared design

Every renderer follows the same shape, so the mental model transfers between
frameworks:

- **One input for the document** — the content payload; the format is detected
  from its `$type`.
- **Headless + unstyled** — defaults are the barest semantic HTML with no styles;
  you bring the look.
- **A `components` override map in two categories:**
  - **shared** — the block + inline vocabulary common to every format
    (paragraph, heading, image, code, list, table, the inline marks, …).
  - **platform** — blocks unique to one publishing platform (a Leaflet poll or
    signup, a pckt gallery or note embed, an Offprint component, …). These are
    the interactive, often data-backed embeds; the headless defaults render
    nothing, so you supply your own.
- **Pluggable image resolution** — blob refs resolve to the Bluesky CDN by
  default (`resolveImageUrl` to override).

The exact override mechanism is idiomatic per framework — a components object of
functions (React/Vue/Solid), `lit-html` templates (Lit), Svelte snippets, or
Angular `<ng-template>` refs — but the split and the node vocabulary are the
same everywhere.

### Resolving platform-block data

The platform components (and the inline mention/link components) hand you
AT-URIs and DIDs to resolve to records/identities. A hosted AT Protocol data
service like [microcosm](https://www.microcosm.blue/) works great for many of
them — [Slingshot](https://slingshot.microcosm.blue/) for record + identity
resolution, [Constellation](https://constellation.microcosm.blue/) for
network-wide backlinks and interaction counts.

## Adding a framework renderer

A new renderer is a walk over `buildRenderTree()` + `segmentInline()`:

```ts
import { buildRenderTree, segmentInline } from "@standard-reader/renderer-core";

const tree = buildRenderTree(document, options);
if (!tree) return null; // unsupported format or empty body
// tree.children: BlockNode[]  ·  tree.footnotes  ·  tree.footnoteNumbers
```

Walk `tree.children`, `switch` on each `BlockNode.type`, and render the node's
props with your framework's primitive; for text-bearing nodes, run the rich text
through `segmentInline(text, tree.footnoteNumbers)` and walk the resulting
`InlineNode` tree. The existing renderers are the reference implementations —
`renderer-lit` and `renderer-vue` are the most compact. See
[`renderer-core`'s README](./renderer-core/README.md) for the node types and a
worked example.

## Development

Each package is a workspace package built and tested on its own:

```bash
pnpm --filter @standard-reader/renderer-core test
pnpm --filter @standard-reader/renderer-vue typecheck
pnpm --filter @standard-reader/renderer-lit build
```

Repo-wide `pnpm lint` / `pnpm exec oxfmt` cover the packages too. Each package
builds its `dist` on install via a `prepare` script (Angular excepted — it
builds with `ng-packagr` on publish).
