/**
 * Markdown content formats. Two shapes funnel through here:
 *
 *   · `site.standard.content.markdown` — the canonical Standard Site markdown
 *     block (also what Greengale documents are normalized to on ingest).
 *   · markdown-in-record third-party lexicons (Lemma, wtr, unthread, lichen, …)
 *     whose body is a markdown string under a format-specific key.
 *
 * Every one is parsed with the unified/remark ecosystem
 * (`mdast-util-from-markdown` + GFM) into an mdast tree, then mapped onto the
 * shared {@link StructuredRenderableBlock} vocabulary — the same blocks every
 * framework renderer already consumes, so markdown renders identically across
 * them with no per-format or per-renderer code. Inline emphasis/links become
 * byte-indexed AT-Proto facets, exactly like the ProseMirror/BlockNote parsers.
 */

import type {
  PhrasingContent,
  Root,
  RootContent,
  TableRow as MdTableRow,
} from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { mathFromMarkdown } from "mdast-util-math";
import { gfm } from "micromark-extension-gfm";
import { math } from "micromark-extension-math";

import { isRecord } from "../../internal.js";
import { utf8ByteLength } from "../../leaflet/utf8.js";
import { parseCalloutMarker } from "./callouts.js";
import { mergeTextRuns, syntheticFacet } from "./text-runs.js";
import type {
  StructuredListItem,
  StructuredRenderableBlock,
  StructuredTableCell,
  StructuredText,
} from "./types.js";
import { STANDARD_MARKDOWN_CONTENT } from "./types.js";

type MarkdownExtractor = (content: Record<string, unknown>) => unknown;

const field =
  (key: string): MarkdownExtractor =>
  (content) =>
    content[key];

/**
 * Known markdown content `$type`s → the key holding the raw markdown body.
 * Mirrors the host app's `ALT_MARKDOWN_EXTRACTORS`, plus the canonical
 * `site.standard.content.markdown` block.
 */
const MARKDOWN_EXTRACTORS: Record<string, MarkdownExtractor> = {
  [STANDARD_MARKDOWN_CONTENT]: field("text"),
  "actor.rpg.news#markdown": field("value"),
  "app.blento.markdown": field("value"),
  "app.wtr.content.markdown": field("markdown"),
  "at.unthread.content": field("content"),
  "com.pricelessmisc.content.markdown": field("markdown"),
  "com.scanash.content.markdown": field("markdown"),
  "dev.disnet.blog.content.markdown": field("markdown"),
  "download.darkworld.content.markdown#markdown": field("body"),
  "me.tompscanlan.content.markdown": field("markdown"),
  "net.commoninternet.lichen.content.markdown": field("text"),
  "pub.lemma.blog.entry": field("content"),
  "rip.nate.content.markdown": field("text"),
  "site.standard.document#markdown": field("value"),
};

/** Every markdown content `$type` the parser understands. */
export const MARKDOWN_FORMATS = Object.keys(MARKDOWN_EXTRACTORS);

/** Whether `format` is a known markdown content `$type`. */
export function isMarkdownFormat(format: string | null | undefined): boolean {
  return Boolean(format && format in MARKDOWN_EXTRACTORS);
}

/**
 * Raw markdown body from a markdown `content` payload, or null. The format is
 * resolved from `content.$type`, falling back to the stored `contentFormat`.
 */
export function markdownText(
  content: unknown,
  contentFormat?: string | null,
): string | null {
  if (!isRecord(content)) return null;
  const format =
    typeof content.$type === "string" ? content.$type : contentFormat;
  if (!format) return null;
  const extract = MARKDOWN_EXTRACTORS[format];
  if (!extract) return null;
  const raw = extract(content);
  return typeof raw === "string" && raw.trim() ? raw : null;
}

// ---------------------------------------------------------------------------
// Inline: mdast phrasing content → StructuredText (plaintext + byte facets)
// ---------------------------------------------------------------------------

/** A standalone `<br>` tag, in any of the spellings authors actually write. */
const INLINE_BREAK_HTML = /^<br\s*\/?>$/i;

