# @standard-reader/converter

Convert the `content` of a Standard Site document between the four formats that
carry most of the network's long-form writing — **Leaflet**, **Offprint**,
**pckt** and **Markpub** — and get a per-block account of what the conversion
costs.

```bash
npm install @standard-reader/converter
```

```ts
import { convertDocumentContent } from "@standard-reader/converter";

const result = convertDocumentContent({
  content: record.content, // the document record's content union
  authorDid: "did:plc:…", // the repo hosting its image blobs
  target: "pckt",
});

if (result.lossless) {
  await putRecord({ ...record, content: result.content });
} else {
  for (const issue of result.issues) {
    console.log(
      `[${issue.severity}] block ${issue.blockIndex}: ${issue.message}`,
    );
  }
}
```

## Why the issue list is the point

Format conversion between these four is not a re-encoding — the formats do not
describe the same set of things. pckt has tables; Leaflet does not. Leaflet has
footnotes; nobody else does. Offprint list items hold a single line of text, so
a nested list has nowhere to go. Markdown has no underline.

So a converter that returns only a payload is hiding the interesting half of the
answer. Every conversion here returns a `ConversionResult` whose `issues` say,
per block, what changed and what disappeared:

```ts
interface ConversionIssue {
  severity: "lossy" | "unsupported";
  code: string; // block-unsupported, facet-dropped, blob-to-url, …
  blockIndex: number | null;
  blockType: string;
  message: string;
  fallback?: string; // what was emitted instead, when anything was
}
```

`lossy` means the words survive and something about their presentation does not
— a callout becomes a plain blockquote, a caption is dropped, a highlight goes
unstyled. `unsupported` means the block is not in the output at all. That
distinction is the one a caller should branch on before overwriting anything:

```ts
const willLoseContent = result.issues.some((i) => i.severity === "unsupported");
```

`summarizeIssues()` groups the list for display, so a document with forty
highlighted spans reads as one line rather than forty.

## How it works

Conversion reuses [`@standard-reader/renderer-core`][core] rather than writing
format-to-format mappings. Core already parses _every_ content format Standard
Reader understands into a single `DocumentTree`; this package re-emits that tree
into a target format's vocabulary.

```
  any source format ──► buildRenderTree() ──► DocumentTree ──► emitter ──► target
  (Leaflet, pckt, Offprint, Markpub,          (renderer-core)
   markdown, ProseMirror, BlockNote,
   Gutenberg, …)
```

Two consequences worth knowing:

- **Sources are not limited to the four targets.** Anything core can parse —
  markdown-in-record, ProseMirror, BlockNote, Gutenberg — converts _into_ the
  four. Adding a source format to core makes it convertible here for free.
- **Inline formatting is preserved by rewriting `$type`s, not re-parsing.** All
  four dialects store facets the same way (byte-indexed ranges over the block's
  plaintext), so byte offsets and text pass through untouched and only the
  feature names change. Markpub is the exception — it is markdown, so inline
  formatting becomes syntax.

## What survives

`standard-reader formats` prints this table; `BLOCK_SUPPORT` is the same data.

| block          | Leaflet | Offprint | pckt | Markpub |
| -------------- | :-----: | :------: | :--: | :-----: |
| paragraph      |    ✓    |    ✓     |  ✓   |    ✓    |
| heading        |    ✓    |    ✓     |  ✓   |    ✓    |
| blockquote     |    ✓    |    ✓     |  ✓   |    ✓    |
| callout        |    ~    |    ✓     |  ~   |    ~    |
| lists          |    ✓    |    ✓     |  ✓   |    ✓    |
| task list      |    ~    |    ✓     |  ✓   |    ✓    |
| code           |    ✓    |    ✓     |  ✓   |    ✓    |
| image          |    ✓    |    ✓     |  ✓   |    ✓    |
| table          |    ✗    |    ✗     |  ✓   |    ✓    |
| math           |    ✓    |    ✓     |  ~   |    ~    |
| button         |    ✓    |    ✓     |  ~   |    ~    |
| iframe / embed |    ✓    |    ✓     |  ✓   |    ~    |
| HTML embed     |    ✓    |    ✗     |  ✗   |    ~    |
| bookmark card  |    ✓    |    ✓     |  ✓   |    ~    |
| Bluesky post   |    ✓    |    ✓     |  ✓   |    ~    |
| image grid     |    ✓    |    ✓     |  ~   |    ~    |
| image diff     |    ~    |    ✓     |  ~   |    ~    |
| footnotes      |    ✓    |    ✗     |  ✗   |    ~    |

✓ carried as-is · ~ converted with some loss · ✗ cannot be carried

Platform-specific blocks — a Leaflet poll or signup, a pckt gallery or note
embed, an Offprint component — are backed by records outside the document, so
they only survive within their own platform.

### Images

Images move by **blob reference**, not by URL: a converted record points at the
same blob in the same repo, with no re-upload. Markpub is the exception —
markdown cannot reference a repo blob, so a blob-backed image is rewritten to
its Bluesky CDN URL and a `blob-to-url` issue is filed.

This is why the render tree carries `ImageSource` alongside the resolved `src`
(see `nodes.ts` in core): renderers only need the URL, but a converter needs the
blob back.

## API

| Export                       | What it does                                                    |
| ---------------------------- | --------------------------------------------------------------- |
| `convertDocumentContent()`   | Convert one document's content; returns a `ConversionResult`    |
| `summarizeIssues()`          | Group an issue list for display                                 |
| `BLOCK_SUPPORT`              | The capability matrix, per target and block type                |
| `blockSupport(target, type)` | One entry from it                                               |
| `FOOTNOTE_SUPPORT`           | Per-target footnote support                                     |
| `targetForContentType()`     | The target a `$type` already is, for skipping no-op conversions |
| `remapRichText()`            | Rewrite one run of rich text into a target's facet dialect      |
| `canonicalFacetKind()`       | Normalize a facet feature across dialect spellings              |

`ConversionResult.unchanged` is `true` when the document is already in the
target format; `lossless` is `true` when output was produced and nothing was
dropped.

## Caveat: inferred Offprint shapes

Offprint's list-item and grid-image fragment names (`…#listItem`,
`…#taskItem`, `…#gridImage`) are inferred from the shape its published records
take, since its lexicons are not vendored in this repo. They are isolated in one
constant per emitter (`src/targets/offprint.ts`), and the same caution is why
the Offprint facet dialect is limited to the features seen in the wild —
emitting a `$type` Offprint does not define would produce a record it cannot
read.

## Development

```bash
pnpm --filter @standard-reader/converter test
pnpm --filter @standard-reader/converter typecheck
```

`src/__tests__/support.test.ts` runs every block type through every target and
asserts the emitters agree with the capability matrix — so a warning can never
disagree with what actually got written.

[core]: ../renderer-core
