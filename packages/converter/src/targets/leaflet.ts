/**
 * Emit `pub.leaflet.content`.
 *
 * Leaflet nests its body one level deeper than the others: a content record
 * holds pages, a page holds `#block` wrappers, and each wrapper holds the block
 * itself. Everything the converter produces goes into a single linear document
 * page, which is what Leaflet's own editor writes for an ordinary post.
 */

import type {
  BlockNode,
  CollectionImage,
  DocumentTree,
  ListItem,
  RichText,
  TaskItem,
} from "@standard-reader/renderer-core";
import { LEAFLET_CONTENT } from "@standard-reader/renderer-core";

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
import { compact, joinRichText, prefixRichText } from "../internal.js";

const BLOCK = {
  blockquote: "pub.leaflet.blocks.blockquote",
  bskyPost: "pub.leaflet.blocks.bskyPost",
  button: "pub.leaflet.blocks.button",
  code: "pub.leaflet.blocks.code",
  header: "pub.leaflet.blocks.header",
  horizontalRule: "pub.leaflet.blocks.horizontalRule",
  iframe: "pub.leaflet.blocks.iframe",
  image: "pub.leaflet.blocks.image",
  imageGallery: "pub.leaflet.blocks.imageGallery",
  imageGalleryImage: "pub.leaflet.blocks.imageGallery#image",
  math: "pub.leaflet.blocks.math",
  orderedList: "pub.leaflet.blocks.orderedList",
  orderedListItem: "pub.leaflet.blocks.orderedList#listItem",
  poll: "pub.leaflet.blocks.poll",
  separator: "pub.leaflet.blocks.separator",
  signup: "pub.leaflet.blocks.signup",
  standardSitePost: "pub.leaflet.blocks.standardSitePost",
  standardSitePublication: "pub.leaflet.blocks.standardSitePublication",
  text: "pub.leaflet.blocks.text",
  unorderedList: "pub.leaflet.blocks.unorderedList",
  unorderedListItem: "pub.leaflet.blocks.unorderedList#listItem",
  website: "pub.leaflet.blocks.website",
} as const;

const PAGE = {
  linearDocument: "pub.leaflet.pages.linearDocument",
  linearDocumentBlock: "pub.leaflet.pages.linearDocument#block",
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
      target: "leaflet",
    }),
  };
}

function listItem(ctx: Ctx, node: BlockNode, item: ListItem): Block {
  const runs = item.runs.length > 0 ? [joinRichText(item.runs)] : [];
  const content = runs[0]
    ? text(ctx, node, runs[0])
    : { $type: BLOCK.text, plaintext: "" };

  const nested: Block = {};
  for (const child of item.children) {
    if (child.type === "bulletList") {
      nested.unorderedListChildren = list(ctx, child, child.items, "bullet");
    } else if (child.type === "orderedList") {
      nested.orderedListChildren = list(
        ctx,
        child,
        child.items,
        "ordered",
        child.start,
      );
    }
  }

  return { content, ...nested };
}

function list(
  ctx: Ctx,
  node: BlockNode,
  items: Array<ListItem>,
  kind: "bullet" | "ordered",
  start?: number,
): Block {
  const itemType =
    kind === "ordered" ? BLOCK.orderedListItem : BLOCK.unorderedListItem;
  const children = items.map((item) => ({
    $type: itemType,
    ...listItem(ctx, node, item),
  }));
  return compact({
    $type: kind === "ordered" ? BLOCK.orderedList : BLOCK.unorderedList,
    children,
    startIndex: kind === "ordered" ? start : undefined,
  });
}

/** Leaflet has no task list; keep the state as a leading glyph in the text. */
function taskList(ctx: Ctx, node: BlockNode, items: Array<TaskItem>): Block {
  const children = items.map((item) => {
    const run = prefixRichText(
      joinRichText(item.runs),
      item.checked ? "☑ " : "☐ ",
    );
    return {
      $type: BLOCK.unorderedListItem,
      content: text(ctx, node, run as RichText),
    };
  });
  return { $type: BLOCK.unorderedList, children };
}

function galleryImages(
  ctx: Ctx,
  node: BlockNode,
  images: Array<CollectionImage>,
): Array<Block> {
  return images.flatMap((image) => {
    if (!hasImageSource(image)) return [];
    const blob = imageBlob(image);
    if (blob == null) {
      noteDropped(
        ctx,
        node,
        ctx.blockIndex,
        "Leaflet gallery images must be blobs in the author's repo, and this " +
          "one is an external URL",
      );
      return [];
    }
    return [
      compact({
        $type: BLOCK.imageGalleryImage,
        alt: image.alt || undefined,
        aspectRatio: aspectRatio(image),
        image: blob,
      }),
    ];
  });
}

function gallery(
  ctx: Ctx,
  node: Extract<BlockNode, { type: "imageGrid" | "imageCarousel" }>,
): Block | null {
  const images = galleryImages(ctx, node, node.images);
  if (images.length === 0) return null;
  if (node.caption) {
    noteDropped(
      ctx,
      node,
      ctx.blockIndex,
      "Leaflet galleries have no caption field",
      "the caption is dropped",
    );
  }
  return {
    $type: BLOCK.imageGallery,
    format: node.type === "imageCarousel" ? "carousel" : "grid",
    images,
  };
}

