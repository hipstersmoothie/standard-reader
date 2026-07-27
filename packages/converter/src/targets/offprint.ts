/**
 * Emit `app.offprint.content`.
 *
 * Offprint is a flat `items[]` of typed blocks — the closest of the four to the
 * normalized tree, so most blocks map one-to-one. The two places it gives
 * ground are tables (it has no table block) and list nesting: its list items
 * hold a single text run, so a nested list has nowhere to go.
 *
 * The `#listItem` / `#taskItem` fragment names below are inferred from the
 * shape Offprint's published records take (`children[].content` holding an
 * `app.offprint.block.text`), which is all this repo's parser observes. They
 * are isolated in one constant so a correction is a one-line change.
 */

import type {
  BlockNode,
  CollectionImage,
  DocumentTree,
  ListItem,
  RichText,
} from "@standard-reader/renderer-core";
import { OFFPRINT_CONTENT } from "@standard-reader/renderer-core";

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
import { compact, joinRichText } from "../internal.js";

const BLOCK = {
  blockquote: "app.offprint.block.blockquote",
  blueskyPost: "app.offprint.block.blueskyPost",
  bulletList: "app.offprint.block.bulletList",
  bulletListItem: "app.offprint.block.bulletList#listItem",
  button: "app.offprint.block.button",
  callout: "app.offprint.block.callout",
  codeBlock: "app.offprint.block.codeBlock",
  component: "app.offprint.block.component",
  gridImage: "app.offprint.block.imageGrid#gridImage",
  heading: "app.offprint.block.heading",
  horizontalRule: "app.offprint.block.horizontalRule",
  image: "app.offprint.block.image",
  imageCarousel: "app.offprint.block.imageCarousel",
  imageDiff: "app.offprint.block.imageDiff",
  imageGrid: "app.offprint.block.imageGrid",
  mathBlock: "app.offprint.block.mathBlock",
  orderedList: "app.offprint.block.orderedList",
  orderedListItem: "app.offprint.block.orderedList#listItem",
  taskItem: "app.offprint.block.taskList#taskItem",
  taskList: "app.offprint.block.taskList",
  text: "app.offprint.block.text",
  webBookmark: "app.offprint.block.webBookmark",
  webEmbed: "app.offprint.block.webEmbed",
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
      target: "offprint",
    }),
  };
}

/** Offprint list items hold one text run — nested lists have nowhere to live. */
function listChildren(
  ctx: Ctx,
  node: BlockNode,
  items: Array<ListItem>,
  itemType: string,
): Array<Block> {
  let flattened = false;
  const children = items.flatMap((item) => {
    if (item.children.length > 0) flattened = true;
    if (item.runs.length === 0) return [];
    return [
      { $type: itemType, content: text(ctx, node, joinRichText(item.runs)) },
    ];
  });
  if (flattened) {
    ctx.report({
      blockIndex: ctx.blockIndex,
      blockType: node.type,
      code: "list-nesting-dropped",
      message:
        "Offprint list items hold a single line of text, so nested lists " +
        "cannot be represented",
      severity: "unsupported",
      fallback: "only the top-level items are kept",
    });
  }
  return children;
}

