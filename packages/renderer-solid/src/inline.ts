import type { InlineNode, MarkKind } from "@standard-reader/renderer-core";

import type { Renderable, RenderContext, SolidSharedComponents } from "./types";

function markRenderer(
  shared: SolidSharedComponents,
  mark: MarkKind,
): (children: Renderable) => Renderable {
  switch (mark) {
    case "strong": {
      return shared.strong;
    }
    case "emphasis": {
      return shared.emphasis;
    }
    case "code": {
      return shared.inlineCode;
    }
    case "underline": {
      return shared.underline;
    }
    case "strikethrough": {
      return shared.strikethrough;
    }
    case "highlight": {
      return shared.highlight;
    }
  }
}

/** Render a list of {@link InlineNode}s to Solid children. */
export function renderInlineNodes(
  nodes: Array<InlineNode>,
  ctx: RenderContext,
): Array<Renderable> {
  return nodes.map((node) => renderInline(node, ctx));
}

function renderInline(node: InlineNode, ctx: RenderContext): Renderable {
  const shared = ctx.components.shared;
  switch (node.type) {
    case "text": {
      return node.value;
    }
    case "mark": {
      return markRenderer(
        shared,
        node.mark,
      )(renderInlineNodes(node.children, ctx));
    }
    case "link": {
      return shared.link(
        { href: node.href },
        renderInlineNodes(node.children, ctx),
      );
    }
    case "mention": {
      return shared.mention(
        { atUri: node.atUri, did: node.did },
        renderInlineNodes(node.children, ctx),
      );
    }
    case "footnoteRef": {
      return shared.footnoteReference({
        footnoteId: node.footnoteId,
        number: node.number,
        contentPlaintext: node.contentPlaintext,
      });
    }
  }
}