/** One source block → zero or more Leaflet blocks. */
function emitBlock(ctx: Ctx, node: BlockNode): Array<Block> {
  switch (node.type) {
    case "paragraph": {
      return [text(ctx, node, node.text)];
    }
    case "heading": {
      return [
        {
          $type: BLOCK.header,
          level: Math.min(6, Math.max(1, node.level)),
          ...remapRichText(node.text, {
            blockIndex: ctx.blockIndex,
            blockType: node.type,
            report: ctx.report,
            target: "leaflet",
          }),
        },
      ];
    }
    case "blockquote": {
      // Leaflet's blockquote holds a single run, so a multi-paragraph quote
      // becomes consecutive quote blocks — visually the same quotation.
      return node.paragraphs.map((paragraph) => ({
        $type: BLOCK.blockquote,
        ...remapRichText(paragraph, {
          blockIndex: ctx.blockIndex,
          blockType: node.type,
          report: ctx.report,
          target: "leaflet",
        }),
      }));
    }
    case "callout": {
      const run = node.emoji
        ? (prefixRichText(node.text, `${node.emoji} `) as RichText)
        : node.text;
      return [
        {
          $type: BLOCK.blockquote,
          ...remapRichText(run, {
            blockIndex: ctx.blockIndex,
            blockType: node.type,
            report: ctx.report,
            target: "leaflet",
          }),
        },
      ];
    }
    case "horizontalRule": {
      return [{ $type: BLOCK.horizontalRule }];
    }
    case "bulletList": {
      return [list(ctx, node, node.items, "bullet")];
    }
    case "orderedList": {
      return [list(ctx, node, node.items, "ordered", node.start)];
    }
    case "taskList": {
      return [taskList(ctx, node, node.items)];
    }
    case "code": {
      return [
        compact({
          $type: BLOCK.code,
          language: node.language,
          plaintext: node.code,
        }),
      ];
    }
    case "image": {
      const blob = imageBlob(node);
      if (blob == null) {
        ctx.report({
          blockIndex: ctx.blockIndex,
          blockType: node.type,
          code: "image-not-a-blob",
          message:
            "Leaflet images must be blobs in the author's repo, and this one " +
            "is an external URL that would have to be re-uploaded first",
          severity: "unsupported",
        });
        return [];
      }
      if (node.caption) {
        noteDropped(
          ctx,
          node,
          ctx.blockIndex,
          "Leaflet image blocks have no caption field",
          "the caption is dropped",
        );
      }
      return [
        compact({
          $type: BLOCK.image,
          alt: node.alt || undefined,
          aspectRatio: aspectRatio(node),
          fullBleed: node.fullBleed,
          image: blob,
        }),
      ];
    }
    case "iframe": {
      return [
        compact({
          $type: BLOCK.iframe,
          aspectRatio: node.aspectRatio,
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
    case "math": {
      return [{ $type: BLOCK.math, tex: node.tex }];
    }
    case "button": {
      if (node.caption || node.alignment) {
        noteDropped(
          ctx,
          node,
          ctx.blockIndex,
          "Leaflet buttons carry only a label and a URL",
          "the caption and alignment are dropped",
        );
      }
      return [{ $type: BLOCK.button, text: node.text, url: node.href }];
    }
    case "blueskyEmbed": {
      if (!node.postCid) noteMissingPostCid(ctx, node, ctx.blockIndex);
      return [
        {
          $type: BLOCK.bskyPost,
          postRef: compact({ cid: node.postCid, uri: node.postUri }),
        },
      ];
    }
    case "imageGrid":
    case "imageCarousel": {
      const block = gallery(ctx, node);
      return block ? [block] : [];
    }
    case "imageDiff": {
      const images = galleryImages(ctx, node, [node.before, node.after]);
      return images.length > 0
        ? [{ $type: BLOCK.imageGallery, format: "grid", images }]
        : [];
    }
    case "leaflet.poll": {
      return [
        {
          $type: BLOCK.poll,
          pollRef: compact({ cid: node.pollCid, uri: node.pollUri }),
        },
      ];
    }
    case "leaflet.signup": {
      return [{ $type: BLOCK.signup }];
    }
    case "leaflet.separator": {
      return [{ $type: BLOCK.separator }];
    }
    case "leaflet.standardSitePost": {
      return [{ $type: BLOCK.standardSitePost, uri: node.uri }];
    }
    case "leaflet.standardSitePublication": {
      return [
        compact({
          $type: BLOCK.standardSitePublication,
          cid: node.cid,
          showPublicationTheme: node.showPublicationTheme,
          uri: node.uri,
        }),
      ];
    }
    case "leaflet.pageEmbed": {
      return node.children.flatMap((child) =>
        admit(ctx, child, ctx.blockIndex) ? emitBlock(ctx, child) : [],
      );
    }
    default: {
      // Everything else was rejected by `admit` before we got here.
      return [];
    }
  }
}

export function toLeaflet(
  tree: DocumentTree,
  base: EmitContext,
): Record<string, unknown> | null {
  const blocks: Array<Block> = [];

  for (const [blockIndex, node] of tree.children.entries()) {
    const ctx: Ctx = { ...base, blockIndex };
    if (!admit(ctx, node, blockIndex)) continue;
    for (const block of emitBlock(ctx, node)) {
      blocks.push({ $type: PAGE.linearDocumentBlock, block });
    }
  }

  if (blocks.length === 0) return null;

  return {
    $type: LEAFLET_CONTENT,
    pages: [{ $type: PAGE.linearDocument, blocks }],
  };
}