/**
 * A newline inside a markdown text node is a *soft* wrap — an author hard-
 * wrapping their prose at 80 columns — which CommonMark renders as a space.
 *
 * It has to be flattened here, because a `\n` reaching the plaintext means
 * "hard break" to every renderer downstream (see {@link segmentInline}); a
 * genuine break arrives as a `break` node or a literal `<br>` instead.
 */
function softWrapToSpace(value: string): string {
  return value.includes("\n") ? value.replaceAll(/\r?\n/g, " ") : value;
}

interface InlineRun {
  text: string;
  /** Facet suffix kinds (`bold`, `italic`, `code`, `strikethrough`). */
  kinds: Array<string>;
  link?: string;
  /** Identifier of a footnote referenced immediately after this run. */
  footnoteId?: string;
}

/** Flatten nested phrasing content into styled runs, accumulating marks. */
function collectRuns(
  nodes: Array<PhrasingContent>,
  kinds: Array<string>,
  link: string | undefined,
  out: Array<InlineRun>,
): void {
  for (const node of nodes) {
    switch (node.type) {
      case "text": {
        const text = softWrapToSpace(node.value);
        // A literal `<br>` leaves the newline that ended its line inside *this*
        // node, where the flattening above turns it into a leading space.
        // Indentation at the start of a line is not content, so drop it.
        const afterBreak = out.at(-1)?.text.endsWith("\n") ?? false;
        out.push({
          kinds,
          link,
          text: afterBreak ? text.replace(/^[\t ]+/, "") : text,
        });
        break;
      }
      case "strong": {
        collectRuns(node.children, [...kinds, "bold"], link, out);
        break;
      }
      case "emphasis": {
        collectRuns(node.children, [...kinds, "italic"], link, out);
        break;
      }
      case "delete": {
        collectRuns(node.children, [...kinds, "strikethrough"], link, out);
        break;
      }
      case "inlineCode": {
        out.push({
          kinds: [...kinds, "code"],
          link,
          text: softWrapToSpace(node.value),
        });
        break;
      }
      case "link": {
        collectRuns(node.children, kinds, node.url || link, out);
        break;
      }
      case "break": {
        out.push({ text: "\n", kinds, link });
        break;
      }
      case "html": {
        // Inline HTML carries no text we can faithfully render — except a
        // literal `<br>`, which is how a lot of markdown authors write a hard
        // break. Dropping it silently joined the two lines into one.
        if (INLINE_BREAK_HTML.test(node.value)) {
          out.push({ text: "\n", kinds, link });
        }
        break;
      }
      case "inlineMath": {
        // No inline math node in the vocabulary yet, so keep the TeX source
        // verbatim rather than dropping the expression on the floor.
        out.push({ text: `$${node.value}$`, kinds, link });
        break;
      }
      case "image": {
        // A standalone image becomes its own block (see `mapParagraph`); one
        // sitting inside a sentence keeps its alt text so the meaning survives.
        if (node.alt?.trim()) out.push({ text: node.alt, kinds, link });
        break;
      }
      case "footnoteReference": {
        // A footnote facet spans the text it annotates — the same shape Leaflet
        // uses — so the marker attaches to the run just before it. A reference
        // with no preceding text has nothing to span; the note still renders at
        // the end of the document, it just gets no inline marker.
        const previous = out.at(-1);
        if (previous && previous.text) previous.footnoteId = node.identifier;
        break;
      }
      default: {
        // Anything left (footnote definitions in a paragraph, raw MDX-ish
        // nodes, …) carries no plain body we can faithfully inline — skip it
        // rather than emit noise.
        break;
      }
    }
  }
}

/** Rich text for a run of inline phrasing content. */
function inlineText(nodes: Array<PhrasingContent>): StructuredText {
  const runs: Array<InlineRun> = [];
  collectRuns(nodes, [], undefined, runs);

  let plaintext = "";
  const facets: Array<unknown> = [];
  for (const run of runs) {
    const byteStart = utf8ByteLength(plaintext);
    plaintext += run.text;
    const byteEnd = utf8ByteLength(plaintext);
    const facet = syntheticFacet(byteStart, byteEnd, run.kinds, run.link);

    if (run.footnoteId && byteEnd > byteStart) {
      const feature = {
        $type: "site.standard.richtext.facet#footnote",
        footnoteId: run.footnoteId,
      };
      if (facet) {
        (facet.features as Array<unknown>).push(feature);
        facets.push(facet);
      } else {
        facets.push({ features: [feature], index: { byteEnd, byteStart } });
      }
      continue;
    }
    if (facet) facets.push(facet);
  }
  return facets.length > 0 ? { facets, plaintext } : { plaintext };
}

