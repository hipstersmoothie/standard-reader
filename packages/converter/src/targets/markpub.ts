/**
 * Emit `at.markpub.markdown`.
 *
 * Markpub is the odd one out: its body is markdown source, not a block array,
 * so inline formatting stops being byte-indexed facets and becomes syntax. That
 * makes it the most portable target and the least precise one — underline and
 * highlight have no markdown spelling, and a blob-backed image has to be
 * rewritten as a CDN URL because markdown cannot reference a repo blob.
 *
 * The record is written with `flavor: "gfm"` because the emitter uses GFM
 * tables, task lists, strikethrough and footnotes.
 */

import type {
  BlockNode,
  CollectionImage,
  DocumentTree,
  InlineNode,
  ListItem,
  RichText,
} from "@standard-reader/renderer-core";
import {
  MARKPUB_MARKDOWN,
  MARKPUB_TEXT,
  segmentInline,
} from "@standard-reader/renderer-core";

import type { EmitContext } from "../emit.js";
import { admit, hasImageSource, noteDropped } from "../emit.js";
import { bskyAppUrl } from "../internal.js";

interface Ctx extends EmitContext {
  blockIndex: number | null;
  footnoteNumbers: ReadonlyMap<string, number>;
  /** Marks encountered that markdown cannot express, reported once per block. */
  droppedMarks: Set<string>;
  /** True once a `$$…$$` block is emitted, so `latex` is declared. */
  usedLatex: boolean;
}

// ---------------------------------------------------------------------------
// Inline
// ---------------------------------------------------------------------------

