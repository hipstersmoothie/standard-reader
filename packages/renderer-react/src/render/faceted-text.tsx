import { segmentInline } from "@standard-reader/renderer-core";
import type { InlineNode, MarkKind } from "@standard-reader/renderer-core";
import { Fragment } from "react";

import { useComponents, useFootnoteNumbers } from "../components/context";
import type { FacetTextProps, MarkProps } from "../components/types";

/**
 * The default inline renderer: turn a run of faceted plaintext into the core's
 * {@link InlineNode} tree and compose the shared inline mark components over it.
 * Overriding `shared.FacetText` replaces this entirely; overriding an individual
 * mark (e.g. `shared.Link` or `shared.Mention`) customizes one decoration while
 * keeping this composition.
 */
export function DefaultFacetText({ plaintext, facets }: FacetTextProps) {
  const footnoteNumbers = useFootnoteNumbers();
  const nodes = segmentInline({ plaintext, facets }, footnoteNumbers);
  return <InlineNodes nodes={nodes} />;
}

export function InlineNodes({ nodes }: { nodes: Array<InlineNode> }) {
  return (
    <>
      {nodes.map((node, index) => (
        <Fragment key={index}>
          <RenderInline node={node} />
        </Fragment>
      ))}
    </>
  );
}

function RenderInline({ node }: { node: InlineNode }) {
  const { shared } = useComponents();

  switch (node.type) {
    case "text": {
      return <>{node.value}</>;
    }
    case "mark": {
      const Mark = markComponent(shared, node.mark);
      return (
        <Mark>
          <InlineNodes nodes={node.children} />
        </Mark>
      );
    }
    case "link": {
      return (
        <shared.Link href={node.href}>
          <InlineNodes nodes={node.children} />
        </shared.Link>
      );
    }
    case "mention": {
      return (
        <shared.Mention atUri={node.atUri} did={node.did}>
          <InlineNodes nodes={node.children} />
        </shared.Mention>
      );
    }
    case "footnoteRef": {
      return (
        <shared.FootnoteReference
          footnoteId={node.footnoteId}
          number={node.number}
          contentPlaintext={node.contentPlaintext}
        />
      );
    }
  }
}

function markComponent(
  shared: ReturnType<typeof useComponents>["shared"],
  mark: MarkKind,
): React.ComponentType<MarkProps> {
  switch (mark) {
    case "strong": {
      return shared.Strong;
    }
    case "emphasis": {
      return shared.Emphasis;
    }
    case "code": {
      return shared.InlineCode;
    }
    case "underline": {
      return shared.Underline;
    }
    case "strikethrough": {
      return shared.Strikethrough;
    }
    case "highlight": {
      return shared.Highlight;
    }
  }
}