// ---------------------------------------------------------------------------
// Blocks: mdast content → StructuredRenderableBlock
// ---------------------------------------------------------------------------

/** A paragraph that is a single standalone image (ignoring blank text). */
function paragraphImage(
  children: Array<PhrasingContent>,
): StructuredRenderableBlock | null {
  const meaningful = children.filter(
    (child) => !(child.type === "text" && !child.value.trim()),
  );
  const only = meaningful[0];
  if (meaningful.length === 1 && only?.type === "image") {
    return { alt: only.alt ?? undefined, externalSrc: only.url, kind: "image" };
  }
  return null;
}

/** The item's own paragraphs, joined into one rich-text line. */
function listItemText(item: {
  children: Array<RootContent>;
}): StructuredText | null {
  const texts = item.children.flatMap((child) =>
    child.type === "paragraph"
      ? [inlineText(child.children)].filter((t) => t.plaintext.trim())
      : [],
  );
  if (texts.length === 0) return null;
  if (texts.length === 1) return texts[0];
  const separated = texts.flatMap((text, index) =>
    index === 0 ? [text] : [{ plaintext: "\n" }, text],
  );
  return mergeTextRuns(separated);
}

/**
 * One list item: its own text, plus any lists nested beneath it.
 *
 * Markdown is the one format here that genuinely nests lists, and a nested
 * branch is content — not decoration — so dropping it loses whole passages of a
 * document with nothing to show for it.
 */
function listItem(item: {
  children: Array<RootContent>;
}): StructuredListItem | null {
  const text = listItemText(item);
  const children = item.children.flatMap((child) => {
    if (child.type !== "list") return [];
    const nested = mapList(child);
    return nested ? [nested] : [];
  });

  if (!text) {
    // An item that is only a nested list still has to keep the branch, so it
    // becomes an empty parent rather than disappearing with its children.
    return children.length > 0 ? { children, text: { plaintext: "" } } : null;
  }
  return children.length > 0 ? { children, text } : { text };
}

function mapList(node: {
  ordered?: boolean | null;
  start?: number | null;
  children: Array<{ checked?: boolean | null; children: Array<RootContent> }>;
}): StructuredRenderableBlock | null {
  const isTaskList = node.children.some(
    (item) => typeof item.checked === "boolean",
  );
  if (isTaskList) {
    const items = node.children.flatMap((item) => {
      const text = listItemText(item);
      return text ? [{ checked: item.checked ?? false, text }] : [];
    });
    return items.length > 0 ? { items, kind: "taskList" } : null;
  }
  const items = node.children.flatMap((item) => {
    const parsed = listItem(item);
    return parsed ? [parsed] : [];
  });
  if (items.length === 0) return null;
  return node.ordered
    ? { items, kind: "orderedList", start: node.start ?? undefined }
    : { items, kind: "bulletList" };
}

/**
 * A blockquote opening with `[!TYPE]` is a callout, not a quote.
 *
 * The marker is sliced off the first paragraph and the remaining paragraphs are
 * joined, because the callout node holds a single run of text — the same shape
 * Offprint's callout block uses.
 */
