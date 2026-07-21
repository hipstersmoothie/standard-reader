import { buildRenderTree } from "@standard-reader/renderer-core";
import type {
  BlockNode,
  ListItem,
  RichText,
  RendererOptions,
  StandardSiteDocument,
} from "@standard-reader/renderer-core";
import { nothing } from "lit";

import { mergeComponents } from "./merge";
import type {
  LitComponentsInput,
  LitTableRow,
  Renderable,
  RenderContext,
} from "./types";

export interface RenderDocumentOptions {
  components?: LitComponentsInput;
  options?: RendererOptions;
}

/**
 * Render a Standard Site document to a lit-renderable value. Use with lit-html's
 * `render()`, inside a Lit template, or via the `<standard-document>` element.
 */
export function renderDocument(
  document: StandardSiteDocument,
  opts?: RenderDocumentOptions,
): Renderable {
  const tree = buildRenderTree(document, opts?.options);
  const components = mergeComponents(opts?.components);
  if (!tree) return nothing;

  const ctx: RenderContext = {
    components,
    footnoteNumbers: tree.footnoteNumbers,
  };
  const { shared } = components;

  const body = renderBlocks(tree.children, ctx);
  const footnotes =
    tree.footnotes.length > 0
      ? shared.footnotes(
          tree.footnotes.map((footnote) =>
            shared.footnoteItem(
              { id: footnote.id, number: footnote.number },
              facet(footnote.text, ctx),
            ),
          ),
        )
      : nothing;

  return shared.root([body, footnotes]);
}

function facet(text: RichText, ctx: RenderContext): Renderable {
  return ctx.components.shared.facetText(
    { plaintext: text.plaintext, facets: text.facets },
    ctx,
  );
}

function runs(items: Array<RichText>, ctx: RenderContext): Renderable {
  return items.map((run) => facet(run, ctx));
}

/** Render a list of block nodes. */
export function renderBlocks(
  nodes: Array<BlockNode>,
  ctx: RenderContext,
): Renderable {
  return nodes.map((node) => renderBlock(node, ctx));
}

function renderListItem(item: ListItem, ctx: RenderContext): Renderable {
  return ctx.components.shared.listItem([
    runs(item.runs, ctx),
    renderBlocks(item.children, ctx),
  ]);
}

function renderBlock(node: BlockNode, ctx: RenderContext): Renderable {
  const { shared, leaflet, pckt, offprint } = ctx.components;

  switch (node.type) {
    case "paragraph": {
      return shared.paragraph({ dropCap: node.dropCap }, facet(node.text, ctx));
    }
    case "heading": {
      return shared.heading({ level: node.level }, facet(node.text, ctx));
    }
    case "blockquote": {
      return shared.blockquote(
        node.paragraphs.map((text) =>
          shared.paragraph({ dropCap: false }, facet(text, ctx)),
        ),
      );
    }
    case "callout": {
      return shared.callout(
        { emoji: node.emoji, color: node.color },
        facet(node.text, ctx),
      );
    }
    case "horizontalRule": {
      return shared.horizontalRule();
    }
    case "bulletList": {
      return shared.bulletList(
        node.items.map((item) => renderListItem(item, ctx)),
      );
    }
    case "orderedList": {
      return shared.orderedList(
        { start: node.start },
        node.items.map((item) => renderListItem(item, ctx)),
      );
    }
    case "taskList": {
      return shared.taskList(
        node.items.map((item) =>
          shared.taskListItem({ checked: item.checked }, runs(item.runs, ctx)),
        ),
      );
    }
    case "code": {
      return shared.code({ code: node.code, language: node.language });
    }
    case "image": {
      return shared.image({
        src: node.src,
        alt: node.alt,
        aspectRatio: node.aspectRatio,
        fullBleed: node.fullBleed,
        caption: node.caption,
      });
    }
    case "iframe": {
      return shared.iframe({
        url: node.url,
        height: node.height,
        aspectRatio: node.aspectRatio,
      });
    }
    case "website": {
      return shared.website({
        src: node.src,
        title: node.title,
        description: node.description,
        previewImage: node.previewImage,
      });
    }
    case "table": {
      const rows: Array<LitTableRow> = node.rows.map((row) =>
        row.map((cell) => ({
          header: cell.header,
          content: facet(cell.text, ctx),
        })),
      );
      return shared.table({ rows });
    }
    case "math": {
      return shared.math({ tex: node.tex });
    }
    case "button": {
      return shared.button({
        text: node.text,
        href: node.href,
        caption: node.caption,
        alignment: node.alignment,
      });
    }
    case "blueskyEmbed": {
      return shared.blueskyEmbed({ postUri: node.postUri });
    }
    case "imageGrid": {
      return shared.imageGrid({
        images: node.images,
        caption: node.caption,
        layout: node.layout,
      });
    }
    case "imageCarousel": {
      return shared.imageCarousel({
        images: node.images,
        caption: node.caption,
        layout: node.layout,
      });
    }
    case "imageDiff": {
      return shared.imageDiff({
        before: node.before,
        after: node.after,
        caption: node.caption,
        labels: node.labels,
      });
    }
    case "unknown": {
      return shared.unknown({ blockType: node.blockType });
    }
    case "leaflet.poll": {
      return leaflet.poll({ pollUri: node.pollUri });
    }
    case "leaflet.signup": {
      return leaflet.signup();
    }
    case "leaflet.separator": {
      return leaflet.separator();
    }
    case "leaflet.standardSitePost": {
      return leaflet.standardSitePost({ uri: node.uri });
    }
    case "leaflet.standardSitePublication": {
      return leaflet.standardSitePublication({
        uri: node.uri,
        cid: node.cid,
        showPublicationTheme: node.showPublicationTheme,
      });
    }
    case "leaflet.pageEmbed": {
      return leaflet.pageEmbed(
        { pageId: node.pageId, pageType: node.pageType },
        renderBlocks(node.children, ctx),
      );
    }
    case "pckt.gallery": {
      return pckt.gallery({ ref: node.ref });
    }
    case "pckt.noteEmbed": {
      return pckt.noteEmbed({ uri: node.uri, cid: node.cid });
    }
    case "offprint.component": {
      return offprint.component({ componentUri: node.componentUri });
    }
  }
}
