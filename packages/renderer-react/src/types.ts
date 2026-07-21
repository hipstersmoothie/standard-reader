import type { ReactNode } from "react";

/**
 * A Standard Site document, as supplied to {@link StandardDocumentRenderer}.
 *
 * `content` is the raw content-union payload of a `site.standard.document`
 * record (the object whose `$type` names the content format, e.g.
 * `pub.leaflet.content`, `blog.pckt.content`, `app.offprint.content`, …). The
 * renderer reads the format from `content.$type`, falling back to
 * `contentFormat` when the payload has no inline `$type`.
 */
export interface StandardSiteDocument {
  /** The content-union payload (the `contentJson` of a document record). */
  content: unknown;
  /** Explicit content format `$type`, used when `content.$type` is absent. */
  contentFormat?: string | null;
  /**
   * DID of the repo that hosts the document's image blobs. Required to build
   * image URLs for blob-backed images; images with an external `https` source
   * render without it.
   */
  authorDid?: string;
  /**
   * The document's header description. When the body's first block is a heading
   * whose text exactly matches this, that heading is dropped (it would
   * duplicate the header shown by the surrounding chrome).
   */
  description?: string | null;
}

/** Width ÷ height of an image, or `undefined` when unknown (defaults to 16∶9). */
export type AspectRatio = number;

/** How to turn a blob ref + author DID into an image URL. */
export type ImageUrlResolver = (input: {
  /** Raw blob ref from the record, when the image is blob-backed. */
  blob?: unknown;
  /** External `https` source, when the image is not blob-backed. */
  externalSrc?: string;
  /** DID of the blob-hosting repo (`StandardSiteDocument.authorDid`). */
  authorDid?: string;
}) => string | null;

/** Rendering options, independent of which components are used. */
export interface RendererOptions {
  /**
   * Render a drop cap on the first paragraph of the body. Passed through to the
   * shared `Paragraph` component as its `dropCap` prop. Defaults to `false`.
   */
  dropCap?: boolean;
  /**
   * Drop the document's leading image block (e.g. when a hero image is already
   * shown above the body). Defaults to `false`.
   */
  skipLeadingImage?: boolean;
  /**
   * Override how blob refs become image URLs. Defaults to the Bluesky CDN
   * builder, which serves any PDS blob by `(did, cid)`.
   */
  resolveImageUrl?: ImageUrlResolver;
}

/** A single cell in a rendered table. */
export interface TableCell {
  header: boolean;
  children: ReactNode;
}

/** A rendered table row. */
export type TableRow = Array<TableCell>;