function gridImages(
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
        "Offprint image collections reference repo blobs, and this image is " +
          "an external URL",
      );
      return [];
    }
    return [
      compact({
        $type: BLOCK.gridImage,
        alt: image.alt || undefined,
        aspectRatio: aspectRatio(image),
        blob,
      }),
    ];
  });
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
            target: "offprint",
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
      if (node.kind || node.title) {
        noteDropped(
          ctx,
          node,
          ctx.blockIndex,
          "Offprint callouts carry an emoji and a colour, not a `[!TYPE]` " +
            "marker with a title",
          "the callout is kept; its type and title are not",
        );
      }
      return [
        compact({
          $type: BLOCK.callout,
          color: node.color,
          emoji: node.emoji,
          ...remapRichText(node.text, {
            blockIndex: ctx.blockIndex,
            blockType: node.type,
            report: ctx.report,
            target: "offprint",
          }),
        }),
      ];
    }
    case "horizontalRule":
    case "leaflet.separator": {
      return [{ $type: BLOCK.horizontalRule }];
    }
    case "bulletList": {
      const children = listChildren(
        ctx,
        node,
        node.items,
        BLOCK.bulletListItem,
      );
      return children.length > 0 ? [{ $type: BLOCK.bulletList, children }] : [];
    }
    case "orderedList": {
      const children = listChildren(
        ctx,
        node,
        node.items,
        BLOCK.orderedListItem,
      );
      return children.length > 0
        ? [compact({ $type: BLOCK.orderedList, children, start: node.start })]
        : [];
    }
    case "taskList": {
      const children = node.items.map((item) => ({
        $type: BLOCK.taskItem,
        checked: item.checked,
        content: text(ctx, node, joinRichText(item.runs)),
      }));
      return children.length > 0 ? [{ $type: BLOCK.taskList, children }] : [];
    }
    case "code": {
      return [
        compact({
          $type: BLOCK.codeBlock,
          code: node.code,
          language: node.language,
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
            "Offprint images reference blobs in the author's repo, and this " +
            "one is an external URL that would have to be re-uploaded first",
          severity: "unsupported",
        });
        return [];
      }
      if (node.caption) {
        noteDropped(
          ctx,
          node,
          ctx.blockIndex,
          "Offprint image blocks have no caption field",
          "the caption is dropped",
        );
      }
      return [
        compact({
          $type: BLOCK.image,
          alt: node.alt || undefined,
          aspectRatio: aspectRatio(node),
          image: blob,
        }),
      ];
    }
    case "iframe": {
      return [
        compact({
          $type: BLOCK.webEmbed,
          embedHeight: node.height,
          embedUrl: node.url,
        }),
      ];
    }
    case "website": {
      return [
        compact({
          $type: BLOCK.webBookmark,
          description: node.description,
          href: node.src,
          image: node.previewImage,
          title: node.title,
        }),
      ];
    }
    case "math": {
      return [{ $type: BLOCK.mathBlock, tex: node.tex }];
    }
    case "button": {
      return [
        compact({
          $type: BLOCK.button,
          alignment: node.alignment,
          caption: node.caption,
          href: node.href,
          text: node.text,
        }),
      ];
    }
    case "blueskyEmbed": {
      if (!node.postCid) noteMissingPostCid(ctx, node, ctx.blockIndex);
      return [
        {
          $type: BLOCK.blueskyPost,
          post: compact({ cid: node.postCid, uri: node.postUri }),
        },
      ];
    }
    case "imageGrid":
    case "imageCarousel": {
      const images = gridImages(ctx, node, node.images);
      if (images.length < 2) return [];
      return [
        compact({
          $type:
            node.type === "imageCarousel"
              ? BLOCK.imageCarousel
              : BLOCK.imageGrid,
          caption: node.caption,
          images,
        }),
      ];
    }
    case "imageDiff": {
      const images = gridImages(ctx, node, [node.before, node.after]);
      if (images.length !== 2) return [];
      return [
        compact({
          $type: BLOCK.imageDiff,
          caption: node.caption,
          images,
          labels: node.labels,
        }),
      ];
    }
    case "offprint.component": {
      return [{ $type: BLOCK.component, component: node.componentUri }];
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

export function toOffprint(
  tree: DocumentTree,
  base: EmitContext,
): Record<string, unknown> | null {
  const items: Array<Block> = [];

  for (const [blockIndex, node] of tree.children.entries()) {
    const ctx: Ctx = { ...base, blockIndex };
    if (!admit(ctx, node, blockIndex)) continue;
    items.push(...emitBlock(ctx, node));
  }

  return items.length > 0 ? { $type: OFFPRINT_CONTENT, items } : null;
}
