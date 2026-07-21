import { findFacetFeature, hasFacetKind } from "./facets";
import { segmentFacetedText } from "./leaflet/facets";
import type { InlineNode, MarkKind, RichText } from "./nodes";

function wrapMark(node: InlineNode, mark: MarkKind): InlineNode {
  return { type: "mark", mark, children: [node] };
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
      out.push({ type: "text", value });
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

    let node: InlineNode = { type: "text", value };

    if (isCode) node = wrapMark(node, "code");

    if (mention && (mention.atURI || mention.did)) {
      node = {
        type: "mention",
        atUri: mention.atURI,
        did: mention.did,
        children: [node],
      };
    } else if (link?.uri) {
      node = { type: "link", href: link.uri, children: [node] };
    }

    if (isHighlight) node = wrapMark(node, "highlight");
    if (isStrikethrough) node = wrapMark(node, "strikethrough");
    if (isUnderline) node = wrapMark(node, "underline");
    if (isItalic) node = wrapMark(node, "emphasis");
    if (isBold) node = wrapMark(node, "strong");

    out.push(node);

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
