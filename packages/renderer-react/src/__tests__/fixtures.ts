import type { StandardSiteDocument } from "../types";

export const AUTHOR_DID = "did:plc:testauthor";

// ---------------------------------------------------------------------------
// Leaflet
// ---------------------------------------------------------------------------

export function leafletDoc(
  blocks: Array<Record<string, unknown>>,
  extra?: Partial<StandardSiteDocument>,
): StandardSiteDocument {
  return {
    content: {
      $type: "pub.leaflet.content",
      pages: [
        {
          $type: "pub.leaflet.pages.linearDocument",
          id: "page-1",
          blocks,
        },
      ],
    },
    authorDid: AUTHOR_DID,
    ...extra,
  };
}

export const leaflet = {
  text: (plaintext: string, facets?: Array<unknown>) => ({
    $type: "pub.leaflet.blocks.text",
    plaintext,
    ...(facets ? { facets } : {}),
  }),
  header: (plaintext: string, level = 2) => ({
    $type: "pub.leaflet.blocks.header",
    level,
    plaintext,
  }),
  blockquote: (plaintext: string) => ({
    $type: "pub.leaflet.blocks.blockquote",
    plaintext,
  }),
  code: (plaintext: string, language?: string) => ({
    $type: "pub.leaflet.blocks.code",
    plaintext,
    ...(language ? { language } : {}),
  }),
  horizontalRule: () => ({ $type: "pub.leaflet.blocks.horizontalRule" }),
  separator: () => ({ $type: "pub.leaflet.blocks.separator" }),
  signup: () => ({ $type: "pub.leaflet.blocks.signup" }),
  image: (
    cid: string,
    alt = "",
    aspectRatio?: { width: number; height: number },
  ) => ({
    $type: "pub.leaflet.blocks.image",
    image: { ref: { $link: cid }, mimeType: "image/png" },
    alt,
    ...(aspectRatio ? { aspectRatio } : {}),
  }),
  poll: (uri: string) => ({
    $type: "pub.leaflet.blocks.poll",
    pollRef: { uri },
  }),
  standardSitePublication: (uri: string) => ({
    $type: "pub.leaflet.blocks.standardSitePublication",
    uri,
  }),
  unorderedList: (items: Array<string>) => ({
    $type: "pub.leaflet.blocks.unorderedList",
    children: items.map((plaintext) => ({
      $type: "pub.leaflet.blocks.unorderedList#listItem",
      content: { $type: "pub.leaflet.blocks.text", plaintext },
    })),
  }),
  orderedList: (items: Array<string>, startIndex?: number) => ({
    $type: "pub.leaflet.blocks.orderedList",
    ...(startIndex != null ? { startIndex } : {}),
    children: items.map((plaintext) => ({
      $type: "pub.leaflet.blocks.orderedList#listItem",
      content: { $type: "pub.leaflet.blocks.text", plaintext },
    })),
  }),
};

/** A leaflet facet feature (byte-indexed). */
export function facet(
  byteStart: number,
  byteEnd: number,
  ...features: Array<Record<string, unknown>>
) {
  return { index: { byteStart, byteEnd }, features };
}

export const LEAFLET_FACETS = {
  bold: { $type: "pub.leaflet.richtext.facet#bold" },
  italic: { $type: "pub.leaflet.richtext.facet#italic" },
  code: { $type: "pub.leaflet.richtext.facet#code" },
  link: (uri: string) => ({ $type: "pub.leaflet.richtext.facet#link", uri }),
  didMention: (did: string) => ({
    $type: "pub.leaflet.richtext.facet#didMention",
    did,
  }),
  footnote: (footnoteId: string, contentPlaintext: string) => ({
    $type: "pub.leaflet.richtext.facet#footnote",
    footnoteId,
    contentPlaintext,
  }),
};

// ---------------------------------------------------------------------------
// pckt
// ---------------------------------------------------------------------------

export function pcktDoc(
  items: Array<Record<string, unknown>>,
  extra?: Partial<StandardSiteDocument>,
): StandardSiteDocument {
  return {
    content: { $type: "blog.pckt.content", items },
    authorDid: AUTHOR_DID,
    ...extra,
  };
}

export const pckt = {
  text: (plaintext: string, facets?: Array<unknown>) => ({
    $type: "blog.pckt.block.text",
    plaintext,
    ...(facets ? { facets } : {}),
  }),
  heading: (plaintext: string, level = 2) => ({
    $type: "blog.pckt.block.heading",
    level,
    plaintext,
  }),
  code: (plaintext: string, language?: string) => ({
    $type: "blog.pckt.block.codeBlock",
    plaintext,
    ...(language ? { language } : {}),
  }),
  bulletList: (items: Array<string>) => ({
    $type: "blog.pckt.block.bulletList",
    content: items.map((plaintext) => ({
      $type: "blog.pckt.block.listItem",
      content: [{ $type: "blog.pckt.block.text", plaintext }],
    })),
  }),
  gallery: (ref: string) => ({ $type: "blog.pckt.block.gallery", ref }),
};

// ---------------------------------------------------------------------------
// Offprint
// ---------------------------------------------------------------------------

export function offprintDoc(
  items: Array<Record<string, unknown>>,
  extra?: Partial<StandardSiteDocument>,
): StandardSiteDocument {
  return {
    content: { $type: "app.offprint.content", items },
    authorDid: AUTHOR_DID,
    ...extra,
  };
}

export const offprint = {
  text: (plaintext: string, facets?: Array<unknown>) => ({
    $type: "app.offprint.block.text",
    plaintext,
    ...(facets ? { facets } : {}),
  }),
  heading: (plaintext: string, level = 2) => ({
    $type: "app.offprint.block.heading",
    level,
    plaintext,
  }),
  callout: (plaintext: string, emoji?: string) => ({
    $type: "app.offprint.block.callout",
    plaintext,
    ...(emoji ? { emoji } : {}),
  }),
  component: (component: string) => ({
    $type: "app.offprint.block.component",
    component,
  }),
};
