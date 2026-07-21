/**
 * A Standard Site document, as supplied to the renderers.
 *
 * `content` is the raw content-union payload of a `site.standard.document`
 * record (the object whose `$type` names the content format). The format is
 * read from `content.$type`, falling back to `contentFormat`.
 */
export interface StandardSiteDocument {
  /** The content-union payload (the `contentJson` of a document record). */
  content: unknown;
  /** Explicit content format `$type`, used when `content.$type` is absent. */
  contentFormat?: string | null;
  /** DID of the repo that hosts the document's image blobs. */
  authorDid?: string;
  /** Header description; a leading heading matching it is dropped as a dupe. */
  description?: string | null;
}

/** Width ÷ height of an image (defaults to 16∶9 when unknown). */
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

/** Options that shape the render tree, independent of any UI framework. */
export interface RendererOptions {
  /** Flag the body's first paragraph so renderers can add a drop cap. */
  dropCap?: boolean;
  /** Drop the document's leading image block (e.g. a hero shown separately). */
  skipLeadingImage?: boolean;
  /** Override how blob refs become image URLs (defaults to the Bluesky CDN). */
  resolveImageUrl?: ImageUrlResolver;
}
