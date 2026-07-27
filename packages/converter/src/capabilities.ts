/**
 * What each target format can carry.
 *
 * This table is the single source of truth for *whether* a block survives a
 * conversion; the per-target emitters decide *how*. Every emitter consults
 * {@link blockSupport} before writing a block out, so a warning can never
 * silently disagree with what actually got emitted (`support.test.ts` asserts
 * the two stay in step).
 *
 * Conditional losses — a caption that happens to be set, a list that happens to
 * be nested, an inline mark the target's facet dialect lacks — are reported by
 * the emitters themselves, since the table can only speak per block type.
 */

import type { BlockType, ConversionTarget } from "./types.js";

export type BlockSupport =
  /** The target has a first-class block for this. Nothing is lost. */
  | { level: "native" }
  /** The content survives in a reduced form. `fallback` says what is emitted. */
  | { level: "degraded"; note: string; fallback: string }
  /** The target cannot carry this at all; the block is dropped. */
  | { level: "none"; note: string };

const UNKNOWN_BLOCK: BlockSupport = {
  level: "none",
  note:
    "The source block is not one the renderer understands, so there is no " +
    "content to translate.",
};

const NATIVE: BlockSupport = { level: "native" };

const FLATTEN_PAGE_EMBED: BlockSupport = {
  level: "degraded",
  note: "Only Leaflet has embedded pages.",
  fallback: "the embedded page's blocks, inlined into the body",
};

const SEPARATOR_TO_RULE: BlockSupport = {
  level: "degraded",
  note: "Leaflet's decorative separator has no equivalent.",
  fallback: "a horizontal rule",
};

const POLL_UNSUPPORTED: BlockSupport = {
  level: "none",
  note: "A Leaflet poll is backed by a Leaflet-hosted record.",
};

const SIGNUP_UNSUPPORTED: BlockSupport = {
  level: "none",
  note: "A Leaflet signup form is a Leaflet-hosted subscription widget.",
};

const STANDARD_SITE_EMBED_UNSUPPORTED: BlockSupport = {
  level: "none",
  note:
    "The embed points at a Standard Site record by AT-URI, which only " +
    "Leaflet knows how to resolve and render.",
};

const PCKT_GALLERY_UNSUPPORTED: BlockSupport = {
  level: "none",
  note:
    "A pckt gallery references a separate gallery record; its images are not " +
    "in this document to copy across.",
};

const PCKT_NOTE_UNSUPPORTED: BlockSupport = {
  level: "none",
  note: "A pckt note embed references another pckt post.",
};

const OFFPRINT_COMPONENT_UNSUPPORTED: BlockSupport = {
  level: "none",
  note:
    "An Offprint component is a live reference to a separate " +
    "app.offprint.component record, resolved when the document is read.",
};

const LEAFLET: Record<BlockType, BlockSupport> = {
  blockquote: NATIVE,
  blueskyEmbed: NATIVE,
  bulletList: NATIVE,
  button: NATIVE,
  callout: {
    level: "degraded",
    note: "Leaflet has no callout block.",
    fallback: "a blockquote (the emoji and colour are dropped)",
  },
  code: NATIVE,
  heading: NATIVE,
  horizontalRule: NATIVE,
  iframe: NATIVE,
  image: NATIVE,
  imageCarousel: NATIVE,
  imageDiff: {
    level: "degraded",
    note: "Leaflet has no before/after comparison block.",
    fallback: "a two-image gallery (the labels are dropped)",
  },
  imageGrid: NATIVE,
  "leaflet.pageEmbed": NATIVE,
  "leaflet.poll": NATIVE,
  "leaflet.separator": NATIVE,
  "leaflet.signup": NATIVE,
  "leaflet.standardSitePost": NATIVE,
  "leaflet.standardSitePublication": NATIVE,
  math: NATIVE,
  "offprint.component": OFFPRINT_COMPONENT_UNSUPPORTED,
  orderedList: NATIVE,
  paragraph: NATIVE,
  "pckt.gallery": PCKT_GALLERY_UNSUPPORTED,
  "pckt.noteEmbed": PCKT_NOTE_UNSUPPORTED,
  table: {
    level: "none",
    note: "Leaflet has no table block, and its text blocks cannot hold a grid.",
  },
  taskList: {
    level: "degraded",
    note: "Leaflet has no task list.",
    fallback: "a bullet list with ☑ / ☐ prefixes (the checkboxes become text)",
  },
  unknown: UNKNOWN_BLOCK,
  website: NATIVE,
};

const OFFPRINT: Record<BlockType, BlockSupport> = {
  blockquote: NATIVE,
  blueskyEmbed: NATIVE,
  bulletList: NATIVE,
  button: NATIVE,
  callout: NATIVE,
  code: NATIVE,
  heading: NATIVE,
  horizontalRule: NATIVE,
  iframe: NATIVE,
  image: NATIVE,
  imageCarousel: NATIVE,
  imageDiff: NATIVE,
  imageGrid: NATIVE,
  "leaflet.pageEmbed": FLATTEN_PAGE_EMBED,
  "leaflet.poll": POLL_UNSUPPORTED,
  "leaflet.separator": SEPARATOR_TO_RULE,
  "leaflet.signup": SIGNUP_UNSUPPORTED,
  "leaflet.standardSitePost": STANDARD_SITE_EMBED_UNSUPPORTED,
  "leaflet.standardSitePublication": STANDARD_SITE_EMBED_UNSUPPORTED,
  math: NATIVE,
  "offprint.component": NATIVE,
  orderedList: NATIVE,
  paragraph: NATIVE,
  "pckt.gallery": PCKT_GALLERY_UNSUPPORTED,
  "pckt.noteEmbed": PCKT_NOTE_UNSUPPORTED,
  table: {
    level: "none",
    note: "Offprint has no table block.",
  },
  taskList: NATIVE,
  unknown: UNKNOWN_BLOCK,
  website: NATIVE,
};

