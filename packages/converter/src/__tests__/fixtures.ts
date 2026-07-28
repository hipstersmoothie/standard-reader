/** Minimal record payloads in each source format, for the conversion tests. */

export const AUTHOR_DID = "did:plc:testauthor";

export const BLOB = {
  $type: "blob",
  mimeType: "image/png",
  ref: { $link: "bafkreiimageblobcid" },
  size: 1234,
};

// ---------------------------------------------------------------------------
// Leaflet
// ---------------------------------------------------------------------------

export function leafletContent(blocks: Array<Record<string, unknown>>) {
  return {
    $type: "pub.leaflet.content",
    pages: [
      {
        $type: "pub.leaflet.pages.linearDocument",
        blocks: blocks.map((block) => ({
          $type: "pub.leaflet.pages.linearDocument#block",
          block,
        })),
      },
    ],
  };
}

export const lf = {
  bskyPost: (uri: string, cid?: string) => ({
    $type: "pub.leaflet.blocks.bskyPost",
    postRef: cid ? { cid, uri } : { uri },
  }),
  code: (plaintext: string, language?: string) => ({
    $type: "pub.leaflet.blocks.code",
    plaintext,
    ...(language ? { language } : {}),
  }),
  header: (plaintext: string, level = 2) => ({
    $type: "pub.leaflet.blocks.header",
    level,
    plaintext,
  }),
  html: (html: string, height?: number) => ({
    $type: "pub.leaflet.blocks.html",
    html,
    ...(height == null ? {} : { height }),
  }),
  image: (alt = "", aspectRatio?: { width: number; height: number }) => ({
    $type: "pub.leaflet.blocks.image",
    alt,
    image: BLOB,
    ...(aspectRatio ? { aspectRatio } : {}),
  }),
  math: (tex: string) => ({ $type: "pub.leaflet.blocks.math", tex }),
  poll: (uri: string) => ({
    $type: "pub.leaflet.blocks.poll",
    pollRef: { cid: "bafypoll", uri },
  }),
  text: (plaintext: string, facets?: Array<unknown>) => ({
    $type: "pub.leaflet.blocks.text",
    plaintext,
    ...(facets ? { facets } : {}),
  }),
  unorderedList: (children: Array<Record<string, unknown>>) => ({
    $type: "pub.leaflet.blocks.unorderedList",
    children,
  }),
  listItem: (plaintext: string, nested?: Array<Record<string, unknown>>) => ({
    $type: "pub.leaflet.blocks.unorderedList#listItem",
    content: { $type: "pub.leaflet.blocks.text", plaintext },
    ...(nested
      ? {
          unorderedListChildren: {
            $type: "pub.leaflet.blocks.unorderedList",
            children: nested,
          },
        }
      : {}),
  }),
};

/** A byte-range facet with the given feature `$type`s over the whole string. */
export function facet(
  byteStart: number,
  byteEnd: number,
  ...features: Array<Record<string, unknown>>
) {
  return { features, index: { byteEnd, byteStart } };
}

export const leafletFacet = (
  kind: string,
  extra?: Record<string, unknown>,
) => ({
  $type: `pub.leaflet.richtext.facet#${kind}`,
  ...extra,
});

// ---------------------------------------------------------------------------
// pckt
// ---------------------------------------------------------------------------

export function pcktContent(items: Array<Record<string, unknown>>) {
  return { $type: "blog.pckt.content", items };
}

export const pk = {
  heading: (plaintext: string, level = 2) => ({
    $type: "blog.pckt.block.heading",
    level,
    plaintext,
  }),
  table: (rows: Array<Array<{ header?: boolean; text: string }>>) => ({
    $type: "blog.pckt.block.table",
    content: rows.map((row) => ({
      $type: "blog.pckt.block.tableRow",
      content: row.map((cell) => ({
        $type: cell.header
          ? "blog.pckt.block.tableHeader"
          : "blog.pckt.block.tableCell",
        content: [{ $type: "blog.pckt.block.text", plaintext: cell.text }],
      })),
    })),
  }),
  taskList: (items: Array<{ checked: boolean; text: string }>) => ({
    $type: "blog.pckt.block.taskList",
    content: items.map((item) => ({
      $type: "blog.pckt.block.taskItem",
      attrs: { checked: item.checked },
      content: [{ $type: "blog.pckt.block.text", plaintext: item.text }],
    })),
  }),
  text: (plaintext: string, facets?: Array<unknown>) => ({
    $type: "blog.pckt.block.text",
    plaintext,
    ...(facets ? { facets } : {}),
  }),
  gallery: (ref: string) => ({ $type: "blog.pckt.block.gallery", ref }),
};

export const pcktFacet = (kind: string, extra?: Record<string, unknown>) => ({
  $type: `blog.pckt.richtext.facet#${kind}`,
  ...extra,
});

// ---------------------------------------------------------------------------
// Offprint
// ---------------------------------------------------------------------------

export function offprintContent(items: Array<Record<string, unknown>>) {
  return { $type: "app.offprint.content", items };
}

export const op = {
  callout: (plaintext: string, emoji?: string, color?: string) => ({
    $type: "app.offprint.block.callout",
    plaintext,
    ...(emoji ? { emoji } : {}),
    ...(color ? { color } : {}),
  }),
  component: (component: string) => ({
    $type: "app.offprint.block.component",
    component,
  }),
  imageGrid: (count: number, caption?: string) => ({
    $type: "app.offprint.block.imageGrid",
    images: Array.from({ length: count }, (_, index) => ({
      alt: `image ${index + 1}`,
      blob: BLOB,
    })),
    ...(caption ? { caption } : {}),
  }),
  text: (plaintext: string, facets?: Array<unknown>) => ({
    $type: "app.offprint.block.text",
    plaintext,
    ...(facets ? { facets } : {}),
  }),
};

// ---------------------------------------------------------------------------
// Markpub
// ---------------------------------------------------------------------------

export function markpubContent(markdown: string, flavor = "gfm") {
  return {
    $type: "at.markpub.markdown",
    flavor,
    text: { $type: "at.markpub.text", markdown },
  };
}
