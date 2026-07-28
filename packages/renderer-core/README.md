# @standard-reader/renderer-core

The **framework-agnostic core** behind the Standard Reader renderers. It parses a
Standard Site document — Leaflet, pckt, Offprint, markdown (the canonical
`site.standard.content.markdown`, markdown-in-record formats like Lemma, and
Markpub's `at.markpub.markdown`), SkyPress Gutenberg blocks, mochott's TipTap
articles, and every third-party block format Standard Reader understands — and
normalizes it into a single render tree that any UI framework can walk.

You usually don't depend on this directly: pick a framework renderer instead
(see the [renderers overview](../README.md)). Reach for the core when you want to
build a renderer for another framework, or to inspect/transform a document
without rendering it.

## The render tree

Fetch a document with the typed Standard Reader API client
([`@standard-reader/lexicons`](https://www.npmjs.com/package/@standard-reader/lexicons) and [`@atproto/lex-client`](https://www.npmjs.com/package/@atproto/lex-client)) — a
single `getDocument` call returns the card metadata **and** the renderable body,
whose fields map straight onto a `StandardSiteDocument`:

```ts
import { Client } from "@atproto/lex-client";
import {
  standardReader,
  STANDARD_READER_SERVICE,
} from "@standard-reader/lexicons";
import { buildRenderTree, segmentInline } from "@standard-reader/renderer-core";

const client = new Client(STANDARD_READER_SERVICE);
const doc = await client.call(standardReader.getDocument, {
  document: "at://did:plc:…/site.standard.document/…",
});

const tree = buildRenderTree(
  {
    content: doc.content,
    contentFormat: doc.contentFormat,
    authorDid: doc.did,
    description: doc.description,
  }, // a StandardSiteDocument
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

Every framework renderer is exactly this walk with a per-framework
component/template registry layered on top; the [renderers
overview](../README.md) links the reference implementations.

## Also exported

The raw per-format parsers and vocabulary types are available too:
`leafletBlocks`, `pcktBlocks`, `offprintBlocks`, `structuredFormatBlocks`,
`markdownBlocks` / `markdownBlocksFromText` / `markdownText` /
`MARKDOWN_FORMATS`, `markpubBlocks` / `prepareMarkpubMarkdown` /
`MARKPUB_FORMATS`, `mochottBlocks` / `mochottDocument` / `MOCHOTT_FORMATS`,
`gutenbergBlocks` / `GUTENBERG_CONTENT`,
`collectLeafletFootnotes`, `segmentFacetedText`, `defaultImageUrlResolver`,
`blobCid` / `cdnImageUrl`, and the `LeafletRenderableBlock` /
`StructuredRenderableBlock` / `PcktRenderableBlock` types.

### Format notes

- **Markpub** (`at.markpub.markdown`) carries facets over the _markdown source_.
  Facet-only constructs (headers, strong, horizontal rules, front matter) are
  rewritten back into markdown syntax before parsing, so they arrive as real
  blocks. `#idify` heading anchors and the `latex` extension are not modelled.
- **Mochott** (`site.mochott.article`) publishes each post twice: a
  `site.standard.document` with the card metadata, and a `site.mochott.article`
  at the **same rkey** holding the body as a TipTap document. Only the article
  record has renderable content, so pass that record (or its bare `content` doc
  node, tagged `site.mochott.article#tiptapDocument`) as the document's
  `content`. Its link cards become `website` blocks, embeds become `iframe`s,
  inline footnotes are lifted into `tree.footnotes`, and images — served through
  mochott's `/api/image/{did}/{cid}` proxy — resolve back to the PDS blob.
  A `customBlock` is the author's own HTML template with its values
  interpolated (and escaped), so it arrives as an `html` block for the consumer
  to sanitize.
- **SkyPress** (`blog.skypress.content.gutenberg`) block bodies are HTML
  fragments. They are parsed into plaintext + facets rather than re-emitted as
  markup, so a renderer never needs an HTML sanitizer. Raw-HTML content formats
  (`org.wordpress.html`, `co.idno.html`, …) are _not_ supported for that reason.

## License

MIT
