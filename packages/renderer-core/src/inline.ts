import { findFacetFeature, hasFacetKind } from "./facets.js";
import { segmentFacetedText } from "./leaflet/facets.js";
import type { InlineNode, MarkKind, RichText } from "./nodes.js";

function wrapMark(children: Array<InlineNode>, mark: MarkKind): InlineNode {
  return { type: "mark", mark, children };
}

/**
 * One segment's text as inline nodes, with its newlines lifted into explicit
 * {@link InlineNode} line breaks — a bare `\n` is collapsed to a space by HTML,
 * so a hard break authored in the source would otherwise vanish on the page.
 */
function textNodes(value: string): Array<InlineNode> {
  if (!value.includes("\n")) return [{ type: "text", value }];
  const out: Array<InlineNode> = [];
  for (const [index, line] of value.split("\n").entries()) {
    if (index > 0) out.push({ type: "lineBreak" });
    if (line) out.push({ type: "text", value: line });
  }
  return out;
}

/**
 * Turn a run of faceted rich text into an {@link InlineNode} tree: split the
 * plaintext by byte-indexed facets, then compose marks, links, mentions and
 * footnote references over each segment. Works across every format's facet
 * dialect (the `#feature` suffix is what's matched, not the full `$type`).
 *
 * `footnoteNumbers` maps a footnote id to its 1-based display number; pass the
 * map from {@link DocumentTree} so inline references are numbered.
 */
export function segmentInline(
  text: RichText,
  footnoteNumbers?: ReadonlyMap<string, number>,
): Array<InlineNode> {
  const segments = segmentFacetedText(text.plaintext, text.facets);
  const out: Array<InlineNode> = [];

  for (const segment of segments) {
    const { text: value, features } = segment;
    if (features.length === 0) {
      out.push(...textNodes(value));
      continue;
    }

    const isBold =
      hasFacetKind(features, "bold") || hasFacetKind(features, "strong");
    const isItalic = hasFacetKind(features, "italic");
    const isCode = hasFacetKind(features, "code");
    const isUnderline = hasFacetKind(features, "underline");
    const isStrikethrough = hasFacetKind(features, "strikethrough");
    const isHighlight = hasFacetKind(features, "highlight");

    // Offprint's `#webMention` is a `#link` enriched with page metadata; render
    // it as a plain link since the plaintext already carries the label.
    const link =
      findFacetFeature(features, "link") ??
      findFacetFeature(features, "webMention");
    const mention =
      findFacetFeature(features, "atMention") ??
      findFacetFeature(features, "didMention") ??
      findFacetFeature(features, "mention");
    const footnote = findFacetFeature(features, "footnote");

    let nodes: Array<InlineNode> = textNodes(value);

    if (isCode) nodes = [wrapMark(nodes, "code")];

    if (mention && (mention.atURI || mention.did)) {
      nodes = [
        {
          type: "mention",
          atUri: mention.atURI,
          did: mention.did,
          children: nodes,
        },
      ];
    } else if (link?.uri) {
      nodes = [{ type: "link", href: link.uri, children: nodes }];
    }

    if (isHighlight) nodes = [wrapMark(nodes, "highlight")];
    if (isStrikethrough) nodes = [wrapMark(nodes, "strikethrough")];
    if (isUnderline) nodes = [wrapMark(nodes, "underline")];
    if (isItalic) nodes = [wrapMark(nodes, "emphasis")];
    if (isBold) nodes = [wrapMark(nodes, "strong")];

    out.push(...nodes);

    if (footnote?.footnoteId) {
      out.push({
        type: "footnoteRef",
        footnoteId: footnote.footnoteId,
        number: footnoteNumbers?.get(footnote.footnoteId) ?? null,
        contentPlaintext: footnote.contentPlaintext,
      });
    }
  }

  return out;
}

/** True when a rich-text run carries any renderable text. */
export function richTextIsEmpty(text: RichText): boolean {
  return text.plaintext.length === 0;
}
