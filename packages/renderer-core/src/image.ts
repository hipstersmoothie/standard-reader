import { blobCid, cdnImageUrl } from "./atproto/blob";
import { structuredImageAspectRatio } from "./document/structured-content/image";
import type { StructuredGridImage } from "./document/structured-content/types";
import type { CollectionImage } from "./nodes";
import type { ImageUrlResolver } from "./types";

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
  if (externalSrc && /^https?:\/\//i.test(externalSrc)) return externalSrc;
  if (!authorDid) return null;
  const cid = blobCid(blob as Parameters<typeof blobCid>[0]);
  if (!cid) return null;
  return cdnImageUrl(authorDid, cid, "png");
};

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
      },
    ];
  });
}
