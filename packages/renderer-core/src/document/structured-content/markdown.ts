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
import { gfm } from "micromark-extension-gfm";

import { isRecord } from "../../internal";
import { utf8ByteLength } from "../../leaflet/utf8";
import { mergeTextRuns, syntheticFacet } from "./text-runs";
import type {
  StructuredRenderableBlock,
  StructuredTableCell,
  StructuredText,
} from "./types";
import { STANDARD_MARKDOWN_CONTENT } from "./types";

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

interface InlineRun {
  text: string;
  /** Facet suffix kinds (`bold`, `italic`, `code`, `strikethrough`). */
  kinds: Array<string>;
  link?: string;
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
        out.push({ text: node.value, kinds, link });
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
        out.push({ text: node.value, kinds: [...kinds, "code"], link });
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
      default: {
        // image (inline), html, footnoteReference, etc. carry no plain body
        // we can faithfully inline — skip rather than emit noise.
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
    const facet = syntheticFacet(
      byteStart,
      utf8ByteLength(plaintext),
      run.kinds,
      run.link,
    );
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

/** Flatten one list item to a single rich-text line (nested lists dropped —
 *  the structured list vocabulary is flat, matching the other parsers). */
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
    const text = listItemText(item);
    return text ? [text] : [];
  });
  if (items.length === 0) return null;
  return node.ordered
    ? { items, kind: "orderedList", start: node.start ?? undefined }
    : { items, kind: "bulletList" };
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

function mapBlock(node: RootContent): Array<StructuredRenderableBlock> {
  switch (node.type) {
    case "paragraph": {
      const image = paragraphImage(node.children);
      if (image) return [image];
      const text = inlineText(node.children);
      return text.plaintext.trim() ? [{ kind: "text", text }] : [];
    }
    case "heading": {
      const text = inlineText(node.children);
      return text.plaintext.trim()
        ? [{ kind: "heading", level: node.depth, text }]
        : [];
    }
    case "blockquote": {
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
    case "list": {
      const list = mapList(node);
      return list ? [list] : [];
    }
    case "table": {
      const table = mapTable(node.children);
      return table ? [table] : [];
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
  const tree: Root = fromMarkdown(text, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  const blocks = tree.children.flatMap(mapBlock);
  return blocks.length > 0 ? blocks : null;
}
