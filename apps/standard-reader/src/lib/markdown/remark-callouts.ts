import { visit } from "unist-util-visit";

import { parseCalloutMarker } from "./callouts";

// Minimal structural types for the mdast nodes this plugin touches. Kept local
// so the plugin depends only on `unist-util-visit` and not on `@types/mdast` /
// `@types/unified`, which are not direct dependencies of this project.
interface MdastNode {
  type: string;
  value?: string;
  children?: Array<MdastNode>;
  data?: { hProperties?: Record<string, unknown> } & Record<string, unknown>;
}

/**
 * remark plugin: turn GFM/Obsidian callout blockquotes into annotated
 * blockquotes the renderer can pick up.
 *
 * A blockquote whose first line is a `[!type]` marker gets `className: callout`
 * plus `data-callout-*` properties describing its kind, title, and fold state,
 * and the marker line is stripped from the body. Everything else about the
 * blockquote (nested markdown, lists, code) is left untouched, so callout
 * bodies render exactly like normal prose.
 */
export function remarkCallouts() {
  return (tree: MdastNode) => {
    visit(tree as never, "blockquote", (raw) => {
      const node = raw as MdastNode;
      const paragraph = node.children?.[0];
      if (!paragraph || paragraph.type !== "paragraph") return;

      const leading = paragraph.children?.[0];
      if (!leading || leading.type !== "text" || leading.value === undefined) {
        return;
      }

      const marker = parseCalloutMarker(leading.value);
      if (!marker) return;

      // Drop the marker line from the body. If that empties the text node (and
      // then the paragraph), remove the now-empty nodes so the callout body
      // starts at the real content.
      const remaining = leading.value.slice(marker.matchLength);
      if (remaining === "") {
        paragraph.children?.shift();
      } else {
        leading.value = remaining;
      }
      if (paragraph.children && paragraph.children.length === 0) {
        node.children?.shift();
      }

      const data = (node.data ??= {});
      const properties: Record<string, string> = {
        className: "callout",
        "data-callout-kind": marker.kind,
        "data-callout-title": marker.title,
      };
      if (marker.collapsible) {
        properties["data-callout-fold"] = marker.defaultOpen
          ? "open"
          : "closed";
      }
      data.hProperties = { ...data.hProperties, ...properties };
    });
  };
}

export default remarkCallouts;
