# @standard-reader/renderer-core

The **framework-agnostic core** behind the Standard Reader renderers. It parses a
Standard Site document — Leaflet, pckt, Offprint, and every third-party block
format Standard Reader understands — and normalizes it into a single render tree
that any UI framework can walk.

You usually don't depend on this directly: pick a framework renderer instead
([`@standard-reader/renderer-react`](../renderer-react),
[`@standard-reader/renderer-lit`](../renderer-lit)). Reach for the core when you
want to build a renderer for another framework, or to inspect/transform a
document without rendering it.

## The render tree

```ts
import { buildRenderTree, segmentInline } from "@standard-reader/renderer-core";

const tree = buildRenderTree(
  { content, authorDid, description }, // a StandardSiteDocument
  { dropCap: true, skipLeadingImage: false },
);
// tree: { format, children: BlockNode[], footnotes, footnoteNumbers } | null
```

`buildRenderTree` does all the format-specific work once:

- detects the content format from `content.$type` (or `contentFormat`),
- parses it to that format's blocks,
- maps every block onto the shared [`BlockNode`](./src/nodes.ts) vocabulary
  (`paragraph`, `heading`, `image`, `code`, `bulletList`, `table`, `callout`,
  the platform blocks `leaflet.poll` / `pckt.gallery` / `offprint.component`, …),
- resolves blob images to URLs (override via `options.resolveImageUrl`),
- trims a leading hero image / duplicate heading and marks the drop-cap
  paragraph,
- collects and numbers Leaflet footnotes.

Inline rich text is carried on nodes as `RichText` (`plaintext` + byte-indexed
facets). Turn it into an `InlineNode` tree of marks/links/mentions/footnote
references with `segmentInline(richText, footnoteNumbers)`.

## Writing a framework renderer

A renderer is a walk over the tree that maps each `BlockNode` / `InlineNode`
type to a component or template in your framework:

```ts
import { buildRenderTree, segmentInline } from "@standard-reader/renderer-core";

function render(doc) {
  const tree = buildRenderTree(doc);
  if (!tree) return null;
  return tree.children.map(renderBlock);
}

function renderBlock(node) {
  switch (node.type) {
    case "paragraph":
      return myParagraph(renderInline(node.text));
    case "heading":
      return myHeading(node.level, renderInline(node.text));
    case "image":
      return myImage(node.src, node.alt);
    // …one case per BlockNode type
  }
}

function renderInline(text) {
  return segmentInline(text).map((n) => {
    switch (n.type) {
      case "text":
        return n.value;
      case "mark":
        return myMark(n.mark, renderInline(n.children));
      case "link":
        return myLink(n.href, n.children);
      case "mention":
        return myMention(n, n.children);
      case "footnoteRef":
        return myFootnoteRef(n);
    }
  });
}
```

The React, Vue, Solid, Svelte, Lit and Angular renderers are each exactly this
walk with a per-framework component/template registry layered on top — a good
reference when adding another framework.

## Also exported

The raw per-format parsers and vocabulary types are available too:
`leafletBlocks`, `pcktBlocks`, `offprintBlocks`, `structuredFormatBlocks`,
`collectLeafletFootnotes`, `segmentFacetedText`, `defaultImageUrlResolver`,
`blobCid` / `cdnImageUrl`, and the `LeafletRenderableBlock` /
`StructuredRenderableBlock` / `PcktRenderableBlock` types.

## License

MIT