function mapCallout(node: {
  children: Array<RootContent>;
}): StructuredRenderableBlock | null {
  const [first, ...rest] = node.children;
  if (first?.type !== "paragraph") return null;
  const [lead] = first.children;
  if (lead?.type !== "text") return null;

  const marker = parseCalloutMarker(lead.value);
  if (!marker) return null;

  // Re-emit the first paragraph without its marker line. A break sitting right
  // after the marker ends *that* line — an author writing `> [!NOTE]  ` — so it
  // is dropped rather than opening the callout with a blank line.
  const afterMarker = lead.value.slice(marker.matchLength);
  const trailing = first.children.slice(1);
  const bodyStart = afterMarker.trim()
    ? 0
    : trailing.findIndex((child) => child.type !== "break");
  const body: Array<PhrasingContent> = [
    { type: "text", value: afterMarker },
    ...(bodyStart === -1 ? [] : trailing.slice(bodyStart)),
  ];

  const runs = [inlineText(body)].filter((run) => run.plaintext.trim());
  for (const child of rest) {
    if (child.type !== "paragraph") continue;
    const run = inlineText(child.children);
    if (run.plaintext.trim()) runs.push(run);
  }

  const text =
    runs.length === 0
      ? { plaintext: "" }
      : mergeTextRuns(
          runs.flatMap((run, index) =>
            index === 0 ? [run] : [{ plaintext: "\n" }, run],
          ),
        );

  return {
    calloutKind: marker.kind,
    kind: "callout",
    text,
    ...(marker.title ? { title: marker.title } : {}),
    ...(marker.fold ? { fold: marker.fold } : {}),
  };
}

function mapTable(rows: Array<MdTableRow>): StructuredRenderableBlock | null {
  const mapped = rows.map((row, rowIndex) =>
    row.children.map(
      (cell): StructuredTableCell => ({
        isHeader: rowIndex === 0,
        text: inlineText(cell.children),
      }),
    ),
  );
  return mapped.length > 0 ? { kind: "table", rows: mapped } : null;
}

/**
 * A paragraph → its blocks.
 *
 * Usually one text block, but an image inside a paragraph has no inline node to
 * live in, so the paragraph is split around it: prose, image, prose. That keeps
 * the picture (previously dropped outright) at the cost of a line break.
 */
function mapParagraph(
  children: Array<PhrasingContent>,
): Array<StructuredRenderableBlock> {
  const standalone = paragraphImage(children);
  if (standalone) return [standalone];

  const blocks: Array<StructuredRenderableBlock> = [];
  let run: Array<PhrasingContent> = [];

  const flush = () => {
    if (run.length === 0) return;
    const text = inlineText(run);
    if (text.plaintext.trim()) blocks.push({ kind: "text", text });
    run = [];
  };

  for (const child of children) {
    if (child.type === "image" && child.url) {
      flush();
      blocks.push({
        alt: child.alt ?? undefined,
        externalSrc: child.url,
        kind: "image",
      });
      continue;
    }
    run.push(child);
  }
  flush();
  return blocks;
}

function mapBlock(node: RootContent): Array<StructuredRenderableBlock> {
  switch (node.type) {
    case "paragraph": {
      return mapParagraph(node.children);
    }
    case "heading": {
      const text = inlineText(node.children);
      return text.plaintext.trim()
        ? [{ kind: "heading", level: node.depth, text }]
        : [];
    }
    case "blockquote": {
      const callout = mapCallout(node);
      if (callout) return [callout];
      const blocks = node.children.flatMap(mapBlock);
      return blocks.length > 0 ? [{ blocks, kind: "blockquote" }] : [];
    }
    case "thematicBreak": {
      return [{ kind: "horizontalRule" }];
    }
    case "code": {
      return [
        {
          kind: "code",
          language: node.lang ?? undefined,
          plaintext: node.value,
        },
      ];
    }
    case "math": {
      const tex = node.value.trim();
      return tex ? [{ kind: "math", tex }] : [];
    }
    case "html": {
      const html = node.value.trim();
      // Kept verbatim; whether to render it is the host's call — see the
      // `html` node in `nodes.ts`.
      return html ? [{ html, kind: "html" }] : [];
    }
    case "list": {
      const list = mapList(node);
      return list ? [list] : [];
    }
    case "table": {
      const table = mapTable(node.children);
      return table ? [table] : [];
    }
    case "footnoteDefinition": {
      // Collected by `collectFootnotes` and rendered as an endnote instead.
      return [];
    }
    case "image": {
      return [
        { alt: node.alt ?? undefined, externalSrc: node.url, kind: "image" },
      ];
    }
    default: {
      // html, definition, footnoteDefinition, yaml, etc. — nothing to render.
      return [];
    }
  }
}

/** Markdown dialect. `commonmark` drops the GFM extension (tables, task
 *  lists, autolinks, strikethrough). */
