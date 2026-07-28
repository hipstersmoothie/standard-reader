import { isRecord } from "../../internal.js";
import { utf8ByteLength } from "../../leaflet/utf8.js";
import { normalizeImageAlt } from "./image.js";
import { mergeTextRuns, syntheticFacet } from "./text-runs.js";
/**
 * Parser for `org.blocknote.document#content` — BlockNote editor blocks.
 * Inline content is `styledText` runs (with a `styles` object) and `link`
 * wrappers; both are converted to AT Proto-style byte facets. Consecutive
 * `bulletListItem` / `numberedListItem` blocks are grouped into one list.
 */
import type {
  StructuredListItem,
  StructuredRenderableBlock,
  StructuredText,
} from "./types.js";

export const BLOCKNOTE_CONTENT = "org.blocknote.document#content";

const STYLE_KINDS: Record<string, string> = {
  bold: "bold",
  code: "code",
  italic: "italic",
  strike: "strikethrough",
  underline: "underline",
};

function styleKinds(styles: unknown): Array<string> {
  if (!isRecord(styles)) return [];
  return Object.entries(STYLE_KINDS).flatMap(([style, kind]) =>
    styles[style] === true ? [kind] : [],
  );
}

function runText(run: Record<string, unknown>, linkUri?: string) {
  if (run.type !== "text" || typeof run.text !== "string") return null;
  const kinds = styleKinds(run.styles);
  const facet = syntheticFacet(0, utf8ByteLength(run.text), kinds, linkUri);
  const text: StructuredText = facet
    ? { facets: [facet], plaintext: run.text }
    : { plaintext: run.text };
  return text;
}

/** Flatten BlockNote `inlineContent` (styled text + links) to StructuredText. */
function inlineText(block: Record<string, unknown>): StructuredText | null {
  const inline = Array.isArray(block.inlineContent) ? block.inlineContent : [];
  const runs: Array<StructuredText> = [];

  for (const entry of inline) {
    if (!isRecord(entry)) continue;
    if (entry.type === "link") {
      const href = typeof entry.href === "string" ? entry.href : undefined;
      const children = Array.isArray(entry.content) ? entry.content : [];
      for (const child of children) {
        if (!isRecord(child)) continue;
        const text = runText(child, href);
        if (text) runs.push(text);
      }
      continue;
    }
    const text = runText(entry);
    if (text) runs.push(text);
  }

  if (runs.length === 0) return null;
  const merged = mergeTextRuns(runs);
  return merged.plaintext.trim() ? merged : null;
}

type ListKind = "bulletList" | "orderedList" | "taskList";

function listKind(type: string): ListKind | null {
  if (type === "bulletListItem") return "bulletList";
  if (type === "numberedListItem") return "orderedList";
  if (type === "checkListItem") return "taskList";
  return null;
}

function singleBlock(
  value: Record<string, unknown>,
): StructuredRenderableBlock | null {
  const type = typeof value.type === "string" ? value.type : "";
  const props = isRecord(value.props) ? value.props : {};

  switch (type) {
    case "paragraph": {
      const text = inlineText(value);
      return text ? { kind: "text", text } : null;
    }
    case "heading": {
      const text = inlineText(value);
      return text
        ? {
            kind: "heading",
            level: typeof props.level === "number" ? props.level : undefined,
            text,
          }
        : null;
    }
    case "quote": {
      const text = inlineText(value);
      return text
        ? { blocks: [{ kind: "text", text }], kind: "blockquote" }
        : null;
    }
    case "codeBlock": {
      const text = inlineText(value);
      return text
        ? {
            kind: "code",
            language:
              typeof props.language === "string" ? props.language : undefined,
            plaintext: text.plaintext,
          }
        : null;
    }
    case "image": {
      const url = typeof props.url === "string" ? props.url : null;
      const alt = normalizeImageAlt(
        typeof props.alt === "string" ? props.alt : undefined,
        typeof props.caption === "string" ? props.caption : undefined,
        typeof props.name === "string" ? props.name : undefined,
      );
      return url
        ? {
            alt: alt || undefined,
            externalSrc: url,
            kind: "image",
          }
        : null;
    }
    default: {
      // Unrecognized block with text content still renders as a paragraph.
      const text = inlineText(value);
      if (text) return { kind: "text", text };
      return type ? { blockType: type, kind: "unknown" } : null;
    }
  }
}

/** Renderable blocks for an `org.blocknote.document#content` payload. */
export function blocknoteBlocks(
  content: unknown,
  contentFormat?: string | null,
): Array<StructuredRenderableBlock> {
  if (!isRecord(content)) return [];
  const format =
    typeof content.$type === "string" ? content.$type : contentFormat;
  if (format !== BLOCKNOTE_CONTENT) return [];
  return blocksFrom(Array.isArray(content.blocks) ? content.blocks : []);
}

/**
 * BlockNote nests by hanging a `children` array off the parent block rather
 * than inside the list, so a sub-list is a child of the item above it. Parsing
 * only the top level (as this did before `StructuredListItem` grew `children`)
 * dropped every indented branch.
 */
function blocksFrom(entries: Array<unknown>): Array<StructuredRenderableBlock> {
  const result: Array<StructuredRenderableBlock> = [];

  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const type = typeof entry.type === "string" ? entry.type : "";
    const kind = listKind(type);
    const children = blocksFrom(
      Array.isArray(entry.children) ? entry.children : [],
    );

    // Group consecutive items of the same list kind into one list block.
    if (kind) {
      const text = inlineText(entry);
      if (!text) {
        // An empty item still carries its subtree — keep the content.
        result.push(...children);
        continue;
      }
      const previous = result.at(-1);
      if (kind === "taskList") {
        // `taskList` items have no `children` in the vocabulary, so a subtree
        // under a checklist item follows the list instead of nesting in it.
        const item = {
          checked: isRecord(entry.props) && entry.props.checked === true,
          text,
        };
        if (previous?.kind === "taskList") previous.items.push(item);
        else result.push({ items: [item], kind: "taskList" });
        result.push(...children);
      } else {
        const item: StructuredListItem = { text };
        if (children.length > 0) item.children = children;
        if (previous?.kind === kind) previous.items.push(item);
        else result.push({ items: [item], kind });
      }
      continue;
    }

    const block = singleBlock(entry);
    if (block) result.push(block);
    result.push(...children);
  }

  return result;
}