const IMAGES_IN_SEQUENCE: BlockSupport = {
  level: "degraded",
  note:
    "pckt galleries reference a separate gallery record, so a grid cannot be " +
    "built from images that live in this document.",
  fallback: "the images one after another (the caption is kept as a paragraph)",
};

const PCKT: Record<BlockType, BlockSupport> = {
  blockquote: NATIVE,
  blueskyEmbed: NATIVE,
  bulletList: NATIVE,
  button: {
    level: "degraded",
    note: "pckt has no button block.",
    fallback: "a paragraph linking to the button's target",
  },
  callout: {
    level: "degraded",
    note: "pckt has no callout block.",
    fallback: "a blockquote (the emoji and colour are dropped)",
  },
  code: NATIVE,
  heading: NATIVE,
  horizontalRule: NATIVE,
  iframe: NATIVE,
  image: NATIVE,
  imageCarousel: IMAGES_IN_SEQUENCE,
  imageDiff: {
    level: "degraded",
    note: "pckt has no before/after comparison block.",
    fallback: "the two images one after another (the labels are dropped)",
  },
  imageGrid: IMAGES_IN_SEQUENCE,
  "leaflet.pageEmbed": FLATTEN_PAGE_EMBED,
  "leaflet.poll": POLL_UNSUPPORTED,
  "leaflet.separator": SEPARATOR_TO_RULE,
  "leaflet.signup": SIGNUP_UNSUPPORTED,
  "leaflet.standardSitePost": STANDARD_SITE_EMBED_UNSUPPORTED,
  "leaflet.standardSitePublication": STANDARD_SITE_EMBED_UNSUPPORTED,
  math: {
    level: "degraded",
    note: "pckt has no math block.",
    fallback: "a code block holding the LaTeX source",
  },
  "offprint.component": OFFPRINT_COMPONENT_UNSUPPORTED,
  orderedList: NATIVE,
  paragraph: NATIVE,
  "pckt.gallery": NATIVE,
  "pckt.noteEmbed": NATIVE,
  table: NATIVE,
  taskList: NATIVE,
  unknown: UNKNOWN_BLOCK,
  website: NATIVE,
};

const MARKDOWN_LINK: BlockSupport = {
  level: "degraded",
  note: "Markdown has no embed block.",
  fallback: "a link to the embedded URL",
};

const MARKPUB: Record<BlockType, BlockSupport> = {
  blockquote: NATIVE,
  blueskyEmbed: {
    level: "degraded",
    note: "Markdown has no Bluesky embed.",
    fallback: "a link to the post on bsky.app",
  },
  bulletList: NATIVE,
  button: {
    level: "degraded",
    note: "Markdown has no button.",
    fallback: "a link",
  },
  callout: {
    level: "degraded",
    note: "Markdown has no callout.",
    fallback: "a blockquote led by the callout's emoji",
  },
  code: NATIVE,
  heading: NATIVE,
  horizontalRule: NATIVE,
  iframe: MARKDOWN_LINK,
  image: NATIVE,
  imageCarousel: {
    level: "degraded",
    note: "Markdown has no carousel.",
    fallback: "the images one after another",
  },
  imageDiff: {
    level: "degraded",
    note: "Markdown has no before/after comparison.",
    fallback: "the two images one after another, labelled in their alt text",
  },
  imageGrid: {
    level: "degraded",
    note: "Markdown has no image grid.",
    fallback: "the images one after another",
  },
  "leaflet.pageEmbed": FLATTEN_PAGE_EMBED,
  "leaflet.poll": POLL_UNSUPPORTED,
  "leaflet.separator": SEPARATOR_TO_RULE,
  "leaflet.signup": SIGNUP_UNSUPPORTED,
  "leaflet.standardSitePost": STANDARD_SITE_EMBED_UNSUPPORTED,
  "leaflet.standardSitePublication": STANDARD_SITE_EMBED_UNSUPPORTED,
  math: {
    level: "degraded",
    note:
      "Markdown carries LaTeX only as text; readers without the latex " +
      "extension show the source verbatim.",
    fallback: "a $$…$$ block, with `latex` declared in the record's extensions",
  },
  "offprint.component": OFFPRINT_COMPONENT_UNSUPPORTED,
  orderedList: NATIVE,
  paragraph: NATIVE,
  "pckt.gallery": PCKT_GALLERY_UNSUPPORTED,
  "pckt.noteEmbed": PCKT_NOTE_UNSUPPORTED,
  table: NATIVE,
  taskList: NATIVE,
  unknown: UNKNOWN_BLOCK,
  website: {
    level: "degraded",
    note: "Markdown has no bookmark card.",
    fallback: "a link using the bookmark's title",
  },
};

export const BLOCK_SUPPORT: Record<
  ConversionTarget,
  Record<BlockType, BlockSupport>
> = {
  leaflet: LEAFLET,
  markpub: MARKPUB,
  offprint: OFFPRINT,
  pckt: PCKT,
};

export function blockSupport(
  target: ConversionTarget,
  blockType: BlockType,
): BlockSupport {
  return BLOCK_SUPPORT[target][blockType];
}

/**
 * Whether a target can carry Leaflet's inline footnotes.
 *
 * Only Leaflet has a real footnote facet. Markdown can express GFM footnotes,
 * but Markpub's own parser reads them back as plain text, so it counts as
 * degraded rather than native.
 */
export const FOOTNOTE_SUPPORT: Record<
  ConversionTarget,
  "native" | "degraded" | "none"
> = {
  leaflet: "native",
  markpub: "degraded",
  offprint: "none",
  pckt: "none",
};