/** Escape the characters that would otherwise start markdown syntax. */
function escapeInline(value: string): string {
  return value.replaceAll(/([\\`*_[\]~<>|])/g, String.raw`\$1`);
}

/** Wrap inline code in a fence long enough to contain any backticks inside. */
function inlineCode(value: string): string {
  let longest = 0;
  for (const match of value.matchAll(/`+/g)) {
    longest = Math.max(longest, match[0].length);
  }
  const fence = "`".repeat(longest + 1);
  const pad = value.startsWith("`") || value.endsWith("`") ? " " : "";
  return `${fence}${pad}${value}${pad}${fence}`;
}

function inlineToMarkdown(nodes: Array<InlineNode>, ctx: Ctx): string {
  let out = "";
  for (const node of nodes) {
    switch (node.type) {
      case "text": {
        out += escapeInline(node.value);
        break;
      }
      case "mark": {
        const inner = inlineToMarkdown(node.children, ctx);
        switch (node.mark) {
          case "strong": {
            out += `**${inner}**`;
            break;
          }
          case "emphasis": {
            out += `*${inner}*`;
            break;
          }
          case "strikethrough": {
            out += `~~${inner}~~`;
            break;
          }
          case "code": {
            out += inlineCode(plainOf(node.children));
            break;
          }
          case "underline":
          case "highlight": {
            ctx.droppedMarks.add(node.mark);
            out += inner;
            break;
          }
        }
        break;
      }
      case "link": {
        out += `[${inlineToMarkdown(node.children, ctx)}](${encodeUrl(node.href)})`;
        break;
      }
      case "mention": {
        const label = inlineToMarkdown(node.children, ctx);
        if (node.did) {
          out += `[${label}](https://bsky.app/profile/${node.did})`;
        } else {
          // An `at://` record mention has no web address to link to.
          ctx.droppedMarks.add("mention");
          out += label;
        }
        break;
      }
      case "footnoteRef": {
        const number =
          node.number ?? ctx.footnoteNumbers.get(node.footnoteId) ?? null;
        if (number != null) out += `[^${number}]`;
        break;
      }
    }
  }
  return out;
}

/** The raw text of an inline subtree, for contexts that take no markup. */
function plainOf(nodes: Array<InlineNode>): string {
  let out = "";
  for (const node of nodes) {
    switch (node.type) {
      case "text": {
        out += node.value;
        break;
      }
      case "mark":
      case "link":
      case "mention": {
        out += plainOf(node.children);
        break;
      }
      case "footnoteRef": {
        break;
      }
    }
  }
  return out;
}

/** Markdown link destinations cannot contain spaces or parentheses bare. */
function encodeUrl(url: string): string {
  return url
    .replaceAll(" ", "%20")
    .replaceAll("(", "%28")
    .replaceAll(")", "%29");
}

function richTextToMarkdown(text: RichText, ctx: Ctx): string {
  return inlineToMarkdown(segmentInline(text, ctx.footnoteNumbers), ctx);
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

function indent(value: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return value
    .split("\n")
    .map((line) => (line ? `${pad}${line}` : line))
    .join("\n");
}

function listToMarkdown(
  ctx: Ctx,
  items: Array<ListItem>,
  ordered: boolean,
  start: number,
): string {
  const lines: Array<string> = [];
  for (const [index, item] of items.entries()) {
    const marker = ordered ? `${start + index}. ` : "- ";
    const body = item.runs
      .map((run) => richTextToMarkdown(run, ctx))
      .join("\n");
    lines.push(`${marker}${body}`);
    for (const child of item.children) {
      const nested = blockToMarkdown(ctx, child);
      if (nested) lines.push(indent(nested, marker.length));
    }
  }
  return lines.join("\n");
}

function imageToMarkdown(
  ctx: Ctx,
  node: BlockNode,
  image: CollectionImage | Extract<BlockNode, { type: "image" }>,
  alt: string,
): string | null {
  if (!image.src) return null;
  if (image.source?.blob != null && !image.source.externalSrc) {
    ctx.report({
      blockIndex: ctx.blockIndex,
      blockType: node.type,
      code: "blob-to-url",
      message:
        "Markdown cannot reference a repo blob, so the image now points at " +
        "the Bluesky CDN URL for that blob",
      severity: "lossy",
      fallback: image.src,
    });
  }
  return `![${escapeInline(alt)}](${encodeUrl(image.src)})`;
}

/** Escape the cell separator so a cell's own text cannot split the row. */
function cell(value: string): string {
  return value.replaceAll("|", String.raw`\|`);
}

function tableToMarkdown(
  ctx: Ctx,
  node: Extract<BlockNode, { type: "table" }>,
): string | null {
  const rows = node.rows.filter((row) => row.length > 0);
  const first = rows[0];
  if (!first) return null;

  const width = Math.max(...rows.map((row) => row.length));
  const renderRow = (values: Array<string>) =>
    `| ${Array.from({ length: width }, (_, i) => cell(values[i] ?? "")).join(" | ")} |`;

  // GFM requires a header row; when the source had none, lead with a blank one.
  const headerIsReal = first.some((entry) => entry.header);
  const header = headerIsReal
    ? first.map((entry) => richTextToMarkdown(entry.text, ctx))
    : Array.from({ length: width }, () => "");
  const bodyRows = headerIsReal ? rows.slice(1) : rows;

  if (!headerIsReal) {
    noteDropped(
      ctx,
      node,
      ctx.blockIndex,
      "GFM tables require a header row and the source table had none",
      "an empty header row is added above the data",
    );
  }

  const lines = [
    renderRow(header),
    `| ${Array.from({ length: width }, () => "---").join(" | ")} |`,
    ...bodyRows.map((row) =>
      renderRow(row.map((entry) => richTextToMarkdown(entry.text, ctx))),
    ),
  ];
  return lines.join("\n");
}

function linkLine(label: string, href: string): string {
  return `[${escapeInline(label)}](${encodeUrl(href)})`;
}

/** One source block → a markdown fragment, or null when it emits nothing. */
function blockToMarkdown(ctx: Ctx, node: BlockNode): string | null {
  switch (node.type) {
    case "paragraph": {
      const body = richTextToMarkdown(node.text, ctx);
      return body.trim() ? body : null;
    }
    case "heading": {
      const level = Math.min(6, Math.max(1, node.level));
      return `${"#".repeat(level)} ${richTextToMarkdown(node.text, ctx)}`;
    }
    case "blockquote": {
      return node.paragraphs
        .map((paragraph) => `> ${richTextToMarkdown(paragraph, ctx)}`)
        .join("\n>\n");
    }
    case "callout": {
      const body = richTextToMarkdown(node.text, ctx);
      return `> ${node.emoji ? `${node.emoji} ` : ""}${body}`;
    }
    case "horizontalRule":
    case "leaflet.separator": {
      return "---";
    }
    case "bulletList": {
      return listToMarkdown(ctx, node.items, false, 1);
    }
    case "orderedList": {
      return listToMarkdown(ctx, node.items, true, node.start ?? 1);
    }
    case "taskList": {
      return node.items
        .map((item) => {
          const body = item.runs
            .map((run) => richTextToMarkdown(run, ctx))
            .join(" ");
          return `- [${item.checked ? "x" : " "}] ${body}`;
        })
        .join("\n");
    }
    case "code": {
      // Fence long enough that the body cannot close it early.
      let longest = 2;
      for (const match of node.code.matchAll(/^`{3,}/gm)) {
        longest = Math.max(longest, match[0].length);
      }
      const fence = "`".repeat(longest + 1);
      return `${fence}${node.language ?? ""}\n${node.code}\n${fence}`;
    }
    case "image": {
      const image = imageToMarkdown(ctx, node, node, node.alt);
      if (!image) return null;
      return node.caption
        ? `${image}\n\n*${escapeInline(node.caption)}*`
        : image;
    }
    case "iframe": {
      return linkLine(node.url, node.url);
    }
    case "website": {
      return linkLine(node.title?.trim() || node.src, node.src);
    }
    case "table": {
      return tableToMarkdown(ctx, node);
    }
    case "math": {
      ctx.usedLatex = true;
      return `$$\n${node.tex}\n$$`;
    }
    case "button": {
      return linkLine(node.text, node.href);
    }
    case "blueskyEmbed": {
      const url = bskyAppUrl(node.postUri);
      if (!url) {
        ctx.report({
          blockIndex: ctx.blockIndex,
          blockType: node.type,
          code: "embed-unlinkable",
          message:
            "The embedded post's AT-URI does not map to a bsky.app address, " +
            "so there is no link to fall back to",
          severity: "unsupported",
        });
        return null;
      }
      return linkLine("View post on Bluesky", url);
    }
    case "imageGrid":
    case "imageCarousel": {
      const images = node.images
        .filter((image) => hasImageSource(image) || image.src)
        .flatMap((image) => {
          const md = imageToMarkdown(ctx, node, image, image.alt);
          return md ? [md] : [];
        });
      if (images.length === 0) return null;
      return node.caption
        ? `${images.join("\n\n")}\n\n*${escapeInline(node.caption)}*`
        : images.join("\n\n");
    }
    case "imageDiff": {
      const [beforeLabel, afterLabel] = node.labels ?? [];
      const parts = [
        imageToMarkdown(
          ctx,
          node,
          node.before,
          node.before.alt || beforeLabel || "before",
        ),
        imageToMarkdown(
          ctx,
          node,
          node.after,
          node.after.alt || afterLabel || "after",
        ),
      ].filter((part): part is string => part != null);
      if (parts.length === 0) return null;
      return node.caption
        ? `${parts.join("\n\n")}\n\n*${escapeInline(node.caption)}*`
        : parts.join("\n\n");
    }
    case "leaflet.pageEmbed": {
      const parts = node.children.flatMap((child) => {
        if (!admit(ctx, child, ctx.blockIndex)) return [];
        const md = blockToMarkdown(ctx, child);
        return md ? [md] : [];
      });
      return parts.length > 0 ? parts.join("\n\n") : null;
    }
    default: {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export function toMarkpub(
  tree: DocumentTree,
  base: EmitContext,
): Record<string, unknown> | null {
  const shared = {
    ...base,
    footnoteNumbers: tree.footnoteNumbers,
    usedLatex: false,
  };
  const parts: Array<string> = [];

  for (const [blockIndex, node] of tree.children.entries()) {
    const ctx: Ctx = { ...shared, blockIndex, droppedMarks: new Set() };
    if (!admit(ctx, node, blockIndex)) continue;
    const markdown = blockToMarkdown(ctx, node);
    if (markdown?.trim()) parts.push(markdown);
    shared.usedLatex ||= ctx.usedLatex;
    reportDroppedMarks(ctx, node, blockIndex);
  }

  if (parts.length === 0) return null;

  // Leaflet footnotes become GFM footnote definitions at the end of the body.
  if (tree.footnotes.length > 0) {
    const ctx: Ctx = {
      ...shared,
      blockIndex: null,
      droppedMarks: new Set(),
    };
    const definitions = tree.footnotes
      .map((note) => `[^${note.number}]: ${richTextToMarkdown(note.text, ctx)}`)
      .join("\n");
    parts.push(definitions);
  }

  const extensions: Array<string> = [];
  if (shared.usedLatex) extensions.push("latex");

  return {
    $type: MARKPUB_MARKDOWN,
    flavor: "gfm",
    ...(extensions.length > 0 ? { extensions } : {}),
    text: { $type: MARKPUB_TEXT, markdown: parts.join("\n\n") },
  };
}

const MARK_LABEL: Record<string, string> = {
  highlight: "highlighted text",
  mention: "a record mention",
  underline: "underlined text",
};

function reportDroppedMarks(
  ctx: Ctx,
  node: BlockNode,
  blockIndex: number,
): void {
  for (const mark of ctx.droppedMarks) {
    ctx.report({
      blockIndex,
      blockType: node.type,
      code: "facet-dropped",
      message: `markdown has no syntax for ${MARK_LABEL[mark] ?? mark}`,
      severity: "lossy",
      fallback: "the text is kept, unstyled",
    });
  }
}
