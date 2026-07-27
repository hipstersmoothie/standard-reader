/**
 * Emit `blog.pckt.content`.
 *
 * pckt is ProseMirror-shaped: a flat `items[]` whose containers nest through
 * `content` arrays. It is the only one of the four with a real table block, and
 * the only one whose galleries live in a separate record — so image grids
 * arriving from another format have to be unrolled into ordinary images.
 */

import type {
  BlockNode,
  CollectionImage,
  DocumentTree,
  ListItem,
  RichText,
} from "@standard-reader/renderer-core";
import { PCKT_CONTENT } from "@standard-reader/renderer-core";

import type { EmitContext } from "../emit.js";
import {
  admit,
  aspectRatio,
  hasImageSource,
  imageBlob,
  noteDropped,
  noteMissingPostCid,
} from "../emit.js";
import { remapRichText } from "../facets.js";
import {
  compact,
  joinRichText,
  prefixRichText,
  utf8ByteLength,
} from "../internal.js";

const BLOCK = {
  blockquote: "blog.pckt.block.blockquote",
  blueskyEmbed: "blog.pckt.block.blueskyEmbed",
  bulletList: "blog.pckt.block.bulletList",
  codeBlock: "blog.pckt.block.codeBlock",
  gallery: "blog.pckt.block.gallery",
  heading: "blog.pckt.block.heading",
  horizontalRule: "blog.pckt.block.horizontalRule",
  iframe: "blog.pckt.block.iframe",
  image: "blog.pckt.block.image",
  listItem: "blog.pckt.block.listItem",
  noteEmbed: "blog.pckt.block.noteEmbed",
  orderedList: "blog.pckt.block.orderedList",
  table: "blog.pckt.block.table",
  tableCell: "blog.pckt.block.tableCell",
  tableHeader: "blog.pckt.block.tableHeader",
  tableRow: "blog.pckt.block.tableRow",
  taskItem: "blog.pckt.block.taskItem",
  taskList: "blog.pckt.block.taskList",
  text: "blog.pckt.block.text",
  website: "blog.pckt.block.website",
} as const;

type Block = Record<string, unknown>;

interface Ctx extends EmitContext {
  blockIndex: number | null;
}

function text(ctx: Ctx, node: BlockNode, run: RichText): Block {
  return {
    $type: BLOCK.text,
    ...remapRichText(run, {
      blockIndex: ctx.blockIndex,
      blockType: node.type,
      report: ctx.report,
      target: "pckt",
    }),
  };
}

function listBlock(
  ctx: Ctx,
  node: BlockNode,
  items: Array<ListItem>,
  kind: "bullet" | "ordered",
  start?: number,
): Block | null {
  const content = items.flatMap((item) => {
    const inner: Array<Block> = item.runs.map((run) => text(ctx, node, run));
    for (const child of item.children) {
      if (child.type === "bulletList") {
        const nested = listBlock(ctx, node, child.items, "bullet");
        if (nested) inner.push(nested);
      } else if (child.type === "orderedList") {
        const nested = listBlock(
          ctx,
          node,
          child.items,
          "ordered",
          child.start,
        );
        if (nested) inner.push(nested);
      }
    }
    return inner.length > 0 ? [{ $type: BLOCK.listItem, content: inner }] : [];
  });
  if (content.length === 0) return null;
  return compact({
    $type: kind === "ordered" ? BLOCK.orderedList : BLOCK.bulletList,
    content,
    start: kind === "ordered" ? start : undefined,
  });
}

function imageBlock(
  ctx: Ctx,
  node: BlockNode,
  image: CollectionImage | Extract<BlockNode, { type: "image" }>,
  alt: string,
): Block | null {
  const source = image.source;
  if (source?.externalSrc) {
    return {
      $type: BLOCK.image,
      attrs: compact({
        alt: alt || undefined,
        aspectRatio: aspectRatio(image),
        src: source.externalSrc,
      }),
    };
  }
  const blob = imageBlob(image);
  if (blob == null) {
    noteDropped(
      ctx,
      node,
      ctx.blockIndex,
      "the image carries neither a repo blob nor an external URL",
    );
    return null;
  }
  return {
    $type: BLOCK.image,
    attrs: compact({
      alt: alt || undefined,
      aspectRatio: aspectRatio(image),
      blob,
    }),
  };
}

/** pckt galleries live in their own record, so collections unroll to images. */
function unrollImages(
  ctx: Ctx,
  node: BlockNode,
  images: Array<CollectionImage>,
  caption: string | undefined,
): Array<Block> {
  const blocks = images.flatMap((image) => {
    if (!hasImageSource(image)) return [];
    const block = imageBlock(ctx, node, image, image.alt);
    return block ? [block] : [];
  });
  if (blocks.length > 0 && caption) {
    blocks.push({ $type: BLOCK.text, plaintext: caption });
  }
  return blocks;
}

