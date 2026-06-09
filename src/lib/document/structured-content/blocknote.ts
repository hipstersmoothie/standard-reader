/**
 * Parser for `org.blocknote.document#content` — BlockNote editor blocks.
 * Inline content is `styledText` runs (with a `styles` object) and `link`
 * wrappers; both are converted to AT Proto-style byte facets. Consecutive
 * `bulletListItem` / `numberedListItem` blocks are grouped into one list.
 */
import type { StructuredRenderableBlock, StructuredText } from "./types";

import { utf8ByteLength } from "../../leaflet/utf8";
import { mergeTextRuns, syntheticFacet } from "./text-runs";

export const BLOCKNOTE_CONTENT = "org.blocknote.document#content";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
      return url
        ? {
            alt: typeof props.caption === "string" ? props.caption : undefined,
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
  const blocks = Array.isArray(content.blocks) ? content.blocks : [];

  const result: Array<StructuredRenderableBlock> = [];

  for (const entry of blocks) {
    if (!isRecord(entry)) continue;
    const type = typeof entry.type === "string" ? entry.type : "";
    const kind = listKind(type);

    // Group consecutive items of the same list kind into one list block.
    if (kind) {
      const text = inlineText(entry);
      if (!text) continue;
      const previous = result.at(-1);
      if (kind === "taskList") {
        const item = {
          checked: isRecord(entry.props) && entry.props.checked === true,
          text,
        };
        if (previous?.kind === "taskList") previous.items.push(item);
        else result.push({ items: [item], kind: "taskList" });
      } else if (kind === "bulletList") {
        if (previous?.kind === "bulletList") previous.items.push(text);
        else result.push({ items: [text], kind: "bulletList" });
      } else {
        if (previous?.kind === "orderedList") previous.items.push(text);
        else result.push({ items: [text], kind: "orderedList" });
      }
      continue;
    }

    const block = singleBlock(entry);
    if (block) result.push(block);
  }

  return result;
}