export type MarkdownFlavor = "gfm" | "commonmark";

/**
 * Renderable blocks for a raw markdown string, or null when it is blank or
 * parses to nothing. Formats that carry markdown but need normalizing first
 * (Markpub strips front matter and applies facets) go through here rather than
 * {@link markdownBlocks}.
 */
/**
 * A parsed markdown body: its blocks, plus any GFM footnotes.
 *
 * Footnotes need their own channel because they are not blocks — they are
 * endnotes referenced from inline text, and the render tree models them that
 * way (`DocumentTree.footnotes` + `footnoteNumbers`).
 */
export interface MarkdownDocument {
  blocks: Array<StructuredRenderableBlock>;
  footnotes: Array<{ id: string; text: StructuredText }>;
}

/** Recursively find footnote references and definitions in document order. */
function collectFootnotes(tree: Root): MarkdownDocument["footnotes"] {
  const order: Array<string> = [];
  const seen = new Set<string>();
  const definitions = new Map<string, Array<RootContent>>();

  const visit = (nodes: Array<RootContent | PhrasingContent>) => {
    for (const node of nodes) {
      if (node.type === "footnoteReference") {
        if (!seen.has(node.identifier)) {
          seen.add(node.identifier);
          order.push(node.identifier);
        }
        continue;
      }
      if (node.type === "footnoteDefinition") {
        definitions.set(node.identifier, node.children);
        // Visit the body too: a footnote may reference another footnote.
        visit(node.children);
        continue;
      }
      const children = (node as { children?: Array<RootContent> }).children;
      if (Array.isArray(children)) visit(children);
    }
  };
  visit(tree.children);

  // Numbered by first reference, which is the order a reader meets them.
  // A definition nothing refers to is dropped rather than dangling.
  return order.flatMap((id) => {
    const body = definitions.get(id);
    if (!body) return [];
    const runs = body.flatMap((child) =>
      child.type === "paragraph"
        ? [inlineText(child.children)].filter((run) => run.plaintext.trim())
        : [],
    );
    if (runs.length === 0) return [];
    const text =
      runs.length === 1 && runs[0]
        ? runs[0]
        : mergeTextRuns(
            runs.flatMap((run, index) =>
              index === 0 ? [run] : [{ plaintext: "\n" }, run],
            ),
          );
    return [{ id, text }];
  });
}

/** Parse markdown into blocks *and* footnotes. */
export function markdownDocumentFromText(
  text: string,
  flavor: MarkdownFlavor = "gfm",
): MarkdownDocument | null {
  const body = text.trim();
  if (!body) return null;
  const tree = parseMarkdown(body, flavor);
  const blocks = tree.children.flatMap(mapBlock);
  if (blocks.length === 0) return null;
  return { blocks, footnotes: collectFootnotes(tree) };
}

export function markdownBlocksFromText(
  text: string,
  flavor: MarkdownFlavor = "gfm",
): Array<StructuredRenderableBlock> | null {
  return markdownDocumentFromText(text, flavor)?.blocks ?? null;
}

/**
 * Math is its own extension, not part of GFM, so it applies to both flavors.
 * Single-dollar inline math stays enabled to match how these documents render
 * today; it is the reason a bare `$5 … $10` can read as math.
 */
function parseMarkdown(body: string, flavor: MarkdownFlavor): Root {
  return fromMarkdown(
    body,
    flavor === "commonmark"
      ? { extensions: [math()], mdastExtensions: [mathFromMarkdown()] }
      : {
          extensions: [gfm(), math()],
          mdastExtensions: [gfmFromMarkdown(), mathFromMarkdown()],
        },
  );
}

/**
 * Renderable blocks for a markdown `content` payload, or null when the format
 * isn't markdown or the body is empty. Registered for every
 * {@link MARKDOWN_FORMATS} entry so {@link structuredFormatBlocks} — and thus
 * `buildRenderTree` — handles markdown like any other structured format.
 */
export function markdownBlocks(
  content: unknown,
  contentFormat?: string | null,
): Array<StructuredRenderableBlock> | null {
  const text = markdownText(content, contentFormat);
  if (!text) return null;
  return markdownBlocksFromText(text);
}