function tableBlock(
  ctx: Ctx,
  node: Extract<BlockNode, { type: "table" }>,
): Block | null {
  const rows = node.rows.flatMap((row) => {
    const cells = row.map((cell) => ({
      $type: cell.header ? BLOCK.tableHeader : BLOCK.tableCell,
      content: [text(ctx, node, cell.text)],
    }));
    return cells.length > 0 ? [{ $type: BLOCK.tableRow, content: cells }] : [];
  });
  return rows.length > 0 ? { $type: BLOCK.table, content: rows } : null;
}

function emitBlock(ctx: Ctx, node: BlockNode): Array<Block> {
  switch (node.type) {
    case "paragraph": {
      return [text(ctx, node, node.text)];
    }
    case "heading": {
      return [
        {
          $type: BLOCK.heading,
          level: Math.min(6, Math.max(1, node.level)),
          ...remapRichText(node.text, {
            blockIndex: ctx.blockIndex,
            blockType: node.type,
            report: ctx.report,
            target: "pckt",
          }),
        },
      ];
    }
    case "blockquote": {
      return [
        {
          $type: BLOCK.blockquote,
          content: node.paragraphs.map((paragraph) =>
            text(ctx, node, paragraph),
          ),
        },
      ];
    }
    case "callout": {
      const run = node.emoji
        ? (prefixRichText(node.text, `${node.emoji} `) as RichText)
        : node.text;
      return [{ $type: BLOCK.blockquote, content: [text(ctx, node, run)] }];
    }
    case "horizontalRule":
    case "leaflet.separator": {
      return [{ $type: BLOCK.horizontalRule }];
    }
    case "bulletList": {
      const block = listBlock(ctx, node, node.items, "bullet");
      return block ? [block] : [];
    }
    case "orderedList": {
      const block = listBlock(ctx, node, node.items, "ordered", node.start);
      return block ? [block] : [];
    }
    case "taskList": {
      const content = node.items.map((item) => ({
        $type: BLOCK.taskItem,
        attrs: { checked: item.checked },
        content: [text(ctx, node, joinRichText(item.runs))],
      }));
      return content.length > 0 ? [{ $type: BLOCK.taskList, content }] : [];
    }
    case "code": {
      return [
        compact({
          $type: BLOCK.codeBlock,
          language: node.language,
          plaintext: node.code,
        }),
      ];
    }
    case "image": {
      if (node.caption) {
        noteDropped(
          ctx,
          node,
          ctx.blockIndex,
          "pckt image blocks have no caption field",
          "the caption is dropped",
        );
      }
      const block = imageBlock(ctx, node, node, node.alt);
      return block ? [block] : [];
    }
    case "iframe": {
      return [
        compact({
          $type: BLOCK.iframe,
          height: node.height,
          url: node.url,
        }),
      ];
    }
    case "website": {
      return [
        compact({
          $type: BLOCK.website,
          description: node.description,
          previewImage: node.previewImage,
          src: node.src,
          title: node.title,
        }),
      ];
    }
    case "table": {
      const block = tableBlock(ctx, node);
      return block ? [block] : [];
    }
    case "math": {
      return [
        { $type: BLOCK.codeBlock, language: "latex", plaintext: node.tex },
      ];
    }
    case "button": {
      // A paragraph whose whole text links to the button's target.
      const plaintext = node.text;
      return [
        {
          $type: BLOCK.text,
          facets: [
            {
              features: [
                { $type: "blog.pckt.richtext.facet#link", uri: node.href },
              ],
              index: { byteEnd: utf8ByteLength(plaintext), byteStart: 0 },
            },
          ],
          plaintext,
        },
      ];
    }
    case "blueskyEmbed": {
      if (!node.postCid) noteMissingPostCid(ctx, node, ctx.blockIndex);
      return [
        {
          $type: BLOCK.blueskyEmbed,
          postRef: compact({ cid: node.postCid, uri: node.postUri }),
        },
      ];
    }
    case "imageGrid":
    case "imageCarousel": {
      return unrollImages(ctx, node, node.images, node.caption);
    }
    case "imageDiff": {
      return unrollImages(ctx, node, [node.before, node.after], node.caption);
    }
    case "pckt.gallery": {
      return [{ $type: BLOCK.gallery, ref: node.ref }];
    }
    case "pckt.noteEmbed": {
      return [
        {
          $type: BLOCK.noteEmbed,
          noteRef: compact({ cid: node.cid, uri: node.uri }),
        },
      ];
    }
    case "leaflet.pageEmbed": {
      return node.children.flatMap((child) =>
        admit(ctx, child, ctx.blockIndex) ? emitBlock(ctx, child) : [],
      );
    }
    default: {
      return [];
    }
  }
}

export function toPckt(
  tree: DocumentTree,
  base: EmitContext,
): Record<string, unknown> | null {
  const items: Array<Block> = [];

  for (const [blockIndex, node] of tree.children.entries()) {
    const ctx: Ctx = { ...base, blockIndex };
    if (!admit(ctx, node, blockIndex)) continue;
    items.push(...emitBlock(ctx, node));
  }

  return items.length > 0 ? { $type: PCKT_CONTENT, items } : null;
}
