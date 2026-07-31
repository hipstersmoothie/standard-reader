import { structuredImageAspectRatio } from "./document/structured-content/image.js";
import type { StructuredGridImage } from "./document/structured-content/types.js";
import { blobImageUrl, externalHttpUrl } from "./internal.js";
import type { CollectionImage, ImageSource } from "./nodes.js";
import type { ImageUrlResolver } from "./types.js";

/**
 * The default image URL resolver: pass through absolute `https` sources, and
 * build a Bluesky CDN URL from a blob CID + the document's author DID. PNG is
 * requested to preserve alpha, matching the app. The CDN serves any PDS blob by
 * `(did, cid)`.
 */
export const defaultImageUrlResolver: ImageUrlResolver = ({
  blob,
  externalSrc,
  authorDid,
}) => {
  const external = externalHttpUrl(externalSrc);
  if (external) return external;
  if (!authorDid) return null;
  return blobImageUrl(blob, authorDid);
};

/** The record-level source of a grid image, for format-to-format conversion. */
function gridImageSource(image: StructuredGridImage): ImageSource {
  const source: ImageSource = {};
  if (image.blob != null) source.blob = image.blob;
  const { width, height } = image.aspectRatio ?? {};
  if (width != null && height != null) source.aspectRatio = { width, height };
  return source;
}

/** Resolve a list of structured grid images to renderable collection images. */
export function resolveGridImages(
  images: Array<StructuredGridImage>,
  resolve: ImageUrlResolver,
  authorDid: string | undefined,
): Array<CollectionImage> {
  return images.flatMap((image) => {
    const src = resolve({ blob: image.blob, authorDid });
    if (!src) return [];
    return [
      {
        src,
        alt: image.alt ?? "",
        aspectRatio: structuredImageAspectRatio(image),
        source: gridImageSource(image),
      },
    ];
  });
}
